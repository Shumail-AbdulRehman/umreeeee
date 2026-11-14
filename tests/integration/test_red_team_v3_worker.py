"""Durable worker/judge tests with real Mongo leases and wholly fake providers."""
import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from bson import ObjectId

from app.queue.recovery import recover
from app.schemas.red_team import TestConfig as Config
from app.services.admin_common import utcnow
from app.services.content_service import decrypt
from app.services.integration_admission import IntegrationAdmission
from app.services.provider_service import ProviderService, ProviderResult, ProviderError
from app.workers.red_team_worker import process_job, _keep_alive
from tests.integration.test_red_team_flow import red_team  # noqa: F401

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


class SimulatedCrash(BaseException):
    pass


class FakeProvider(ProviderService):
    def __init__(self, db, target='ordinary synthetic reply', judge='{"verdict":"unsafe","reason":"Synthetic out of scope answer"}', on_judge=None):
        self.db, self.target, self.judge, self.on_judge = db, target, judge, on_judge
        self.target_calls = self.judge_calls = 0

    def execute(self, integration, payload, request_id, admission=None):
        assert admission is not None
        db, company, integration_id, lease = admission
        assert IntegrationAdmission(db).verify(company, integration_id, lease)
        job_id = request_id.split(':')[0]
        job = db.red_team_jobs.find_one({'_id': ObjectId(job_id)})
        if request_id.endswith(':judge'):
            self.judge_calls += 1
            assert job['execution_phase'] == 'judging'
            assert job['response_ciphertext'] and 'response_text' not in job
            assert 'untrusted data' in integration['system_prompt']
            assert payload.model == 'judge-model'
            if self.on_judge:
                self.on_judge(job, admission)
            text = self.judge(job) if callable(self.judge) else self.judge
        else:
            self.target_calls += 1
            text = self.target(job) if callable(self.target) else self.target
        return ProviderResult(text, 10, 5, 15, 'synthetic', 'stop', 3)


