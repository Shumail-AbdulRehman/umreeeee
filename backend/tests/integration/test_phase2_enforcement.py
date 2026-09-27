from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.core.errors import DomainError
from app.db.indexes import ensure_indexes
from app.schemas.prompts import PromptRunExecuteRequest
from app.services.protected_prompt_service import ProtectedPromptService, RunOutcome
from app.services.provider_service import ProviderResult
from app.services.analytics_service import summary, series, models
from app.services.content_service import expire_content, shorten_retention
from scripts.migrate_phase2 import migrate_record
from app.main import app
from app.api.dependencies.auth import get_current_user
from app.api.routes.prompts import protected_service


class FakeProvider:
    def __init__(self, output='Safe response'):
        self.calls = 0
        self.output = output

    def execute(self, integration, payload, request_id):
        self.calls += 1
        return ProviderResult(self.output, 12, 7, 19, 'fake-id', 'stop', 5)


@pytest.fixture
def protected(test_database):
    db = test_database
    ensure_indexes(db)
    now = datetime.now(timezone.utc)
    company, user_id, integration_id = ObjectId(), ObjectId(), ObjectId()
    db.companies.insert_one({'_id': company, 'name': 'Test', 'slug': 'phase2', 'status': 'active',
        'settings': {'require_active_policy': True, 'content_retention_days': 7}, 'administration_revision': 0,
        'version': 1, 'created_at': now})
    db.users.insert_one({'_id': user_id, 'company_id': company, 'first_name': 'Ada', 'last_name': 'Lovelace',
        'email': 'ada@example.test', 'role': 'org_admin', 'is_active': True, 'is_email_verified': True,
        'token_version': 0, 'group_ids': []})
    db.integrations.insert_one({'_id': integration_id, 'company_id': company, 'provider': 'ollama',
        'account_name': 'Fake provider', 'status': 'active', 'models': ['fake-model'],
        'system_prompt': 'Be helpful', 'base_url': 'http://127.0.0.1:11434',
        'model_prices': [{'model': 'fake-model', 'input_usd_per_million': '1',
                          'output_usd_per_million': '2'}]})
    user = SimpleNamespace(id=str(user_id), first_name='Ada', last_name='Lovelace',
        email='ada@example.test', role='org_admin', group_ids=[], token_version=0,
        company=SimpleNamespace(id=str(company)))
    fake = FakeProvider()
    service = ProtectedPromptService(db, fake)

    def policy(term='secret', stage='input', action='BLOCK', kind='keyword'):
        policy_id = ObjectId()
        db.policies.insert_one({'_id': policy_id, 'company_id': company, 'name': str(policy_id),
            'name_normalized': str(policy_id),
            'category': 'custom', 'severity': 'high', 'action': action, 'status': 'active',
            'stages': [stage], 'scope': {'group_ids': [], 'integration_ids': []}, 'version': 1,
            'rules': [{'rule_id': str(uuid4()), 'type': kind,
                'config': {'terms': [term]} if kind == 'keyword' else {'threshold': .8}}]})
        return policy_id

    def request(text='hello'):
        return PromptRunExecuteRequest(integration_id=str(integration_id), model='fake-model', prompt=text)

    return db, user, fake, service, policy, request


def execute(service, user, payload, key=None):
    return service.execute_protected(user, payload, {'source': 'workspace', 'key': key or str(uuid4()),
        'request_id': 'test-request'})


def test_input_block_persists_violation_without_provider_call(protected):
    db, user, fake, service, policy, request = protected
    policy()
    with pytest.raises(RunOutcome) as error:
        execute(service, user, request('This is secret'))
    assert error.value.status == 403
    assert error.value.run['status'] == 'blocked_input'
    assert fake.calls == 0
    assert db.violations.count_documents({'company_id': ObjectId(user.company.id)}) == 1
    stored = db.prompt_runs.find_one({'company_id': ObjectId(user.company.id)})
    assert stored['prompt_ciphertext'] != 'This is secret'
    assert 'response_text' not in stored


