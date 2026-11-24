from types import SimpleNamespace
from uuid import uuid4

from bson import ObjectId
from fastapi.testclient import TestClient
import pytest

from app.api.dependencies.auth import get_current_user
from app.api.routes import red_team as routes
from app.db.indexes import ensure_indexes
from app.main import app
from app.services.red_team_service import RedTeamService


@pytest.fixture
def promptfoo_api(test_database):
    db = test_database
    ensure_indexes(db)
    company, admin, target, grader = ObjectId(), ObjectId(), ObjectId(), ObjectId()
    db.companies.insert_one({
        '_id': company, 'name': 'Synthetic', 'slug': str(company), 'status': 'active',
        'administration_revision': 0, 'settings': {'require_active_policy': True, 'content_retention_days': 7},
    })
    db.users.insert_one({
        '_id': admin, 'company_id': company, 'first_name': 'Test', 'last_name': 'Admin',
        'email': 'promptfoo-api@example.test', 'role': 'org_admin', 'is_active': True,
        'is_email_verified': True, 'group_ids': [], 'token_version': 0,
    })
    for integration_id, name, model in ((target, 'Target', 'target-model'), (grader, 'Grader', 'grader-model')):
        db.integrations.insert_one({
            '_id': integration_id, 'company_id': company, 'status': 'active', 'provider': 'groq',
            'account_name': name, 'account_name_normalized': name.casefold(), 'models': [model],
            'system_prompt': 'Synthetic instruction.', 'api_key_ciphertext': 'encrypted-only',
        })
    user = SimpleNamespace(
        id=str(admin), role='org_admin', token_version=0, group_ids=[],
        company=SimpleNamespace(id=str(company)),
    )
    ready = lambda: {'available': True, 'cloud_key_configured': True, 'version': '0.126.0'}
    return db, user, RedTeamService(db, runtime_check=ready), target, grader


def values(target, grader, **changes):
    payload = {
        'name': 'Promptfoo API test',
        'purpose': 'Help users safely while refusing requests for private records.',
        'integration_id': str(target), 'model': 'target-model', 'mode': 'raw',
        'subject_user_id': None, 'plugins': ['pii:direct'], 'strategies': ['base64'],
        'tests_per_plugin': 1,
        'grader': {'integration_id': str(grader), 'model': 'grader-model'},
        'threshold_score': .8,
    }
    payload.update(changes)
    return payload


