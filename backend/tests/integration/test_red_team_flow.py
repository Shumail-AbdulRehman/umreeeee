from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import re
from types import SimpleNamespace
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.api.routes.red_team import service as service_dependency
from app.core.errors import DomainError
from app.db.indexes import ensure_indexes
from app.main import app
from app.queue.dispatcher import dispatch_once
from app.queue.recovery import recover
from app.schemas.red_team import TestConfig as RedTeamConfig
from app.services.provider_service import ProviderResult
from app.services.protected_prompt_service import ProtectedPromptService
from app.services.integration_admission import IntegrationAdmission, AdmissionUnavailable
from app.services.content_service import encrypt, expire_content
from app.services.red_team_service import RedTeamService
from app.workers.red_team_worker import process_job


@pytest.fixture
def red_team(test_database):
    db = test_database
    ensure_indexes(db)
    now = datetime.now(timezone.utc)
    company, admin, integration = ObjectId(), ObjectId(), ObjectId()
    db.companies.insert_one({'_id': company, 'name': 'Synthetic', 'slug': str(company),
        'status': 'active', 'administration_revision': 0,
        'settings': {'require_active_policy': True, 'content_retention_days': 7}})
    db.users.insert_one({'_id': admin, 'company_id': company, 'first_name': 'Test', 'last_name': 'Admin',
        'email': 'red-team@example.test', 'role': 'org_admin', 'is_active': True,
        'is_email_verified': True, 'group_ids': [], 'token_version': 0})
    db.integrations.insert_one({'_id': integration, 'company_id': company, 'status': 'active',
        'provider': 'ollama', 'account_name': 'Fake target', 'models': ['fake-model'],
        'system_prompt': 'Be helpful.', 'base_url': 'http://127.0.0.1:11434'})
    user = SimpleNamespace(id=str(admin), role='org_admin', token_version=0, group_ids=[],
        company=SimpleNamespace(id=str(company)))
    config = RedTeamConfig(name='Synthetic red team', integration_id=str(integration), model='fake-model',
        mode='raw', attack_categories=['direct_injection'], num_attacks=1, seed=1)
    return db, user, config, RedTeamService(db)


def test_draft_launch_is_durable_idempotent_and_tenant_scoped(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    assert created['status'] == 'draft' and db.red_team_jobs.count_documents({}) == 0
    key = str(uuid4())
    launched = service.launch(user, created['id'], created['version'], key)['test']
    assert launched['status'] == 'queued' and launched['dispatch_pending']
    assert db.red_team_jobs.count_documents({'test_id': ObjectId(created['id'])}) == 6
    again = service.launch(user, created['id'], created['version'], key)['test']
    assert again['id'] == created['id'] and db.red_team_jobs.count_documents({}) == 6
    with pytest.raises(DomainError) as conflict:
        service.launch(user, created['id'], created['version'], str(uuid4()))
    assert conflict.value.status_code == 409
    stranger = SimpleNamespace(**{**user.__dict__, 'company': SimpleNamespace(id=str(ObjectId()))})
    with pytest.raises(DomainError) as hidden:
        service.detail(stranger, created['id'])
    assert hidden.value.status_code == 404
    regular = SimpleNamespace(**{**user.__dict__, 'role': 'user'})
    with pytest.raises(Exception):
        service.detail(regular, created['id'])
    app.dependency_overrides[service_dependency] = lambda: service
    try:
        client = TestClient(app)
        app.dependency_overrides[get_current_user] = lambda: regular
        assert client.get(f'/api/red-team/tests/{created["id"]}').status_code == 403
        assert client.get(f'/api/red-team/tests/{created["id"]}/export').status_code == 403
        app.dependency_overrides[get_current_user] = lambda: stranger
        assert client.get(f'/api/red-team/tests/{created["id"]}').status_code == 404
        assert client.get(f'/api/red-team/tests/{created["id"]}/export').status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_concurrent_matching_launch_creates_one_job_set(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        launched = list(pool.map(lambda _: service.launch(user, created['id'], 1, key), range(2)))
    assert all(row['test']['id'] == created['id'] for row in launched)
    assert db.red_team_jobs.count_documents({'test_id': ObjectId(created['id'])}) == 6


def test_api_launch_and_raw_worker_with_fake_broker_and_provider(red_team):
    db, user, config, service = red_team
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[service_dependency] = lambda: service
    try:
        client = TestClient(app)
        created = client.post('/api/red-team/tests', json=config.model_dump())
        assert created.status_code == 201
        test_id = created.json()['test']['id']
        launched = client.post(f'/api/red-team/tests/{test_id}/launch', json={'version': 1},
            headers={'Idempotency-Key': str(uuid4())})
        assert launched.status_code == 202
        assert client.get(f'/api/red-team/tests/{test_id}/results').json()['total'] == 6
    finally:
        app.dependency_overrides.clear()

    class FakeBroker:
        def __init__(self):
            self.messages = []
        def publish(self, message):
            self.messages.append(message)

    class FakeProvider:
        def __init__(self):
            self.calls = 0
        def execute(self, integration, payload, request_id):
            self.calls += 1
            marker = re.search(r'SYNTH-PRIVATE-[A-F0-9]{12}', integration['system_prompt']).group()
            if 'approved' in payload.prompt.lower() or 'support' in payload.prompt.lower() or 'account' in payload.prompt.lower():
                text = re.search(r'SAFE-SUPPORT-[A-F0-9]{12}', integration['system_prompt']).group()
            else:
                text = marker
            return ProviderResult(text, 10, 5, 15, 'fake', 'stop', 2)

    broker, provider = FakeBroker(), FakeProvider()
    for _ in range(6):
        db.integration_execution_locks.update_many({}, {'$set': {'next_allowed_at': datetime(1970, 1, 1, tzinfo=timezone.utc)}})
        assert dispatch_once(db, broker)
        message = broker.messages[-1]
        assert set(message) == {'v', 'job_id', 'test_id', 'generation'}
        process_job(db, message['job_id'], message['test_id'], message['generation'], provider)
        assert process_job(db, message['job_id'], message['test_id'], message['generation'], provider) == 'noop'
    assert provider.calls == 6
    report = service.report(user, test_id)
    assert report['progress']['terminal_jobs'] == 6
    assert report['score']['unsafe_count'] == 1
    assert report['score']['threshold_verdict'] == 'below_threshold'
    assert db.notifications.count_documents({'kind': 'red_team_threshold'}) == 1


def test_export_never_reveals_withheld_or_formula_text(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(created['id'])})
    db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': {'prompt': '=HYPERLINK("x")',
        'state': 'finished', 'verdict': 'pass', 'response_withheld': True,
        'response_ciphertext': 'must-not-appear'}})
    csv_body, _ = service.export(user, created['id'], 'csv')
    assert "'=HYPERLINK" in csv_body and 'must-not-appear' not in csv_body
    json_body, _ = service.export(user, created['id'], 'json')
    assert 'must-not-appear' not in json_body


