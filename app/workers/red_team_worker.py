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
        {'$set': {'state': 'running', 'execution_phase': 'response_persisted' if job.get('prepared_result') else 'claimed',
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
        'protected_run_id': ObjectId(result['protected_run_id']) if result.get('protected_run_id') else None}
    if response is not None and not withheld:
        changes['response_ciphertext'] = encrypt(response)
        changes['response_hash'] = sha256(response.encode()).hexdigest()
    updated = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
        'state': 'running', 'execution_lease_token': lease_token}, {'$set': changes})
    if updated.matched_count != 1:
        raise RuntimeError('execution_lease_lost')
    return {**job, **changes}


def _finalize(db, test, job, lease_token, verdict, reason, explanation, error_code=None):
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
                    if status and score({**parent, 'status': status}, jobs)['threshold_verdict'] == 'below_threshold':
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
                  'execution_phase': 'retry_wait', 'error_code': reason},
         '$inc': {'dispatch_generation': 1},
         '$unset': {'execution_lease_token': '', 'execution_lease_expires_at': ''}})


def process_job(db, job_id, test_id, generation, provider=None):
    """Return only after durable state; delivery can then be acknowledged."""
    provider = provider if provider is not None else ProviderService()
    job = db.red_team_jobs.find_one({'_id': ObjectId(job_id), 'test_id': ObjectId(test_id)})
    if not job or job['dispatch_generation'] != generation or job['state'] in {'finished', 'cancelled'}:
        return 'noop'
    test = db.red_team_tests.find_one({'_id': job['test_id'], 'company_id': job['company_id']})
    if not test:
        return 'noop'
    claimed = _claim(db, job, generation)
    if not claimed:
        return 'noop'
    job = claimed
    token = job['execution_lease_token']
    if test.get('cancel_requested_at') or test['status'] in {'cancelling', 'cancelled'}:
        _finalize(db, test, job, token, 'error', 'cancelled', 'Test was cancelled.')
        return 'cancelled'
    company, creator, subject, target = _authority(db, test)
    if not company or not creator or not subject or not target or test['model'] not in target.get('models', []):
        _system_cancel(db, test, 'authority_or_target_revoked')
        _finalize(db, test, job, token, 'error', 'cancelled', 'Test authority or target is unavailable.')
        return 'cancelled'
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
        if job.get('execution_phase') == 'response_persisted' and job.get('prepared_result'):
            prepared = job
        else:
            try:
                if test['mode'] == 'raw':
                    response = _raw(db, test, job, target, admission_token, token, provider)
                else:
                    response = _protected(db, test, job, subject, admission_token, token, provider)
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
        content = None if prepared.get('response_withheld') else decrypt(prepared.get('response_ciphertext'))
        verdict, reason, explanation = evaluate(prepared, response=content,
            protected_run={**prepared['prepared_result'], 'response_text': content}
            if test['mode'] == 'protected' else None)
        _finalize(db, test, prepared, token, verdict, reason, explanation,
                  prepared['prepared_result'].get('error_code') if verdict == 'error' else None)
        return verdict
    finally:
        stop.set()
        keeper.join(timeout=1)
        admission.release(test['company_id'], test['integration_id'], admission_token)
        heartbeat(db)


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