def test_output_block_withholds_text_everywhere(protected):
    db, user, fake, service, policy, request = protected
    policy('innocuous', 'input', 'LOG')
    policy('secret', 'output', 'BLOCK')
    fake.output = 'secret answer'
    with pytest.raises(RunOutcome) as error:
        execute(service, user, request())
    assert error.value.status == 403 and fake.calls == 1
    assert error.value.run['response_text'] is None
    stored = db.prompt_runs.find_one({'status': 'blocked_output'})
    assert stored['response_withheld'] is True
    assert 'response_ciphertext' not in stored and 'response_text' not in stored
    assert service.detail(user, str(stored['_id']))['run']['response_text'] is None


def test_log_alert_idempotency_and_cost(protected):
    db, user, fake, service, policy, request = protected
    policy('special', 'input', 'LOG')
    policy('special', 'input', 'ALERT')
    key = str(uuid4())
    first = execute(service, user, request('special'), key)['run']
    second = execute(service, user, request('special'), key)['run']
    assert first['id'] == second['id'] and first['status'] == 'allowed'
    assert first['estimated_cost_usd'] == '0.000026'
    assert fake.calls == 1
    assert db.violations.count_documents({}) == 2
    assert db.notifications.count_documents({}) == 1
    totals = summary(db, user)
    assert totals['total_submissions'] == 1 and totals['violation_events'] == 2
    assert totals['violation_rate'] == 1 and totals['estimated_cost_usd'] == '0.000026'
    assert series(db, user)['items'][0]['count'] == 1
    assert models(db, user)['items'][0]['known_tokens'] == 19
    with pytest.raises(DomainError) as error:
        execute(service, user, request('different'), key)
    assert error.value.code == 'idempotency_conflict'


def test_no_input_policy_fails_closed(protected):
    db, user, fake, service, policy, request = protected
    policy('secret', 'output')
    with pytest.raises(RunOutcome) as error:
        execute(service, user, request())
    assert error.value.code == 'policy_required' and fake.calls == 0
    db.companies.update_one({'_id': ObjectId(user.company.id)},
        {'$set': {'settings.require_active_policy': False}})
    allowed = execute(service, user, request())['run']
    assert allowed['input_evaluation']['state'] == 'not_evaluated'


@pytest.mark.parametrize('kinds', [[], ['dlp'], ['guardrail'], ['dlp', 'guardrail']])
def test_remote_detection_uses_database_group_membership_and_selected_entries(protected, monkeypatch, kinds):
    from app.core import config
    from app.services import remote_detection as remote
    db, user, fake, service, make_policy, request = protected
    monkeypatch.setattr(config, 'REMOTE_DETECTION_ENABLED', True)
    monkeypatch.setattr(config, 'DLP_DETECTION_API_KEY', 'test-only')
    cid, group, other = ObjectId(user.company.id), ObjectId(), ObjectId()
    db.groups.insert_many([{'_id': group, 'company_id': cid, 'status': 'active', 'name_normalized': 'one'},
                           {'_id': other, 'company_id': cid, 'status': 'active', 'name_normalized': 'two'}])
    db.users.update_one({'_id': ObjectId(user.id)}, {'$set': {'group_ids': [group]}})
    # The caller's cached group list must not override current DB memberships.
    user.group_ids = [str(other)]
    db.companies.update_one({'_id': cid}, {'$set': {'settings.require_active_policy': False}})
    for kind in ['dlp', 'guardrail']:
        pid = make_policy()
        db.policies.update_one({'_id': pid}, {'$set': {'managed_catalog': True, 'category': kind,
            'scope': {'group_ids': [group if kind in kinds else other], 'integration_ids': []},
            'entries': [{'id': kind + '-chosen'}, {'id': kind + '-not-chosen'}],
            'selected_entry_ids': [kind + '-chosen'],
            'rules': [{'rule_id': kind, 'type': 'catalog', 'config': {}}]}})
    calls = []
    def post(url, payload, headers, timeout):
        calls.append((url, payload))
        return {'detections': []} if url == remote.DLP_URL else {'results': []}
    monkeypatch.setattr(remote, 'post_detection', post)
    result = execute(service, user, request())['run']
    assert result['status'] == 'allowed' and fake.calls == 1
    assert {url for url, _ in calls} == {remote.DLP_URL if k == 'dlp' else remote.GUARDRAIL_URL for k in kinds}
    for url, payload in calls:
        if url == remote.DLP_URL:
            assert payload['pattern_ids'] == ['dlp-chosen'] and payload['custom_patterns'] == []
        else:
            assert payload['plugins'] == [{'pluginId': 'guardrail-chosen', 'config': {}}]
    assert 'not-chosen' not in str(calls)