def test_promptfoo_api_create_preview_edit_launch_clone_cancel_and_tenant(promptfoo_api):
    db, user, service, target, grader = promptfoo_api
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[routes.service] = lambda: service
    try:
        client = TestClient(app)
        config = values(target, grader)
        preview = client.post('/api/red-team/config-preview', json=config)
        assert preview.status_code == 200
        assert 'redteam:' in preview.json()['yaml'] and 'pii:direct' in preview.json()['yaml']
        assert 'encrypted-only' not in preview.text and 'apiKey' not in preview.text

        created = client.post('/api/red-team/tests', json=config)
        assert created.status_code == 201
        draft = created.json()['test']
        path = '/api/red-team/tests/' + draft['id']
        stored_preview = client.get(path + '/config-preview')
        assert stored_preview.status_code == 200 and 'pii:direct' in stored_preview.json()['yaml']

        edited = client.put(path, json={**config, 'name': 'Edited promptfoo test', 'version': 1})
        assert edited.status_code == 200 and edited.json()['test']['version'] == 2
        key = str(uuid4())
        for _ in range(2):
            launched = client.post(path + '/launch', json={'version': 2}, headers={'Idempotency-Key': key})
            assert launched.status_code == 202
        assert db.red_team_jobs.count_documents({'test_id': ObjectId(draft['id']), 'kind': 'run'}) == 1
        stored = db.red_team_tests.find_one({'_id': ObjectId(draft['id'])})
        snapshot_text = str(stored['config_snapshot'])
        assert 'encrypted-only' not in snapshot_text
        assert stored['config_snapshot']['config_hash'] and stored['config_snapshot']['grader']['integration_id'] == grader

        suite_id = ObjectId()
        db.red_team_suites.insert_one({
            '_id': suite_id, 'company_id': ObjectId(user.company.id),
            'config_hash': stored['config_snapshot']['config_hash'], 'test_count': 1,
            'suite': {'tests': [{'vars': {'prompt': 'case text stays internal'}}]},
        })
        db.red_team_tests.update_one({'_id': stored['_id']}, {'$set': {'suite_id': suite_id}})
        clone = client.post(path + '/clone', json={}).json()['test']
        assert clone['suite_id'] == str(suite_id)
        assert clone['comparison_group_id'] == draft['comparison_group_id']
        clone_path = '/api/red-team/tests/' + clone['id']
        for clone_preview in (
            client.get(clone_path + '/config-preview'),
            client.post('/api/red-team/config-preview', params={'test_id': clone['id']}, json=config),
        ):
            assert clone_preview.status_code == 200
            assert clone_preview.json()['generated_tests_estimate'] == 1
            assert 'stored test case' in clone_preview.json()['yaml']
            assert 'case text stays internal' not in clone_preview.json()['yaml']
        invalid_edit = client.put(clone_path, json={**config, 'plugins': ['prompt-extraction'], 'version': 1})
        assert invalid_edit.status_code == 409 and invalid_edit.json()['detail']['code'] == 'suite_config_locked'
        allowed_edit = client.put(clone_path, json={**config, 'name': 'Updated clone', 'version': 1})
        assert allowed_edit.status_code == 200 and allowed_edit.json()['test']['progress']['planned'] == 1

        cancel = client.post(path + '/cancel')
        assert cancel.status_code == 200 and cancel.json()['test']['status'] == 'cancelled'

        running = client.post('/api/red-team/tests', json={**config, 'name': 'Running test'}).json()['test']
        running_path = '/api/red-team/tests/' + running['id']
        client.post(running_path + '/launch', json={'version': 1}, headers={'Idempotency-Key': str(uuid4())})
        db.red_team_tests.update_one({'_id': ObjectId(running['id'])}, {'$set': {'status': 'running'}})
        assert client.post(running_path + '/cancel').json()['test']['status'] == 'cancelling'

        foreign_company, foreign_admin = ObjectId(), ObjectId()
        db.companies.insert_one({'_id': foreign_company, 'name': 'Other', 'slug': str(foreign_company),
                                 'status': 'active', 'administration_revision': 0})
        db.users.insert_one({'_id': foreign_admin, 'company_id': foreign_company, 'email': 'other@example.test',
                             'role': 'org_admin', 'is_active': True, 'is_email_verified': True})
        outsider = SimpleNamespace(id=str(foreign_admin), role='org_admin', company=SimpleNamespace(id=str(foreign_company)))
        app.dependency_overrides[get_current_user] = lambda: outsider
        assert client.get(path).status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_unsupported_provider_and_missing_runtime(promptfoo_api):
    db, user, service, _target, grader = promptfoo_api
    unsupported = ObjectId()
    db.integrations.insert_one({
        '_id': unsupported, 'company_id': ObjectId(user.company.id), 'status': 'active',
        'provider': 'cohere', 'account_name': 'Unsupported', 'models': ['model'],
    })
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[routes.service] = lambda: service
    try:
        client = TestClient(app)
        response = client.post('/api/red-team/tests', json=values(
            unsupported, grader, model='model', name='Unsupported provider test',
        ))
        assert response.status_code == 422 and response.json()['detail']['code'] == 'unsupported_provider'

        unavailable = RedTeamService(db, runtime_check=lambda: {
            'available': False, 'cloud_key_configured': False, 'version': None,
        })
        app.dependency_overrides[routes.service] = lambda: unavailable
        draft = client.post('/api/red-team/tests', json=values(_target, grader, name='Unavailable runtime')).json()['test']
        response = client.post(
            f"/api/red-team/tests/{draft['id']}/launch", json={'version': 1},
            headers={'Idempotency-Key': str(uuid4())},
        )
        assert response.status_code == 409 and response.json()['detail']['code'] == 'promptfoo_unavailable'
    finally:
        app.dependency_overrides.clear()