def launch_case(red_team, judge=True, mode='raw'):
    db, user, legacy, service = red_team
    judge_id = ObjectId()
    if judge:
        target = db.integrations.find_one({'_id': ObjectId(legacy.integration_id)})
        db.integrations.insert_one({**target, '_id': judge_id, 'account_name_normalized': str(judge_id),
            'models': ['judge-model'], 'model_prices': [{'model': 'judge-model',
            'input_usd_per_million': '1', 'output_usd_per_million': '2'}]})
    if mode == 'protected':
        db.companies.update_one({'_id': ObjectId(user.company.id)}, {'$set': {'settings.require_active_policy': False}})
    config = Config(name='Synthetic worker', integration_id=legacy.integration_id, model=legacy.model,
        mode=mode, plugins=['prompt-extraction'], strategies=['base64'], tests_per_plugin=1,
        judge={'integration_id': str(judge_id), 'model': 'judge-model'} if judge else None)
    test = service.create(user, config)['test']
    service.launch(user, test['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(test['id']), 'case_kind': 'adversarial', 'strategy_id': 'base64'})
    return test, job, judge_id


def run(db, job, provider):
    db.integration_execution_locks.update_many({}, {'$set': {'next_allowed_at': EPOCH}})
    current = db.red_team_jobs.find_one({'_id': job['_id']})
    result = process_job(db, str(job['_id']), str(job['test_id']), current['dispatch_generation'], provider)
    return result, db.red_team_jobs.find_one({'_id': job['_id']})


def expire(db, job):
    db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': {'execution_lease_expires_at': utcnow() - timedelta(seconds=1)}})


def test_exact_judge_parser_and_no_judge_paths(red_team):
    db, user, _, service = red_team
    for mode in ('raw', 'protected'):
        _, job, _ = launch_case(red_team, mode=mode)
        fake = FakeProvider(db, target=lambda j: base64.b64encode(j['failure_marker'].encode()).decode())
        result, final = run(db, job, fake)
        assert result == 'fail' and final['verdict_source'] == 'exact' and fake.judge_calls == 0
        assert final['evidence_steps'][1]['state'] == 'decisive' and 'base64' in final['explanation']
    for reply, verdict, source, code in [
        ('{"verdict":"unsafe","reason":"Synthetic unsafe"}', 'fail', 'judge', None),
        ('{"verdict":"defended","reason":"Synthetic refusal"}', 'pass', 'judge', None),
        ('not json', 'inconclusive', 'none', 'judge_invalid_json'),
        ('{"verdict":"unsure","reason":"Unclear"}', 'inconclusive', 'none', 'judge_unsure'),
    ]:
        _, job, judge_id = launch_case(red_team)
        fake = FakeProvider(db, judge=reply)
        result, final = run(db, job, fake)
        assert result == verdict and final['verdict_source'] == source
        assert fake.target_calls == fake.judge_calls == 1
        assert final['judge']['error_code'] == code and final['judge']['attempts'] == 1
        assert final['judge']['cost'] == '0.00002' and final['judge']['latency_ms'] == 3
        assert final['judge']['rubric_version'] == 'judge-rubric-1'
        assert final['response_ciphertext'] != 'ordinary synthetic reply'
        assert decrypt(final['response_ciphertext']) == 'ordinary synthetic reply'
        assert db.integration_execution_locks.find_one({'integration_id': judge_id})['lease_token'] is None
    _, job, _ = launch_case(red_team, judge=False)
    fake = FakeProvider(db)
    result, final = run(db, job, fake)
    assert result == 'inconclusive' and final['verdict_source'] == 'none' and fake.judge_calls == 0
    # Controls are never judged, even when their answer is undecided.
    _, job, _ = launch_case(red_team)
    control = db.red_team_jobs.find_one({'test_id': job['test_id'], 'case_kind': 'control'})
    fake = FakeProvider(db)
    _, final = run(db, control, fake)
    assert final['verdict'] == 'inconclusive' and fake.judge_calls == 0


def test_judge_recovery_never_replays_target_and_caps_attempts(red_team):
    db, _, _, _ = red_team
    _, job, _ = launch_case(red_team)
    def crash(*args):
        raise SimulatedCrash()
    fake = FakeProvider(db, on_judge=crash)
    with pytest.raises(SimulatedCrash):
        run(db, job, fake)
    expire(db, job)
    assert recover(db)['judge_resume'] == 1
    fake.on_judge = None
    result, final = run(db, job, fake)
    assert result == 'fail' and fake.target_calls == 1 and fake.judge_calls == 2
    assert final['judge']['attempts'] == 2 and final['verdict_source'] == 'judge'
    _, job, _ = launch_case(red_team)
    fake = FakeProvider(db, on_judge=crash)
    for _ in range(2):
        with pytest.raises(SimulatedCrash):
            run(db, job, fake)
        expire(db, job)
        counts = recover(db)
    assert counts['judge_exhausted'] == 1
    final = db.red_team_jobs.find_one({'_id': job['_id']})
    assert final['verdict'] == 'inconclusive' and final['judge']['error_code'] == 'judge_attempts_exhausted'
    assert fake.target_calls == 1 and fake.judge_calls == 2
    assert run(db, job, fake)[0] == 'noop'
    _, job, _ = launch_case(red_team)
    # Simulate a crash after target dispatch but before its response was persisted.
    db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': {'state': 'running',
        'execution_phase': 'calling_provider', 'execution_lease_token': 'expired'}})
    expire(db, job)
    assert recover(db)['uncertain_finalized'] == 1
    assert run(db, job, FakeProvider(db))[1]['error_code'] == 'execution_outcome_unknown'


