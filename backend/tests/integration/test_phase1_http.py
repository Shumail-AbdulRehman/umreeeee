from datetime import datetime, timezone

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.api.dependencies.services import (get_auth_service, get_llm_integration_service,
    get_user_management_service)
from app.core.security import create_access_token, hash_password
from app.db.indexes import ensure_indexes
from app.main import app
from app.repositories.company_repository import CompanyRepository
from app.repositories.llm_integration_repository import LLMIntegrationRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.llm_integration_service import LLMIntegrationService
from app.services.user_management_service import UserManagementService


@pytest.fixture
def http_environment(test_database, monkeypatch):
    import app.main as main_module
    import app.api.routes.administration as admin_module
    import app.services.admin_common as common_module
    import app.services.user_management_service as users_module
    import app.services.llm_integration_service as integrations_module
    import app.core.rate_limits as limits_module

    db = test_database
    ensure_indexes(db)
    monkeypatch.setattr(main_module, 'get_mongo_client', lambda: db.client)
    monkeypatch.setattr(main_module, 'verify_transactions', lambda: None)
    monkeypatch.setattr(main_module, 'get_database', lambda: db)
    monkeypatch.setattr(admin_module, 'get_database', lambda: db)
    monkeypatch.setattr(common_module, 'get_database', lambda: db)
    monkeypatch.setattr(common_module, 'get_mongo_client', lambda: db.client)
    monkeypatch.setattr(users_module, 'get_database', lambda: db)
    monkeypatch.setattr(integrations_module, 'get_database', lambda: db)
    monkeypatch.setattr(limits_module, 'get_database', lambda: db)

    companies = CompanyRepository(db)
    users = UserRepository(db, companies)
    integrations = LLMIntegrationRepository(db, companies)
    app.dependency_overrides[get_auth_service] = lambda: AuthService(users, companies)
    app.dependency_overrides[get_user_management_service] = lambda: UserManagementService(users)
    app.dependency_overrides[get_llm_integration_service] = lambda: LLMIntegrationService(integrations)

    now = datetime.now(timezone.utc)
    identities = {}
    for label in ['a', 'b']:
        company_id = ObjectId()
        db.companies.insert_one({'_id': company_id, 'name': f'Company {label}', 'slug': label,
                                 'status': 'active', 'version': 1, 'administration_revision': 0,
                                 'settings': {'content_retention_days': 7, 'require_active_policy': True},
                                 'created_at': now, 'updated_at': now})
        for role in (['org_admin', 'user'] if label == 'a' else ['org_admin']):
            user_id = ObjectId()
            db.users.insert_one({'_id': user_id, 'company_id': company_id,
                                 'first_name': 'Test', 'last_name': role,
                                 'email': f'{label}-{role}@example.test', 'department': 'IT',
                                 'role': role, 'group_ids': [], 'password_hash': hash_password('test-password-123'),
                                 'is_email_verified': True, 'is_active': True,
                                 'token_version': 0, 'version': 1, 'created_at': now})
            identities[f'{label}_{role}'] = {'id': str(user_id), 'company_id': str(company_id),
                                            'headers': {'Authorization': f'Bearer {create_access_token(str(user_id), 0)}'}}
    try:
        with TestClient(app) as client:
            yield client, db, identities
    finally:
        app.dependency_overrides.clear()


def test_regular_user_cannot_mutate_admin_resources_and_tenants_are_hidden(http_environment):
    client, db, identities = http_environment
    regular = identities['a_user']['headers']
    admin_a = identities['a_org_admin']['headers']
    admin_b = identities['b_org_admin']['headers']

    forbidden = client.post('/api/groups', headers=regular, json={'name': 'Finance'})
    assert forbidden.status_code == 403
    assert forbidden.json()['detail']['code'] == 'forbidden'
    created = client.post('/api/groups', headers=admin_a, json={'name': 'Finance'})
    assert created.status_code == 201
    group_id = created.json()['group']['_id']
    assert client.get(f'/api/groups/{group_id}', headers=admin_b).status_code == 404
    assert client.put(f'/api/groups/{group_id}', headers=admin_b,
                      json={'name': 'Other', 'description': '', 'version': 1}).status_code == 404
    assert db.groups.count_documents({'company_id': ObjectId(identities['b_org_admin']['company_id'])}) == 0


def test_invalid_ids_unknown_fields_and_filters_return_safe_422(http_environment):
    client, _, identities = http_environment
    headers = identities['a_org_admin']['headers']
    responses = [
        client.get('/api/groups/not-an-object-id', headers=headers),
        client.post('/api/groups', headers=headers, json={'name': 'Finance', 'company_id': identities['b_org_admin']['company_id']}),
        client.get('/api/users?status=unknown', headers=headers),
    ]
    assert [response.status_code for response in responses] == [422, 422, 422]
    for response in responses:
        detail = response.json()['detail']
        assert detail['request_id']
        assert detail['code'] in {'invalid_id', 'validation_error'}
        assert 'Traceback' not in str(detail)


