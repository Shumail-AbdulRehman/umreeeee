"""At-least-once Rabbit delivery with Mongo lease fencing and one recorded outcome."""
from datetime import timedelta
from hashlib import sha256
import json
import logging
from random import uniform
from threading import Event, Thread
from types import SimpleNamespace
from uuid import NAMESPACE_URL, uuid4, uuid5

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.core.config import RED_TEAM_EXECUTION_LEASE_SECONDS, RED_TEAM_MAX_ATTEMPTS, RED_TEAM_QUEUE_NAME
from app.db.mongo import get_database
from app.queue.rabbit import connection, declare
from app.red_team.evaluators import evaluate
from app.red_team.evidence import grade
from app.red_team.judge import build_request, parse_reply, RUBRIC_VERSION
from app.services.red_team_report_v3 import build_report
from app.schemas.prompts import PromptRunExecuteRequest
from app.services.admin_common import utcnow
from app.services.content_service import encrypt, decrypt
from app.services.cost_service import estimate_result_cost
from app.services.integration_admission import IntegrationAdmission, AdmissionUnavailable
from app.services.protected_prompt_service import ProtectedPromptService, RunOutcome
from app.services.provider_service import ProviderService, ProviderError
from app.services.red_team_report_service import score, terminal_status


logger = logging.getLogger(__name__)


class AuthorityRevoked(Exception):
    """A previously authorized test lost its right to dispatch a provider call."""


def heartbeat(db):
    now = utcnow()
    db.worker_heartbeats.update_one({'kind': 'worker'}, {'$set': {'kind': 'worker',
        'updated_at': now, 'expires_at': now + timedelta(minutes=3)}}, upsert=True)


def _authority(db, test):
    company = db.companies.find_one({'_id': test['company_id'], 'status': 'active'})
    creator = db.users.find_one({'_id': test['created_by'], 'company_id': test['company_id'],
        'is_active': True, 'is_email_verified': True, 'role': {'$in': ['org_admin', 'super_admin']}})
    subject = db.users.find_one({'_id': test['subject_user_id'], 'company_id': test['company_id'],
        'is_active': True, 'is_email_verified': True})
    target = db.integrations.find_one({'_id': test['integration_id'], 'company_id': test['company_id'],
        'status': 'active'})
    return company, creator, subject, target


def _system_cancel(db, test, reason):
    now = utcnow()
    db.red_team_tests.update_one({'_id': test['_id'], 'company_id': test['company_id'],
        'status': {'$in': ['queued', 'running']}},
        {'$set': {'status': 'cancelling', 'cancel_requested_at': now,
                  'cancel_reason_code': reason, 'updated_at': now}, '$inc': {'execution_revision': 1}})
    db.red_team_jobs.update_many({'company_id': test['company_id'], 'test_id': test['_id'],
        'state': {'$in': ['pending', 'queued', 'retry_wait']}},
        {'$set': {'state': 'cancelled', 'finished_at': now, 'response_withheld': True}})


def _claim(db, job, generation):
    now = utcnow()
    token = str(uuid4())
    return db.red_team_jobs.find_one_and_update({'_id': job['_id'], 'company_id': job['company_id'],
        'test_id': job['test_id'], 'dispatch_generation': generation,
        'state': {'$in': ['pending', 'queued', 'retry_wait']},
        '$or': [{'execution_lease_expires_at': {'$exists': False}},
                {'execution_lease_expires_at': {'$lte': now}}]},
        {'$set': {'state': 'running', 'execution_phase': ('judging' if job.get('execution_phase') == 'judging' else 'response_persisted') if job.get('prepared_result') else 'claimed',
            'execution_lease_token': token,
            'execution_lease_expires_at': now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS),
            'started_at': job.get('started_at') or now}}, return_document=ReturnDocument.AFTER)


def _keep_alive(db, job, lease_token, admission_token, stop):
    admission = IntegrationAdmission(db)
    while not stop.wait(10):
        now = utcnow()
        updated = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
            'execution_lease_token': lease_token, 'state': 'running'},
            {'$set': {'execution_lease_expires_at': now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS)}})
        if not updated.matched_count:
            return
        admission.heartbeat(job['company_id'], job['integration_id'], admission_token,
                            RED_TEAM_EXECUTION_LEASE_SECONDS)
        heartbeat(db)