def test_remote_match_prevents_provider_and_records_safe_violation(protected, monkeypatch):
    from app.core import config
    from app.services import remote_detection as remote
    db, user, fake, service, make_policy, request = protected
    monkeypatch.setattr(config, 'REMOTE_DETECTION_ENABLED', True)
    monkeypatch.setattr(config, 'DLP_DETECTION_API_KEY', 'test-only')
    group = ObjectId()
    db.groups.insert_one({'_id': group, 'company_id': ObjectId(user.company.id), 'status': 'active'})
    db.users.update_one({'_id': ObjectId(user.id)}, {'$set': {'group_ids': [group]}})
    pid = make_policy()
    db.policies.update_one({'_id': pid}, {'$set': {'managed_catalog': True, 'category': 'dlp',
        'scope': {'group_ids': [group], 'integration_ids': []}, 'entries': [{'pattern_id': 'email'}],
        'selected_entry_ids': ['email'], 'rules': [{'rule_id': 'dlp', 'type': 'catalog', 'config': {}}]}})
    monkeypatch.setattr(remote, 'post_detection', lambda *args: {'detections': [
        {'pattern_id': 'email', 'matched_text': 'PRIVATE REMOTE CONTENT'}]})
    with pytest.raises(RunOutcome) as error:
        execute(service, user, request())
    assert error.value.run['status'] == 'blocked_input' and fake.calls == 0
    assert db.violations.count_documents({}) == 1
    assert 'PRIVATE REMOTE CONTENT' not in str(db.violations.find_one({}))


def test_missing_semantic_validator_is_not_false_pass(protected):
    db, user, fake, service, policy, request = protected
    policy('ignore', 'input', 'BLOCK', 'prompt_injection')
    with pytest.raises(RunOutcome) as error:
        execute(service, user, request('hello'))
    assert error.value.status == 503
    assert error.value.run['input_evaluation']['evaluation_complete'] is False
    assert fake.calls == 0 and db.violations.count_documents({}) == 0


def test_content_retention_shortens_and_removes_ciphertext_only(protected):
    db, user, fake, service, policy, request = protected
    policy('never', 'input', 'LOG')
    run = execute(service, user, request())['run']
    row = db.prompt_runs.find_one({'_id': ObjectId(run['id'])})
    assert row.get('prompt_ciphertext') and row.get('response_ciphertext')
    with db.client.start_session() as session:
        with session.start_transaction():
            shorten_retention(db, ObjectId(user.company.id), 1, session=session)
    assert db.prompt_runs.find_one({'_id': row['_id']})['content_expires_at'] <= row['content_expires_at']
    from datetime import timedelta
    assert expire_content(db, row['created_at'] + timedelta(days=2)) == 1
    persisted = db.prompt_runs.find_one({'_id': row['_id']})
    assert 'prompt_ciphertext' not in persisted and persisted['status'] == 'allowed'


