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