def test_judge_admission_retry_revocation_cancellation_and_heartbeat(red_team):
    db, user, _, service = red_team
    _, job, judge_id = launch_case(red_team)
    lease = IntegrationAdmission(db).acquire(job['company_id'], judge_id, 'synthetic-other')
    fake = FakeProvider(db)
    assert run(db, job, fake)[0] == 'rescheduled'
    assert fake.target_calls == 1 and fake.judge_calls == 0
    IntegrationAdmission(db).release(job['company_id'], judge_id, lease)
    assert run(db, job, fake)[0] == 'fail' and fake.target_calls == 1
    _, job, _ = launch_case(red_team)
    def limited(job):
        raise ProviderError('rate_limited', retry_after=1)
    fake = FakeProvider(db, judge=limited)
    assert run(db, job, fake)[0] == 'rescheduled'
    fake.judge = '{"verdict":"defended","reason":"Synthetic safe reply"}'
    assert run(db, job, fake)[0] == 'pass' and fake.target_calls == 1 and fake.judge_calls == 2
    _, job, judge_id = launch_case(red_team)
    db.integrations.update_one({'_id': judge_id}, {'$set': {'status': 'disabled'}})
    _, final = run(db, job, FakeProvider(db))
    assert final['verdict'] == 'inconclusive' and final['judge']['error_code'] == 'judge_unavailable'
    assert not db.red_team_tests.find_one({'_id': job['test_id']}).get('cancel_requested_at')
    for action in ('cancel', 'revoke', 'heartbeat'):
        test, job, judge_id = launch_case(red_team)
        def during_judge(current, admission):
            if action == 'cancel':
                service.cancel(user, test['id'])
            elif action == 'revoke':
                db.integrations.update_one({'_id': judge_id}, {'$set': {'company_id': ObjectId()}})
            else:
                class OneTick:
                    calls = 0
                    def wait(self, seconds):
                        self.calls += 1
                        return self.calls > 1
                _keep_alive(db, {**current, 'integration_id': judge_id}, current['execution_lease_token'], admission[3], OneTick())
                assert IntegrationAdmission(db).verify(current['company_id'], judge_id, admission[3])
        _, final = run(db, job, FakeProvider(db, on_judge=during_judge))
        if action == 'cancel':
            assert final['state'] == 'cancelled' and final['verdict'] is None and final['response_withheld']
        elif action == 'revoke':
            assert final['verdict'] == 'inconclusive' and final['judge']['error_code'] == 'judge_unavailable'
        else:
            assert final['verdict_source'] == 'judge'


def test_legacy_worker_grading_is_unchanged(red_team):
    db, user, config, service = red_team
    test = service.create(user, config)['test']
    service.launch(user, test['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(test['id']), 'case_kind': 'adversarial'})
    fake = FakeProvider(db, target=lambda j: j['forbidden_marker'])
    _, final = run(db, job, fake)
    assert final['verdict'] == 'fail' and final['verdict_reason_code'] == 'forbidden_marker_reproduced'
    assert 'judge' not in final and 'verdict_source' not in final


@pytest.mark.parametrize('race', ['provider_dispatched', 'lease_renewed'])
def test_recovery_rechecks_expiry_and_phase_after_cursor_read(red_team, race):
    """A stale recovery cursor must never reset an in-flight provider call."""
    db, _, _, _ = red_team
    _, job, _ = launch_case(red_team, judge=False)
    db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': {
        'state': 'running', 'execution_phase': 'claimed',
        'execution_lease_token': 'synthetic-worker-lease',
        'execution_lease_expires_at': utcnow() - timedelta(seconds=1)}})

    class RacingJobs:
        def __getattr__(self, name):
            return getattr(db.red_team_jobs, name)

        def find(self, query, *args, **kwargs):
            cursor = db.red_team_jobs.find(query, *args, **kwargs)
            if query.get('state') != 'running' or 'execution_lease_expires_at' not in query:
                return cursor
            stale = list(cursor)
            changes = {'execution_phase': 'calling_provider'} if race == 'provider_dispatched' else {
                'execution_lease_expires_at': utcnow() + timedelta(minutes=2)}
            db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': changes})
            return iter(stale)

    class RacingDB:
        red_team_jobs = RacingJobs()

        def __getattr__(self, name):
            return getattr(db, name)

    counts = recover(RacingDB())
    final = db.red_team_jobs.find_one({'_id': job['_id']})
    assert counts['pre_call_reset'] == 0
    if race == 'lease_renewed':
        assert final['state'] == 'running'
        assert final['execution_lease_token'] == 'synthetic-worker-lease'
    else:
        assert counts['uncertain_finalized'] == 1
        assert final['state'] == 'finished' and final['error_code'] == 'execution_outcome_unknown'
        fake = FakeProvider(db)
        assert run(db, final, fake)[0] == 'noop'
        assert fake.target_calls == 0