def test_legacy_migration_is_resumable_and_never_invents_policy_findings(protected):
    db, user, fake, service, policy, request = protected
    old = {'company_id': ObjectId(user.company.id), 'user_id': ObjectId(user.id),
        'integration_id': ObjectId(request().integration_id), 'created_at': datetime.now(timezone.utc),
        'status': 'completed', 'prompt': 'old prompt', 'system_prompt': '', 'response_text': 'old response'}
    db.prompt_runs.insert_one(old)
    assert migrate_record(db, old) == 'encrypt_text'
    assert db.prompt_runs.find_one({'_id': old['_id']})['prompt'] == 'old prompt'
    assert migrate_record(db, old, apply=True) == 'encrypt_text'
    migrated = db.prompt_runs.find_one({'_id': old['_id']})
    assert migrated['source'] == 'legacy' and migrated['status'] == 'legacy_completed'
    assert 'prompt' not in migrated and 'response_text' not in migrated
    assert 'input_evaluation' not in migrated and db.violations.count_documents({}) == 0
    assert migrate_record(db, migrated, apply=True) == 'skip'


def test_http_block_and_violation_detail_are_visible(protected, monkeypatch):
    import app.api.routes.observability as observe
    db, user, fake, service, policy, request = protected
    policy()
    monkeypatch.setattr(observe, 'get_database', lambda: db)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[protected_service] = lambda: service
    try:
        client = TestClient(app)
        response = client.post('/api/prompt-workspace/run', json=request('secret').model_dump(),
            headers={'Idempotency-Key': str(uuid4())})
        assert response.status_code == 403
        assert response.json()['run']['status'] == 'blocked_input'
        assert fake.calls == 0
        forged = {**request('secret').model_dump(), 'selected_groups': [], 'system_prompt': ''}
        rejected = client.post('/api/prompt-workspace/run', json=forged,
            headers={'Idempotency-Key': str(uuid4())})
        assert rejected.status_code == 422 and fake.calls == 0
        listed = client.get('/api/violations')
        assert listed.status_code == 200 and listed.json()['total'] == 1
        detail = client.get('/api/violations/' + listed.json()['items'][0]['id'])
        assert detail.status_code == 200
        assert detail.json()['violation']['policy_version'] == 1
    finally:
        app.dependency_overrides.clear()


def test_block_wins_over_incomplete_validation_and_keeps_both_findings(protected):
    db, user, fake, service, policy, request = protected
    policy('secret', 'input', 'BLOCK')
    policy('unused', 'input', 'LOG', 'prompt_injection')
    with pytest.raises(RunOutcome) as outcome:
        execute(service, user, request('secret'))
    run = outcome.value.run
    assert outcome.value.status == 403 and run['status'] == 'blocked_input'
    assert run['input_evaluation']['evaluation_complete'] is False
    assert {'match', 'error'} <= {item['outcome'] for item in run['input_evaluation']['rule_results']}
    assert fake.calls == 0 and db.violations.count_documents({}) == 1


def test_group_and_integration_scope_is_and_not_client_controlled(protected):
    db, user, fake, service, policy, request = protected
    blocked = policy('secret')
    other_group, actual_group, other_integration = ObjectId(), ObjectId(), ObjectId()
    db.groups.insert_one({'_id': actual_group, 'company_id': ObjectId(user.company.id),
                          'name': 'Actual', 'status': 'active'})
    db.users.update_one({'_id': ObjectId(user.id)}, {'$set': {'group_ids': [actual_group]}})
    db.policies.update_one({'_id': blocked}, {'$set': {'scope': {
        'group_ids': [other_group], 'integration_ids': [ObjectId(request().integration_id)]}}})
    with pytest.raises(RunOutcome) as missing:
        execute(service, user, request('secret'))
    assert missing.value.code == 'policy_required' and fake.calls == 0
    db.policies.update_one({'_id': blocked}, {'$set': {'scope': {
        'group_ids': [actual_group], 'integration_ids': [other_integration]}}})
    with pytest.raises(RunOutcome) as wrong_integration:
        execute(service, user, request('secret'))
    assert wrong_integration.value.code == 'policy_required'
    db.policies.update_one({'_id': blocked}, {'$set': {'scope.integration_ids': [ObjectId(request().integration_id)]}})
    with pytest.raises(RunOutcome) as matched:
        execute(service, user, request('secret'))
    assert matched.value.run['status'] == 'blocked_input' and fake.calls == 0
    forged = request('secret').model_copy(update={'selected_groups': [str(other_group)]})
    with pytest.raises(DomainError) as rejected:
        execute(service, user, forged)
    assert rejected.value.code == 'client_scope_forbidden'