def _mark_dispatch(db, test, job, lease_token):
    latest = db.red_team_tests.find_one({'_id': test['_id'], 'company_id': test['company_id']})
    if not latest or latest.get('cancel_requested_at') or latest['status'] not in {'queued', 'running'}:
        raise AuthorityRevoked()
    company, creator, subject, target = _authority(db, latest)
    if not all((company, creator, subject, target)) or latest['model'] not in target.get('models', []):
        raise AuthorityRevoked()
    now = utcnow()
    updated = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
        'state': 'running', 'execution_lease_token': lease_token},
        {'$set': {'execution_phase': 'calling_provider', 'provider_called_at': now},
         '$inc': {'attempt_number': 1},
         '$push': {'attempt_history': {'$each': [{'at': now, 'phase': 'provider_dispatch'}], '$slice': -3}}})
    if updated.matched_count != 1:
        raise RuntimeError('execution_lease_lost')


def _raw(db, test, job, target, admission_token, lease_token, provider):
    snapshot = test['config_snapshot']
    payload = PromptRunExecuteRequest(integration_id=str(test['integration_id']), model=test['model'],
        prompt=job['prompt'], temperature=snapshot['temperature'], max_tokens=snapshot['max_tokens'])
    local_target = {**target, 'system_prompt': snapshot['system_instruction'] + '\n\n' + job['scenario_system']}
    _mark_dispatch(db, test, job, lease_token)
    if isinstance(provider, ProviderService):
        result = provider.execute(local_target, payload, str(job['_id']),
            (db, test['company_id'], test['integration_id'], admission_token))
    else:
        result = provider.execute(local_target, payload, str(job['_id']))
    return {'status': 'allowed', 'response_text': result.response_text,
        'response_length': len(result.response_text), 'provider_latency_ms': result.provider_latency_ms,
        'prompt_tokens': result.prompt_tokens, 'completion_tokens': result.completion_tokens,
        'total_tokens': result.total_tokens, 'provider_request_id': result.provider_request_id,
        **estimate_result_cost(test['model'], snapshot.get('price_snapshot', []),
                               snapshot['provider'], result)}


def _protected(db, test, job, subject, admission_token, lease_token, provider):
    snapshot = test['config_snapshot']
    payload = PromptRunExecuteRequest(integration_id=str(test['integration_id']), model=test['model'],
        prompt=job['prompt'], temperature=snapshot['temperature'], max_tokens=snapshot['max_tokens'])
    context = SimpleNamespace(id=str(subject['_id']), role=subject['role'],
        token_version=subject.get('token_version', 0), group_ids=subject.get('group_ids', []),
        company=SimpleNamespace(id=str(test['company_id'])))
    planned_attempt = job.get('attempt_number', 0) + 1
    key = str(uuid5(NAMESPACE_URL, f'{test["_id"]}:{job["_id"]}:{planned_attempt}'))
    identity = {'source': 'red_team', 'key': key, 'request_id': str(job['_id']),
        'snapshot': snapshot, 'scenario_system': job['scenario_system'],
        'admission_token': admission_token,
        'on_provider_dispatch': lambda: _mark_dispatch(db, test, job, lease_token)}
    try:
        run = ProtectedPromptService(db, provider).execute_protected(context, payload, identity)['run']
    except RunOutcome as outcome:
        run = outcome.run
    return {**run, 'protected_run_id': run['id']}