@pytest.mark.parametrize(('method', 'path', 'body'), [
    ('post', '/api/groups', {'name': 'Finance'}),
    ('post', '/api/users', {'first_name': 'Test', 'last_name': 'User', 'email': 'new@example.test',
                          'department': 'IT', 'role': 'user', 'group_ids': []}),
    ('post', '/api/integrations', {'provider': 'ollama', 'account_name': 'Local', 'models': ['demo']}),
    ('post', '/api/policies', {'name': 'Terms', 'category': 'custom', 'action': 'LOG',
                             'severity': 'medium', 'rules': [{'type': 'keyword', 'config': {'terms': ['secret']}}]}),
    ('put', '/api/settings', {'version': 1, 'name': 'Company A',
                            'content_retention_days': 7, 'require_active_policy': True}),
    ('put', f'/api/groups/{ObjectId()}', {'name': 'Finance', 'description': '', 'version': 1}),
    ('put', f'/api/users/{ObjectId()}', {'first_name': 'Test', 'last_name': 'User',
                                        'email': 'new@example.test', 'department': 'IT',
                                        'role': 'user', 'group_ids': [], 'version': 1}),
    ('put', f'/api/integrations/{ObjectId()}', {'provider': 'ollama', 'account_name': 'Local',
                                               'models': ['demo'], 'version': 1}),
    ('put', f'/api/policies/{ObjectId()}', {'name': 'Terms', 'category': 'custom', 'action': 'LOG',
                                          'severity': 'medium', 'version': 1,
                                          'rules': [{'type': 'keyword', 'config': {'terms': ['secret']}}]}),
    ('patch', f'/api/groups/{ObjectId()}/status', {'status': 'archived', 'version': 1}),
    ('patch', f'/api/integrations/{ObjectId()}/status', {'status': 'archived', 'version': 1}),
    ('patch', f'/api/policies/{ObjectId()}/status', {'status': 'archived', 'version': 1}),
    ('patch', f'/api/users/{ObjectId()}/status', {'is_active': False, 'version': 1}),
    ('patch', '/api/users/me/groups', {'group_ids': [], 'version': 1}),
    ('patch', f'/api/platform/organizations/{ObjectId()}/status', {'status': 'suspended', 'version': 1}),
])
def test_regular_user_is_denied_every_admin_mutation(http_environment, method, path, body):
    client, _, identities = http_environment
    response = getattr(client, method)(path, headers=identities['a_user']['headers'], json=body)
    assert response.status_code == 403


def test_org_admin_cannot_use_platform_endpoint(http_environment):
    client, _, identities = http_environment
    response = client.patch(f"/api/platform/organizations/{identities['b_org_admin']['company_id']}/status",
                            headers=identities['a_org_admin']['headers'],
                            json={'status': 'suspended', 'version': 1})
    assert response.status_code == 403


@pytest.mark.parametrize('role', ['org_admin', 'super_admin'])
def test_admin_can_assign_own_groups_without_other_account_changes(http_environment, role):
    client, db, identities = http_environment
    identity = identities['a_org_admin']
    uid, cid = ObjectId(identity['id']), ObjectId(identity['company_id'])
    db.users.update_one({'_id': uid}, {'$set': {'role': role}})
    before = db.users.find_one({'_id': uid})
    group = client.post('/api/groups', headers=identity['headers'], json={'name': 'Admin policy group'}).json()['group']['_id']
    mine = client.get('/api/users/me/groups', headers=identity['headers'])
    assert mine.status_code == 200 and mine.json()['user']['group_ids'] == []
    response = client.patch('/api/users/me/groups', headers=identity['headers'], json={'group_ids': [group], 'version': 1})
    assert response.status_code == 200
    assert response.json()['user']['group_ids'] == [group]
    assert response.json()['user']['version'] == 2
    after = db.users.find_one({'_id': uid})
    for key in ('role', 'email', 'password_hash', 'token_version', 'is_active', 'is_email_verified'):
        assert after[key] == before[key]
    assert db.users.find_one({'_id': ObjectId(identities['a_user']['id'])})['group_ids'] == []
    event = db.audit_events.find_one({'action': 'user.groups_updated'})
    assert event['actor_user_id'] == uid and event['resource_id'] == uid
    assert event['before']['group_ids'] == [] and event['after']['group_ids'] == [ObjectId(group)]
    stale = client.patch('/api/users/me/groups', headers=identity['headers'], json={'group_ids': [], 'version': 1})
    assert stale.status_code == 409 and stale.json()['detail']['code'] == 'stale_version'
    assert db.users.find_one({'_id': uid})['group_ids'] == [ObjectId(group)]