def test_run_visibility_and_filtered_analytics_follow_run_not_incident_time(protected):
    from datetime import timedelta
    db, user, fake, service, policy, request = protected
    policy('secret')
    with pytest.raises(RunOutcome):
        execute(service, user, request('secret'))
    allowed = execute(service, user, request('ordinary'))['run']
    assert summary(db, user, status='allowed')['violation_events'] == 0
    assert summary(db, user, status='blocked_input')['violation_rate'] == 1
    incident = db.violations.find_one({})
    db.violations.update_one({'_id': incident['_id']},
        {'$set': {'created_at': datetime.now(timezone.utc) - timedelta(days=20)}})
    assert summary(db, user)['violation_events'] == 1
    stranger = SimpleNamespace(**{**user.__dict__, 'id': str(ObjectId()), 'role': 'user'})
    with pytest.raises(DomainError) as hidden:
        service.detail(stranger, allowed['id'])
    assert hidden.value.status_code == 404
    with pytest.raises(DomainError) as forbidden_filter:
        summary(db, stranger, user_id=user.id)
    assert forbidden_filter.value.status_code == 403


def test_duplicate_key_while_provider_is_running_returns_processing_once(protected):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    db, user, fake, service, policy, request = protected
    policy('never', 'input', 'LOG')
    entered, release = Event(), Event()

    class WaitingProvider(FakeProvider):
        def execute(self, integration, payload, request_id):
            entered.set()
            assert release.wait(5)
            return super().execute(integration, payload, request_id)

    service.provider = waiting = WaitingProvider()
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(execute, service, user, request(), key)
        assert entered.wait(5)
        duplicate = execute(service, user, request(), key)
        assert duplicate['run']['status'] == 'processing' and duplicate['poll'].endswith(duplicate['run']['id'])
        release.set()
        finished = first.result(timeout=5)
    assert finished['run']['id'] == duplicate['run']['id'] and waiting.calls == 1


def test_output_uses_policy_snapshot_even_when_edited_during_provider_call(protected):
    db, user, fake, service, policy, request = protected
    policy('never', 'input', 'LOG')
    output_policy = policy('secret', 'output', 'BLOCK')

    class EditingProvider(FakeProvider):
        def execute(self, integration, payload, request_id):
            db.policies.update_one({'_id': output_policy}, {'$set': {
                'rules': [{'rule_id': str(uuid4()), 'type': 'keyword',
                           'config': {'terms': ['different']}}], 'version': 2}})
            return super().execute(integration, payload, request_id)

    service.provider = EditingProvider('secret answer')
    with pytest.raises(RunOutcome) as outcome:
        execute(service, user, request())
    assert outcome.value.run['status'] == 'blocked_output'
    assert outcome.value.run['output_evaluation']['rule_results'][0]['policy_version'] == 1
    following = execute(service, user, request())['run']
    assert following['status'] == 'allowed' and following['response_text'] == 'secret answer'