def test_expired_synthetic_response_is_unavailable_to_detail_and_export(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(created['id'])})
    response = 'synthetic response that must expire'
    db.red_team_jobs.update_one({'_id': job['_id']}, {'$set': {
        'state': 'finished', 'verdict': 'inconclusive', 'response_ciphertext': encrypt(response),
        'content_expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)}})
    assert expire_content(db) >= 1
    detail = service.result_detail(user, created['id'], str(job['_id']))['result']
    assert detail['content_expired'] and detail['response_text'] is None
    body, _ = service.export(user, created['id'], 'json')
    assert response not in body and 'response_ciphertext' not in body


def test_offline_broker_keeps_outbox_and_recovers(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    class Offline:
        def publish(self, message):
            raise ConnectionError('test broker offline')
    with pytest.raises(ConnectionError):
        dispatch_once(db, Offline())
    pending = db.red_team_jobs.find_one({'test_id': ObjectId(created['id']), 'dispatch_attempt': 1})
    assert pending['dispatch_state'] == 'pending' and pending['state'] == 'pending'
    db.red_team_jobs.update_one({'_id': pending['_id']}, {'$set': {'next_attempt_at': datetime(1970, 1, 1, tzinfo=timezone.utc)}})
    class Online:
        def __init__(self):
            self.messages = []
        def publish(self, message):
            self.messages.append(message)
    broker = Online()
    assert dispatch_once(db, broker) and len(broker.messages) == 1
    assert db.red_team_jobs.find_one({'_id': pending['_id']})['dispatch_state'] == 'published'


def test_publish_confirmation_gap_can_redeliver_without_second_provider_call(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    messages = []
    class LostConfirmation:
        def publish(self, message):
            messages.append(message)
            raise ConnectionError('confirm lost after broker accepted publication')
    with pytest.raises(ConnectionError):
        dispatch_once(db, LostConfirmation())
    message = messages[0]
    class Provider:
        calls = 0
        def execute(self, integration, payload, request_id):
            self.calls += 1
            marker = re.search(r'REFUSE-[A-F0-9]{12}', integration['system_prompt']).group()
            return ProviderResult(marker, 5, 2, 7, 'fake', 'stop', 2)
    provider = Provider()
    process_job(db, message['job_id'], message['test_id'], message['generation'], provider)
    assert process_job(db, message['job_id'], message['test_id'], message['generation'], provider) == 'noop'
    assert provider.calls == 1
    assert db.red_team_jobs.count_documents({'test_id': ObjectId(created['id']),
        'attack_index': 0, 'state': 'finished'}) == 1


def test_shared_admission_fences_owners_and_preserves_pace(red_team):
    db, user, config, service = red_team
    company, integration = ObjectId(user.company.id), ObjectId(config.integration_id)
    admission = IntegrationAdmission(db)
    worker = admission.acquire(company, integration, 'worker')
    with pytest.raises(AdmissionUnavailable):
        admission.acquire(company, integration, 'workspace')
    assert admission.verify(company, integration, worker)
    assert not admission.release(company, integration, 'wrong-token')
    assert admission.release(company, integration, worker)
    with pytest.raises(AdmissionUnavailable):
        admission.acquire(company, integration, 'workspace')
    db.integration_execution_locks.update_one({'company_id': company, 'integration_id': integration},
        {'$set': {'next_allowed_at': datetime(1970, 1, 1, tzinfo=timezone.utc)}})
    workspace = admission.acquire(company, integration, 'workspace')
    assert workspace != worker and not admission.verify(company, integration, worker)


def test_expired_execution_lease_recovery_never_replays_uncertain_call(red_team):
    db, user, config, service = red_team
    created = service.create(user, config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    jobs = list(db.red_team_jobs.find({'test_id': ObjectId(created['id'])}).sort('attack_index', 1))
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    for index, phase in enumerate(('claimed', 'calling_provider', 'response_persisted')):
        db.red_team_jobs.update_one({'_id': jobs[index]['_id']}, {'$set': {'state': 'running',
            'execution_phase': phase, 'execution_lease_token': f'lease-{index}',
            'execution_lease_expires_at': past,
            **({'prepared_result': {'status': 'allowed'}} if phase == 'response_persisted' else {})}})
    counts = recover(db)
    assert counts['pre_call_reset'] == 1
    assert counts['uncertain_finalized'] == 1
    assert counts['response_resume'] == 1
    first, uncertain, prepared = [db.red_team_jobs.find_one({'_id': row['_id']}) for row in jobs[:3]]
    assert first['state'] == 'queued' and first['dispatch_generation'] == 2
    assert uncertain['state'] == 'finished' and uncertain['verdict_reason_code'] == 'execution_outcome_unknown'
    assert prepared['state'] == 'queued' and prepared['execution_phase'] == 'response_persisted'


def test_cancel_prevents_late_delivery_and_comparison_rejects_changed_instruction(red_team):
    db, user, config, service = red_team
    original = service.create(user, config)['test']
    service.launch(user, original['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(original['id'])})
    cancelled = service.cancel(user, original['id'])['test']
    assert cancelled['status'] == 'cancelled'
    assert process_job(db, str(job['_id']), original['id'], 1) == 'noop'
    clone = service.clone(user, original['id'], 'protected')['test']
    db.red_team_tests.update_one({'_id': ObjectId(clone['id'])}, {'$set': {'status': 'completed',
        'config_snapshot': {'system_instruction': 'Changed later'}}})
    with pytest.raises(DomainError) as mismatch:
        service.comparison(user, original['id'], clone['id'])
    assert mismatch.value.code == 'comparison_mismatch'


def test_protected_output_block_withholds_text_and_segregates_history(red_team):
    db, user, config, service = red_team
    company = ObjectId(user.company.id)
    for stage, action, term in [('input', 'LOG', 'term-that-never-occurs'),
                                 ('output', 'BLOCK', 'SYNTH-PRIVATE-')]:
        policy_id = ObjectId()
        db.policies.insert_one({'_id': policy_id, 'company_id': company, 'name': str(policy_id),
            'name_normalized': str(policy_id), 'category': 'custom', 'severity': 'high',
            'action': action, 'status': 'active', 'stages': [stage],
            'scope': {'group_ids': [], 'integration_ids': []}, 'version': 1,
            'rules': [{'rule_id': str(uuid4()), 'type': 'keyword', 'config': {'terms': [term]}}]})
    protected_config = config.model_copy(update={'mode': 'protected'})
    created = service.create(user, protected_config)['test']
    service.launch(user, created['id'], 1, str(uuid4()))
    job = db.red_team_jobs.find_one({'test_id': ObjectId(created['id']), 'case_kind': 'adversarial'})

    class MarkerProvider:
        calls = 0
        def execute(self, integration, payload, request_id):
            self.calls += 1
            marker = re.search(r'SYNTH-PRIVATE-[A-F0-9]{12}', integration['system_prompt']).group()
            return ProviderResult(marker, 5, 2, 7, 'fake', 'stop', 2)

    provider = MarkerProvider()
    assert process_job(db, str(job['_id']), created['id'], 1, provider) == 'pass'
    assert provider.calls == 1
    result = service.result_detail(user, created['id'], str(job['_id']))['result']
    assert result['verdict_reason_code'] == 'policy_block_output'
    assert result['response_withheld'] and result['response_text'] is None
    assert 'response_ciphertext' not in db.red_team_jobs.find_one({'_id': job['_id']})
    run = db.prompt_runs.find_one({'source': 'red_team'})
    assert run['status'] == 'blocked_output' and run['response_withheld']
    ordinary = ProtectedPromptService(db, provider)
    assert ordinary.list_runs(user)['total'] == 0
    with pytest.raises(DomainError) as hidden:
        ordinary.detail(user, str(run['_id']))
    assert hidden.value.status_code == 404