def test_own_group_assignment_rejects_invalid_scope_and_extra_fields(http_environment):
    client, db, identities = http_environment
    identity = identities['a_org_admin']
    group = client.post('/api/groups', headers=identity['headers'], json={'name': 'Active'}).json()['group']['_id']
    foreign = client.post('/api/groups', headers=identities['b_org_admin']['headers'], json={'name': 'Foreign'}).json()['group']['_id']
    archived = client.post('/api/groups', headers=identity['headers'], json={'name': 'Archived'}).json()['group']['_id']
    db.groups.update_one({'_id': ObjectId(archived)}, {'$set': {'status': 'archived'}})
    for ids in ([foreign], [archived], [group, group], [str(ObjectId())], ['invalid']):
        assert client.patch('/api/users/me/groups', headers=identity['headers'], json={'group_ids': ids, 'version': 1}).status_code == 422
    for field, value in {'role': 'user', 'is_active': False, 'user_id': identities['a_user']['id'], 'company_id': identities['b_org_admin']['company_id']}.items():
        assert client.patch('/api/users/me/groups', headers=identity['headers'], json={'group_ids': [group], 'version': 1, field: value}).status_code == 422
    assert client.get('/api/users/me/groups', headers=identities['a_user']['headers']).status_code == 403
    assert db.users.find_one({'_id': ObjectId(identity['id'])})['group_ids'] == []
    assert db.audit_events.count_documents({'action': 'user.groups_updated'}) == 0


def test_admin_policy_assignment_is_optional_but_assigned_policies_apply(http_environment):
    from uuid import uuid4
    from app.api.routes.prompts import protected_service
    from app.services.protected_prompt_service import ProtectedPromptService
    from app.services.provider_service import ProviderResult

    client, db, identities = http_environment
    identity = identities['a_org_admin']
    group = ObjectId()
    integration = ObjectId()
    cid = ObjectId(identity['company_id'])
    db.groups.insert_one({'_id': group, 'company_id': cid, 'status': 'active', 'name': 'Admin checks'})
    db.integrations.insert_one({'_id': integration, 'company_id': cid, 'status': 'active',
        'account_name': 'Synthetic only', 'provider': 'ollama', 'models': ['fake-model'], 'system_prompt': ''})
    db.policies.insert_one({'company_id': cid, 'name': 'Restricted terms', 'category': 'custom',
        'assignment_mode': 'explicit_groups', 'action': 'BLOCK', 'severity': 'high', 'status': 'active',
        'scope': {'group_ids': [group], 'integration_ids': []}, 'stages': ['input'], 'version': 1,
        'rules': [{'rule_id': 'restricted', 'type': 'keyword', 'config': {'terms': ['restricted']}}]})

    class Provider:
        calls = 0
        def execute(self, *args):
            self.calls += 1
            return ProviderResult('Synthetic reply', 1, 1, 2, 'fake', 'stop', 1)

    provider = Provider()
    app.dependency_overrides[protected_service] = lambda: ProtectedPromptService(db, provider)
    context = client.get('/api/prompt-workspace/context', headers=identity['headers']).json()
    assert context['groups'] == [] and context['enforcement_ready'] is True
    assert context['require_active_policy'] is False
    assert context['input_policy_coverage'][str(integration)] is False
    body = {'integration_id': str(integration), 'model': 'fake-model', 'prompt': 'hello'}
    def send(text):
        return client.post('/api/prompt-workspace/run', headers={**identity['headers'], 'Idempotency-Key': str(uuid4())}, json={**body, 'prompt': text})
    unassigned = send('hello')
    assert unassigned.status_code == 200 and unassigned.json()['run']['status'] == 'allowed'
    assert provider.calls == 1
    assert client.patch('/api/users/me/groups', headers=identity['headers'], json={'group_ids': [str(group)], 'version': 1}).status_code == 200
    context = client.get('/api/prompt-workspace/context', headers=identity['headers']).json()
    assert context['groups'] == [{'id': str(group), 'name': 'Admin checks'}]
    assert context['enforcement_ready'] is True and context['input_policy_coverage'][str(integration)] is True
    assert send('hello').status_code == 200 and provider.calls == 2
    blocked = send('restricted')
    assert blocked.status_code == 403 and blocked.json()['run']['status'] == 'blocked_input'
    assert provider.calls == 2