def test_persistence_failure_does_not_release_or_replay_provider_output(protected, monkeypatch):
    from datetime import timedelta
    from scripts.reconcile_interrupted_runs import reconcile
    db, user, fake, service, policy, request = protected
    policy('never', 'input', 'LOG')
    original = service._persist_stage

    def fail_output(run, evaluation, matched, stage, status, extras=None):
        if stage == 'output':
            raise RuntimeError('synthetic database failure')
        return original(run, evaluation, matched, stage, status, extras)

    monkeypatch.setattr(service, '_persist_stage', fail_output)
    with pytest.raises(RuntimeError):
        execute(service, user, request())
    assert fake.calls == 1
    row = db.prompt_runs.find_one({'company_id': ObjectId(user.company.id)})
    assert row['status'] == 'processing' and 'response_ciphertext' not in row
    assert reconcile(db, row['heartbeat_at'] + timedelta(hours=1)) == 1
    assert db.prompt_runs.find_one({'_id': row['_id']})['status'] == 'interrupted'
    assert fake.calls == 1


def test_archived_model_is_rejected_before_run_creation(protected):
    db, user, fake, service, policy, request = protected
    policy('never')
    db.integrations.update_one({'_id': ObjectId(request().integration_id)}, {'$set': {'models': []}})
    with pytest.raises(DomainError) as invalid:
        execute(service, user, request())
    assert invalid.value.code == 'invalid_model'
    assert fake.calls == 0 and db.prompt_runs.count_documents({}) == 0


def test_resolution_version_conflict_preserves_review_note(protected, monkeypatch):
    import app.api.routes.observability as observe
    db, user, fake, service, policy, request = protected
    policy('secret')
    with pytest.raises(RunOutcome):
        execute(service, user, request('secret'))
    incident = db.violations.find_one({})
    monkeypatch.setattr(observe, 'get_database', lambda: db)

    def local_transaction(actor, operation):
        with db.client.start_session() as session:
            with session.start_transaction():
                return operation(db, session)

    monkeypatch.setattr(observe, 'transaction', local_transaction)
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        client = TestClient(app)
        url = '/api/violations/' + str(incident['_id']) + '/resolution'
        changed = client.patch(url, json={'resolution_status': 'reviewed', 'note': 'Reviewed safely', 'version': 1})
        assert changed.status_code == 200 and changed.json()['violation']['version'] == 2
        stale = client.patch(url, json={'resolution_status': 'resolved', 'note': 'Overwrite', 'version': 1})
        assert stale.status_code == 409
        assert db.violations.find_one({'_id': incident['_id']})['resolution_note'] == 'Reviewed safely'
        assert db.audit_events.count_documents({'resource_id': incident['_id']}) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize('kind', ['dlp', 'guardrail'])
def test_group_check_selection_reaches_detector_and_stays_frozen(protected, monkeypatch, kind):
    from app.core import config
    from app.services import remote_detection as remote
    db, user, fake, service, make_policy, request = protected
    monkeypatch.setattr(config, 'REMOTE_DETECTION_ENABLED', True)
    monkeypatch.setattr(config, 'DLP_DETECTION_API_KEY', 'test-only')
    cid, own, other = ObjectId(user.company.id), ObjectId(), ObjectId()
    db.groups.insert_many([{'_id': own, 'company_id': cid, 'status': 'active', 'name_normalized': 'own'},
                           {'_id': other, 'company_id': cid, 'status': 'active', 'name_normalized': 'other'}])
    db.users.update_one({'_id': ObjectId(user.id)}, {'$set': {'group_ids': [own]}})
    policy_id = make_policy()
    db.policies.update_one({'_id': policy_id}, {'$set': {'managed_catalog': True, 'category': kind,
        'scope': {'group_ids': [own, other], 'integration_ids': []}, 'stages': ['input', 'output'],
        'entries': [{'id': 'own-check'}, {'id': 'other-check'}],
        'selected_entry_ids': ['own-check', 'other-check'],
        'group_entry_selections': [{'group_id': own, 'selected_entry_ids': ['own-check']},
                                   {'group_id': other, 'selected_entry_ids': ['other-check']}],
        'rules': [{'rule_id': kind, 'type': 'catalog', 'config': {}}]}})
    sent = []
    def detect(url, payload, headers, timeout):
        sent.append(payload['pattern_ids'] if kind == 'dlp' else [p['pluginId'] for p in payload['plugins']])
        return {'detections' if kind == 'dlp' else 'results': []}
    monkeypatch.setattr(remote, 'post_detection', detect)
    original_execute = fake.execute
    def change_assignment_during_provider(*args):
        db.policies.update_one({'_id': policy_id}, {'$set': {
            'group_entry_selections.0.selected_entry_ids': ['other-check']}})
        return original_execute(*args)
    monkeypatch.setattr(fake, 'execute', change_assignment_during_provider)
    assert execute(service, user, request())['run']['status'] == 'allowed'
    assert sent == [['own-check']] * 3  # prompt, system instruction, output
    stored = db.prompt_runs.find_one({})
    assert stored['policy_snapshots'][0]['selected_entry_ids'] == ['own-check']
    assert fake.calls == 1