def _prepared(db, test, job, lease_token, result):
    now = utcnow()
    company = db.companies.find_one({'_id': test['company_id']}, {'settings.content_retention_days': 1}) or {}
    days = company.get('settings', {}).get('content_retention_days', 7)
    response = result.get('response_text')
    withheld = result.get('response_withheld') or result.get('status') in {'blocked_output', 'validation_error'}
    stored = {'status': result.get('status'), 'error_code': result.get('error_code'),
        'input_evaluation': result.get('input_evaluation'), 'output_evaluation': result.get('output_evaluation')}
    changes = {'execution_phase': 'response_persisted', 'prepared_result': stored,
        'response_length': result.get('response_length', result.get('output_length')),
        'response_withheld': bool(withheld), 'content_expires_at': now + timedelta(days=days),
        'provider_latency_ms': result.get('provider_latency_ms'),
        'prompt_tokens': result.get('prompt_tokens'), 'completion_tokens': result.get('completion_tokens'),
        'total_tokens': result.get('total_tokens'), 'estimated_cost_usd': result.get('estimated_cost_usd'),
        'cost_status': result.get('cost_status'), 'cost_source': result.get('cost_source'),
        'pricing_snapshot': result.get('pricing_snapshot'), 'provider_request_id': result.get('provider_request_id'),
        'prevention_stage': result.get('prevention_stage') or ({'blocked_input': 'input', 'blocked_output': 'output'}.get(result.get('status'))),
        'protected_run_id': ObjectId(result['protected_run_id']) if result.get('protected_run_id') else None}
    if response is not None and not withheld:
        changes['response_ciphertext'] = encrypt(response)
        changes['response_hash'] = sha256(response.encode()).hexdigest()
    updated = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
        'state': 'running', 'execution_lease_token': lease_token}, {'$set': changes})
    if updated.matched_count != 1:
        raise RuntimeError('execution_lease_lost')
    return {**job, **changes}


def _below_threshold(test, jobs):
    if test.get('format') == 'plugins':
        return (build_report(test, jobs).get('threshold') or {}).get('verdict') == 'below_threshold'
    return score(test, jobs)['threshold_verdict'] == 'below_threshold'


def _finalize(db, test, job, lease_token, verdict, reason, explanation, error_code=None, grading=None):
    for attempt in range(3):
        try:
            with db.client.start_session() as session:
                with session.start_transaction():
                    parent = db.red_team_tests.find_one({'_id': test['_id'],
                        'company_id': test['company_id']}, session=session)
                    if not parent:
                        return False
                    cancelled = bool(parent.get('cancel_requested_at'))
                    changes = {'state': 'cancelled' if cancelled else 'finished',
                        'verdict': None if cancelled else verdict,
                        'verdict_reason_code': 'cancelled' if cancelled else reason,
                        'explanation': 'Cancelled before finalization.' if cancelled else explanation,
                        'error_code': error_code, 'finished_at': utcnow(), 'execution_phase': 'finished',
                        'possible_cost': error_code == 'execution_outcome_unknown',
                        'response_withheld': True if cancelled else job.get('response_withheld', False)}
                    if test.get('format') == 'plugins':
                        evidence = grading or grade(job, error_code=error_code or reason)
                        changes.update({'verdict_source': 'none' if cancelled else evidence['verdict_source'],
                                        'evidence_steps': evidence['steps']})
                    result = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': test['company_id'],
                        'test_id': test['_id'], 'state': 'running', 'execution_lease_token': lease_token},
                        {'$set': changes, '$unset': {'execution_lease_token': '',
                            'execution_lease_expires_at': '', **({'response_ciphertext': ''} if cancelled else {})}},
                        session=session)
                    if result.matched_count != 1:
                        return False
                    jobs = list(db.red_team_jobs.find({'company_id': test['company_id'],
                        'test_id': test['_id']}, session=session))
                    status = terminal_status(parent, jobs)
                    parent_changes = {'updated_at': utcnow()}
                    if status:
                        parent_changes.update(status=status, finished_at=utcnow())
                    elif parent['status'] == 'queued':
                        parent_changes['status'] = 'running'
                    db.red_team_tests.update_one({'_id': test['_id'], 'company_id': test['company_id'],
                        'execution_revision': parent['execution_revision']},
                        {'$set': parent_changes, '$inc': {'execution_revision': 1}}, session=session)
                    if status and _below_threshold({**parent, 'status': status}, jobs):
                        recipients = db.users.find({'company_id': test['company_id'],
                            'role': {'$in': ['org_admin', 'super_admin']}, 'is_active': True,
                            'is_email_verified': True}, {'_id': 1}, session=session)
                        for recipient in recipients:
                            db.notifications.update_one({'company_id': test['company_id'],
                                'recipient_user_id': recipient['_id'], 'event_key': f'red_team_threshold:{test["_id"]}'},
                                {'$setOnInsert': {'company_id': test['company_id'],
                                    'recipient_user_id': recipient['_id'],
                                    'event_key': f'red_team_threshold:{test["_id"]}',
                                    'kind': 'red_team_threshold', 'title': 'Red-team score below threshold',
                                    'summary': 'A synthetic evaluation finished below its configured threshold.',
                                    'resource_type': 'red_team_test', 'resource_id': test['_id'],
                                    'created_at': utcnow(), 'read_at': None}}, upsert=True, session=session)
                    return True
        except PyMongoError as exc:
            if attempt == 2 or not exc.has_error_label('TransientTransactionError'):
                raise
    return False


def _retry(db, job, lease_token, seconds, reason):
    delay = min(60, max(1, seconds + uniform(0, 1)))
    db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
        'state': 'running', 'execution_lease_token': lease_token},
        {'$set': {'state': 'retry_wait', 'dispatch_state': 'pending',
                  'next_attempt_at': utcnow() + timedelta(seconds=delay),
                  'execution_phase': 'judging' if job.get('prepared_result') else 'retry_wait', 'error_code': reason},
         '$inc': {'dispatch_generation': 1},
         '$unset': {'execution_lease_token': '', 'execution_lease_expires_at': ''}})


def _judge_grading(evidence, judge):
    error = judge.get('error_code')
    verdict = {'unsafe': 'fail', 'defended': 'pass'}.get(judge.get('verdict'), 'inconclusive')
    decisive = verdict in {'pass', 'fail'} and not error
    reason = error or 'judge_' + judge['verdict']
    explanation = judge.get('reason') or 'The judge could not decide this result.'
    steps = [dict(step) for step in evidence['steps']]
    steps[-1] = {'step': 'judge', 'state': 'decisive' if decisive else 'undecided',
                 'description': explanation if decisive else reason}
    return {**evidence, 'verdict': verdict if decisive else 'inconclusive',
            'verdict_source': 'judge' if decisive else 'none', 'reason': reason,
            'explanation': explanation, 'steps': steps, 'needs_judge': False}


def _judge(db, test, job, token, content, evidence, provider):
    """Target response is durable. Only this bounded phase may be retried."""
    snapshot = test['config_snapshot']['judge']
    prior = job.get('judge') or {}
    fence = {'_id': job['_id'], 'company_id': job['company_id'],
             'state': 'running', 'execution_lease_token': token}

    def store(judge):
        if db.red_team_jobs.update_one(fence, {'$set': {'judge': judge}}).matched_count != 1:
            raise RuntimeError('execution_lease_lost')
        job['judge'] = judge
        return _judge_grading(evidence, judge)

    def unavailable(code):
        return store({**prior, 'model': snapshot['model'], 'rubric_version': RUBRIC_VERSION,
                      'verdict': 'inconclusive', 'reason': '', 'error_code': code,
                      'attempts': prior.get('attempts', 0), 'completed': True})

    if prior.get('completed'):
        return _judge_grading(evidence, prior)
    if prior.get('attempts', 0) >= 2:
        return unavailable('judge_attempts_exhausted')
    if db.red_team_jobs.update_one(fence, {'$set': {'execution_phase': 'judging',
            'verdict_source': 'none', 'evidence_steps': evidence['steps']}}).matched_count != 1:
        raise RuntimeError('execution_lease_lost')
    judge_id = snapshot['integration_id']
    def active_judge():
        return db.integrations.find_one({'_id': judge_id, 'company_id': test['company_id'],
            'status': 'active', 'models': snapshot['model']})
    integration = active_judge()
    if not integration:
        return unavailable('judge_unavailable')
    admission = IntegrationAdmission(db)
    try:
        admission_token = admission.acquire(test['company_id'], judge_id,
            f'red_team_judge:{job["_id"]}', RED_TEAM_EXECUTION_LEASE_SECONDS)
    except AdmissionUnavailable as exc:
        _retry(db, job, token, exc.retry_after, 'judge_integration_busy')
        return None
    stop = Event()
    keeper = Thread(target=_keep_alive, args=(db, {**job, 'integration_id': judge_id},
        token, admission_token, stop), daemon=True)
    keeper.start()
    try:
        latest = db.red_team_tests.find_one({'_id': test['_id'], 'company_id': test['company_id']})
        if not latest or latest.get('cancel_requested_at'):
            return evidence  # _finalize rechecks cancellation transactionally
        if not all(_authority(db, latest)):
            _system_cancel(db, test, 'authority_or_target_revoked')
            return evidence
        if not active_judge() or not admission.verify(test['company_id'], judge_id, admission_token):
            return unavailable('judge_unavailable')
        request = build_request(job['plugin_id'], job['scenario_system'], job['prompt'], content)
        payload = PromptRunExecuteRequest(integration_id=str(judge_id), model=snapshot['model'],
            prompt=request['prompt'], temperature=0, max_tokens=512)
        prior = {**prior, 'attempts': prior.get('attempts', 0) + 1, 'model': snapshot['model'],
                 'rubric_version': request['rubric_version'], 'completed': False}
        if db.red_team_jobs.update_one(fence, {'$set': {'judge': prior}}).matched_count != 1:
            raise RuntimeError('execution_lease_lost')
        local = {**integration, 'provider': snapshot['provider'], 'system_prompt': request['system']}
        try:
            result = provider.execute(local, payload, str(job['_id']) + ':judge',
                (db, test['company_id'], judge_id, admission_token)) if isinstance(provider, ProviderService) \
                else provider.execute(local, payload, str(job['_id']) + ':judge')
        except ProviderError as exc:
            if exc.code == 'rate_limited' and prior['attempts'] < 2:
                _retry(db, job, token, exc.retry_after or 2, 'judge_rate_limited')
                return None
            return unavailable('judge_' + exc.code)
        except Exception:
            return unavailable('judge_unavailable')
        parsed = parse_reply(result.response_text)
        cost = estimate_result_cost(snapshot['model'], snapshot.get('price_snapshot', []), snapshot['provider'], result)
        judge = {**prior, 'verdict': parsed['verdict'], 'reason': parsed['reason'],
                 'error_code': parsed['error'], 'latency_ms': result.provider_latency_ms,
                 'cost': cost['estimated_cost_usd'], **cost, 'completed': True}
        if not active_judge():
            judge.update(verdict='inconclusive', reason='', error_code='judge_unavailable')
        return store(judge)
    finally:
        stop.set()
        keeper.join(timeout=1)
        admission.release(test['company_id'], judge_id, admission_token)
        heartbeat(db)