def test_automatic_cost_persists_once_and_reaches_spend(protected):
    from decimal import Decimal
    db, user, fake, service, policy, request = protected
    policy('never-matches', 'input', 'LOG')
    payload = request().model_copy(update={'model': 'gpt-4o-mini'})
    db.integrations.update_one({'_id': ObjectId(payload.integration_id)}, {'$set': {
        'provider': 'openai', 'models': ['gpt-4o-mini'], 'model_prices': []}})
    key = str(uuid4())
    first = execute(service, user, payload, key)['run']
    second = execute(service, user, payload, key)['run']
    assert first['id'] == second['id'] and fake.calls == 1
    assert first['cost_source'] == 'litellm' and first['cost_status'] == 'known'
    assert Decimal(first['estimated_cost_usd']) > 0
    stored = db.prompt_runs.find_one({'_id': ObjectId(first['id'])})
    assert stored['pricing_snapshot']['provider'] == 'openai'
    assert summary(db, user)['estimated_cost_usd'] == first['estimated_cost_usd']
    assert summary(db, user)['unknown_cost_runs'] == 0


def test_protected_red_team_uses_launch_price_snapshot(protected):
    db, user, fake, service, policy, request = protected
    policy('never-matches', 'input', 'LOG')
    snapshot = {'subject_group_ids': [], 'policy_snapshots': list(db.policies.find({})),
                'system_instruction': 'Be helpful', 'require_active_policy': True,
                'price_snapshot': [{'model': 'fake-model', 'input_usd_per_million': '10',
                                    'output_usd_per_million': '20'}]}
    result = service.execute_protected(user, request(), {'source': 'red_team', 'key': str(uuid4()),
        'request_id': 'test', 'scenario_system': 'Synthetic scenario', 'snapshot': snapshot})['run']
    assert result['estimated_cost_usd'] == '0.00026'
    assert result['cost_source'] == 'configured'
    assert result['pricing_snapshot'] == snapshot['price_snapshot'][0]


def test_output_block_keeps_automatic_cost(protected):
    db, user, fake, service, policy, request = protected
    policy('never-matches', 'input', 'LOG')
    policy('secret', 'output', 'BLOCK')
    fake.output = 'secret answer'
    payload = request().model_copy(update={'model': 'gpt-4o-mini'})
    db.integrations.update_one({'_id': ObjectId(payload.integration_id)}, {'$set': {
        'provider': 'openai', 'models': ['gpt-4o-mini'], 'model_prices': []}})
    with pytest.raises(RunOutcome) as error:
        execute(service, user, payload)
    assert error.value.run['status'] == 'blocked_output'
    assert error.value.run['cost_source'] == 'litellm'
    assert error.value.run['response_text'] is None
    stored = db.prompt_runs.find_one({'status': 'blocked_output'})
    assert stored['cost_status'] == 'known' and stored['estimated_cost_usd'] is not None
    assert 'response_ciphertext' not in stored