def process_job(db, job_id, test_id, generation, provider=None):
    """Return only after durable state; delivery can then be acknowledged."""
    provider = provider if provider is not None else ProviderService()
    job = db.red_team_jobs.find_one({'_id': ObjectId(job_id), 'test_id': ObjectId(test_id)})
    if not job or job['dispatch_generation'] != generation or job['state'] in {'finished', 'cancelled'}:
        return 'noop'
    test = db.red_team_tests.find_one({'_id': job['test_id'], 'company_id': job['company_id']})
    if not test:
        return 'noop'
    job = _claim(db, job, generation)
    if not job:
        return 'noop'
    token = job['execution_lease_token']
    if test.get('cancel_requested_at') or test['status'] in {'cancelling', 'cancelled'}:
        _finalize(db, test, job, token, 'error', 'cancelled', 'Test was cancelled.')
        return 'cancelled'
    company, creator, subject, target = _authority(db, test)
    if not all((company, creator, subject, target)) or test['model'] not in target.get('models', []):
        _system_cancel(db, test, 'authority_or_target_revoked')
        _finalize(db, test, job, token, 'error', 'cancelled', 'Test authority or target is unavailable.')
        return 'cancelled'
    prepared = job if job.get('prepared_result') else None
    if not prepared:
        admission = IntegrationAdmission(db)
        try:
            admission_token = admission.acquire(test['company_id'], test['integration_id'],
                f'red_team:{job["_id"]}', RED_TEAM_EXECUTION_LEASE_SECONDS)
        except AdmissionUnavailable as exc:
            _retry(db, job, token, exc.retry_after, 'integration_busy')
            return 'rescheduled'
        stop = Event()
        keeper = Thread(target=_keep_alive, args=(db, {**job, 'integration_id': test['integration_id']},
            token, admission_token, stop), daemon=True)
        keeper.start()
        try:
            try:
                response = _raw(db, test, job, target, admission_token, token, provider) if test['mode'] == 'raw' \
                    else _protected(db, test, job, subject, admission_token, token, provider)
            except ProviderError as exc:
                if exc.code == 'rate_limited' and job.get('attempt_number', 0) + 1 < RED_TEAM_MAX_ATTEMPTS:
                    _retry(db, job, token, exc.retry_after or 2, 'rate_limited')
                    return 'rescheduled'
                _finalize(db, test, job, token, 'error', exc.code, exc.message, exc.code)
                return 'error'
            except AuthorityRevoked:
                _system_cancel(db, test, 'authority_or_target_revoked')
                _finalize(db, test, job, token, 'error', 'cancelled', 'Test authority or target is unavailable.')
                return 'cancelled'
            except Exception as exc:
                logger.warning('Red-team execution failed for job %s (%s)', job['_id'], type(exc).__name__)
                _finalize(db, test, job, token, 'error', 'execution_outcome_unknown',
                    'Execution outcome could not be confirmed; possible provider cost.', 'execution_outcome_unknown')
                return 'error'
            if response.get('status') == 'provider_error' and response.get('error_code') == 'rate_limited' \
                    and job.get('attempt_number', 0) + 1 < RED_TEAM_MAX_ATTEMPTS:
                _retry(db, job, token, 2 ** (job.get('attempt_number', 0) + 1), 'rate_limited')
                return 'rescheduled'
            prepared = _prepared(db, test, job, token, response)
        finally:
            stop.set()
            keeper.join(timeout=1)
            admission.release(test['company_id'], test['integration_id'], admission_token)
            heartbeat(db)
    expired = prepared.get('content_expired') or (prepared.get('content_expires_at') and prepared['content_expires_at'] <= utcnow())
    content = None if prepared.get('response_withheld') or expired else decrypt(prepared.get('response_ciphertext'))
    protected = {**prepared['prepared_result'], 'response_text': content} if test['mode'] == 'protected' else None
    if test.get('format') == 'plugins':
        evidence = grade(prepared, response=content, protected_run=protected,
                         error_code=prepared['prepared_result'].get('error_code'))
        if evidence['needs_judge'] and test['config_snapshot'].get('judge') and content is not None:
            evidence = _judge(db, test, prepared, token, content, evidence, provider)
            if evidence is None:
                return 'rescheduled'
        verdict, reason, explanation = evidence['verdict'], evidence['reason'], evidence['explanation']
    else:
        evidence = None
        verdict, reason, explanation = evaluate(prepared, response=content, protected_run=protected)
    _finalize(db, test, prepared, token, verdict, reason, explanation,
              prepared['prepared_result'].get('error_code') if verdict == 'error' else None, grading=evidence)
    heartbeat(db)
    return verdict


def main():
    import pika
    db = get_database()
    heartbeat_stop = Event()

    def pulse():
        while not heartbeat_stop.wait(15):
            try:
                heartbeat(db)
            except Exception:
                pass

    Thread(target=pulse, daemon=True).start()
    while True:
        try:
            conn = connection()
            channel = conn.channel()
            declare(channel)
            channel.basic_qos(prefetch_count=1)

            def on_message(ch, method, properties, body):
                delivery_tag = method.delivery_tag
                try:
                    message = json.loads(body)
                    if set(message) != {'v', 'job_id', 'test_id', 'generation'} or message['v'] != 1:
                        raise ValueError('invalid_message')
                    ObjectId(message['job_id']); ObjectId(message['test_id'])
                    if not isinstance(message['generation'], int) or message['generation'] < 1:
                        raise ValueError('invalid_message')
                except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                    # Publish malformed identifiers to an application-owned dead queue.
                    ch.basic_publish(exchange='', routing_key=RED_TEAM_QUEUE_NAME + '.dead',
                        body=b'{"reason":"invalid_message"}', properties=pika.BasicProperties(
                            delivery_mode=pika.DeliveryMode.Persistent, content_type='application/json'))
                    ch.basic_ack(delivery_tag=delivery_tag)
                    return

                def work():
                    try:
                        process_job(db, message['job_id'], message['test_id'], message['generation'])
                    except Exception as exc:
                        logger.warning('Worker will recover job %s (%s)', message['job_id'], type(exc).__name__)
                    finally:
                        conn.add_callback_threadsafe(lambda: ch.basic_ack(delivery_tag=delivery_tag))

                Thread(target=work, daemon=True).start()

            channel.basic_consume(queue=RED_TEAM_QUEUE_NAME,
                                  on_message_callback=on_message, auto_ack=False)
            heartbeat(db)
            channel.start_consuming()
        except KeyboardInterrupt:
            heartbeat_stop.set()
            break
        except Exception as exc:
            logger.warning('Worker reconnecting (%s)', type(exc).__name__)
            from time import sleep
            sleep(2)


if __name__ == '__main__':
    main()
