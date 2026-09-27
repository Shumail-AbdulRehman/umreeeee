from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

import pytest
from bson import ObjectId
from bson import json_util

from app.api.routes import administration as admin
from app.core.errors import DomainError
from app.db.indexes import ensure_indexes
from app.services import admin_common
from app.services.user_management_service import UserManagementService
from app.repositories.company_repository import CompanyRepository
from app.repositories.llm_integration_repository import LLMIntegrationRepository
from app.schemas.integrations import LLMAvailableModelsRequest, LLMIntegrationCreateRequest, LLMIntegrationUpdateRequest
from app.services.llm_integration_service import LLMIntegrationService
from app.schemas.users import ManagedUserUpdateRequest
from app.services.prompt_workspace_service import PromptWorkspaceService
from scripts.migrate_phase1 import import_source, inspect, inspect_import_target, load_source, migrate, source_records


def actor(company, role='org_admin'):
    return SimpleNamespace(id=str(ObjectId()), role=role,
                           token_version=0,
                           company=SimpleNamespace(id=str(company['_id'])))


def request():
    return SimpleNamespace(state=SimpleNamespace(request_id='phase1-test'))


@pytest.fixture
def resources(test_database, monkeypatch):
    db = test_database
    ensure_indexes(db)
    now = admin.utcnow()
    company_a = {'_id': ObjectId(), 'name': 'A', 'slug': 'a', 'status': 'active',
                 'version': 1, 'administration_revision': 0, 'created_at': now}
    company_b = {'_id': ObjectId(), 'name': 'B', 'slug': 'b', 'status': 'active',
                 'version': 1, 'administration_revision': 0, 'created_at': now}
    db.companies.insert_many([company_a, company_b])
    monkeypatch.setattr(admin, 'get_database', lambda: db)
    monkeypatch.setattr(admin_common, 'get_database', lambda: db)
    monkeypatch.setattr(admin_common, 'get_mongo_client', lambda: db.client)
    return db, actor(company_a), actor(company_b)


def test_cross_tenant_group_id_is_not_visible(resources):
    db, a, b = resources
    created = admin.create_group(admin.GroupInput(name='Finance'), request(), a)['group']
    assert created['name'] == 'Finance'
    with pytest.raises(DomainError) as error:
        admin.get_group(created['_id'], b)
    assert error.value.status_code == 404
    assert db.groups.count_documents({'company_id': ObjectId(b.company.id)}) == 0


def test_policy_revision_is_immutable_and_stale_edit_conflicts(resources):
    db, a, _ = resources
    original = admin.create_policy(admin.PolicyInput.model_validate({
        'name': 'Terms', 'category': 'custom', 'action': 'LOG', 'severity': 'medium',
        'rules': [{'type': 'keyword', 'config': {'terms': ['secret']}}],
    }), request(), a)['policy']
    policy_id = original['_id']
    update = admin.PolicyUpdate.model_validate({
        'name': 'Terms', 'description': 'Updated', 'category': 'custom', 'action': 'BLOCK',
        'severity': 'high', 'status': 'active', 'rules': original['rules'], 'version': 1,
    })
    changed = admin.edit_policy(policy_id, update, request(), a)['policy']
    assert changed['version'] == 2
    assert db.policy_versions.count_documents({'policy_id': ObjectId(policy_id)}) == 2
    first = db.policy_versions.find_one({'policy_id': ObjectId(policy_id), 'version': 1})
    assert first['snapshot']['action'] == 'LOG'
    with pytest.raises(DomainError) as error:
        admin.edit_policy(policy_id, update, request(), a)
    assert error.value.code == 'stale_version'


def test_scoped_policy_prevents_group_archive(resources):
    db, a, b = resources
    group = admin.create_group(admin.GroupInput(name='Finance'), request(), a)['group']
    policy = admin.create_policy(admin.PolicyInput.model_validate({
        'name': 'Financial terms', 'category': 'custom', 'action': 'LOG', 'severity': 'medium',
        'scope': {'group_ids': [group['_id']]},
        'rules': [{'type': 'keyword', 'config': {'terms': ['confidential']}}],
    }), request(), a)['policy']
    with pytest.raises(DomainError) as error:
        admin.group_status(group['_id'], admin.GroupStatus(status='archived', version=1), request(), a)
    assert error.value.code == 'group_in_use'
    assert admin.get_group(group['_id'], a)['group']['policy_count'] == 1
    assert db.groups.find_one({'_id': ObjectId(group['_id'])})['status'] == 'active'
    with pytest.raises(DomainError) as error:
        admin.get_policy(policy['_id'], b)
    assert error.value.status_code == 404


def test_migration_is_idempotent_for_groups_and_encryption(test_database):
    db = test_database
    company_id, user_id, integration_id = ObjectId(), ObjectId(), ObjectId()
    db.companies.insert_one({'_id': company_id, 'name': 'Legacy', 'slug': 'legacy'})
    db.users.insert_one({'_id': user_id, 'company_id': company_id, 'email': 'ADMIN@example.com',
                         'role': 'Manager', 'groups': ['Finance', 'finance']})
    db.integrations.insert_one({'_id': integration_id, 'company_id': company_id,
                                'provider': 'openai', 'account_name': 'Primary', 'api_key': 'sk-legacy'})
    migrate(db, source_records(db))
    first = db.integrations.find_one({'_id': integration_id})['api_key_ciphertext']
    migrate(db, source_records(db))
    assert db.groups.count_documents({'company_id': company_id}) == 1
    assert db.users.find_one({'_id': user_id})['role'] == 'org_admin'
    assert len(db.users.find_one({'_id': user_id})['group_ids']) == 1
    integration = db.integrations.find_one({'_id': integration_id})
    assert integration['api_key_ciphertext'] == first
    assert 'api_key' not in integration


def test_user_status_filters_and_invitation_delivery_are_real(resources, monkeypatch):
    db, a, _ = resources
    import app.services.user_management_service as user_module
    monkeypatch.setattr(user_module, 'get_database', lambda: db)
    now = admin.utcnow()
    rows = [
        {'email': 'active@example.test', 'password_hash': 'hash', 'is_email_verified': True,
         'is_active': True, 'invitation_token_hash': None},
        {'email': 'invited@example.test', 'password_hash': None, 'is_email_verified': False,
         'is_active': True, 'invitation_token_hash': 'hash', 'invitation_delivery_status': 'failed'},
        {'email': 'pending@example.test', 'password_hash': 'hash', 'is_email_verified': False,
         'is_active': True, 'invitation_token_hash': None},
        {'email': 'inactive@example.test', 'password_hash': 'hash', 'is_email_verified': True,
         'is_active': False, 'invitation_token_hash': None},
    ]
    db.users.insert_many([{**row, 'company_id': ObjectId(a.company.id), 'first_name': 'Test',
                           'last_name': 'User', 'department': 'IT', 'role': 'user',
                           'group_ids': [], 'version': 1, 'created_at': now} for row in rows])
    service = UserManagementService(None)
    for state, email in [('active', 'active@example.test'), ('invited', 'invited@example.test'),
                         ('pending_verification', 'pending@example.test'), ('inactive', 'inactive@example.test')]:
        result = service.list_company_users(a, status=state)
        assert [item.email for item in result['items']] == [email]
    invited = service.list_company_users(a, status='invited')['items'][0]
    assert invited.invitation_delivery_status == 'failed'


def test_suspended_company_cannot_mutate_with_stale_actor(resources):
    db, a, _ = resources
    db.companies.update_one({'_id': ObjectId(a.company.id)}, {'$set': {'status': 'suspended'}})
    with pytest.raises(DomainError) as error:
        admin.create_group(admin.GroupInput(name='Blocked'), request(), a)
    assert error.value.code == 'organization_unavailable'
    assert db.groups.count_documents({'company_id': ObjectId(a.company.id)}) == 0


def test_integration_credential_is_encrypted_and_blank_edit_preserves_it(resources):
    from app.core.encryption import decrypt_credential
    db, a, b = resources
    service = LLMIntegrationService(LLMIntegrationRepository(db, CompanyRepository(db)))
    created = service.create_integration(a, LLMIntegrationCreateRequest(
        provider='openai', account_name='Primary', api_key='sk-test-secret-1234', models=['model-a']),
        'phase1-test').integration
    stored = db.integrations.find_one({'_id': ObjectId(created.id)})
    assert 'api_key' not in stored
    assert decrypt_credential(stored['api_key_ciphertext']) == 'sk-test-secret-1234'
    assert created.masked_api_key == '••••1234'
    assert 'ciphertext' not in created.model_dump()
    with pytest.raises(DomainError) as error:
        service.get_integration(b, created.id)
    assert error.value.status_code == 404

    updated = service.update_integration(a, created.id, LLMIntegrationUpdateRequest(
        version=1, provider='openai', account_name='Primary', api_key='', models=['model-a'],
        system_prompt='Use brief answers.'), 'phase1-test').integration
    assert updated.version == 2
    assert db.integrations.find_one({'_id': ObjectId(created.id)})['api_key_ciphertext'] == stored['api_key_ciphertext']


def test_ollama_without_key_and_policy_reference_blocks_archive(resources):
    db, a, _ = resources
    service = LLMIntegrationService(LLMIntegrationRepository(db, CompanyRepository(db)))
    created = service.create_integration(a, LLMIntegrationCreateRequest(
        provider='ollama', account_name='Local', api_key=None, models=['local-model']),
        'phase1-test').integration
    assert created.has_api_key is False
    policy = admin.create_policy(admin.PolicyInput.model_validate({
        'name': 'Local safety', 'category': 'custom', 'action': 'LOG', 'severity': 'medium',
        'scope': {'integration_ids': [created.id]},
        'rules': [{'type': 'keyword', 'config': {'terms': ['secret']}}],
    }), request(), a)['policy']
    with pytest.raises(DomainError) as error:
        service.set_status(a, created.id, 'archived', 1, 'phase1-test')
    assert error.value.code == 'integration_in_use'
    assert service.get_integration(a, created.id)['integration'].policy_count == 1
    assert db.policies.find_one({'_id': ObjectId(policy['_id'])})['status'] == 'draft'


def test_super_admin_can_suspend_other_organization_but_not_own(resources):
    db, a, b = resources
    a.role = 'super_admin'
    changed = admin.organization_status(b.company.id, admin.CompanyStatus(status='suspended', version=1),
                                        request(), a)['organization']
    assert changed['status'] == 'suspended'
    assert db.companies.find_one({'_id': ObjectId(b.company.id)})['status'] == 'suspended'
    assert db.audit_events.count_documents({'company_id': ObjectId(b.company.id),
                                            'action': 'platform.organization_status_changed'}) == 1
    with pytest.raises(DomainError) as own:
        admin.organization_status(a.company.id, admin.CompanyStatus(status='suspended', version=1), request(), a)
    assert own.value.code == 'own_company'


def test_concurrent_final_admin_demotions_preserve_one_admin(resources, monkeypatch):
    import app.services.user_management_service as user_module
    db, actor_a, _ = resources
    monkeypatch.setattr(user_module, 'get_database', lambda: db)
    now = admin.utcnow()
    ids = [ObjectId(), ObjectId()]
    for index, user_id in enumerate(ids):
        db.users.insert_one({'_id': user_id, 'company_id': ObjectId(actor_a.company.id),
                             'first_name': 'Admin', 'last_name': str(index),
                             'email': f'admin{index}@example.test', 'department': 'IT',
                             'role': 'org_admin', 'group_ids': [], 'password_hash': 'hash',
                             'is_email_verified': True, 'is_active': True,
                             'version': 1, 'created_at': now})
    service = UserManagementService(None)

    def demote(index):
        payload = ManagedUserUpdateRequest(first_name='Admin', last_name='Last',
            email=f'admin{index}@example.test', department='IT', role='user', group_ids=[], version=1)
        try:
            service.update_user(actor_a, str(ids[index]), payload, 'phase1-test')
            return 'updated'
        except DomainError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(demote, [0, 1]))
    assert sorted(outcomes) == ['last_admin', 'updated']
    assert db.users.count_documents({'company_id': ObjectId(actor_a.company.id),
                                     'role': 'org_admin', 'is_active': True,
                                     'is_email_verified': True}) == 1


def test_provider_execution_preflight_blocks_suspended_company(resources, monkeypatch):
    import app.services.prompt_workspace_service as prompts_module
    import app.services.llm_integration_service as integrations_module
    db, a, _ = resources
    monkeypatch.setattr(prompts_module, 'get_database', lambda: db)
    monkeypatch.setattr(integrations_module, 'get_database', lambda: db)
    db.users.insert_one({'_id': ObjectId(a.id), 'company_id': ObjectId(a.company.id),
                         'is_active': True, 'is_email_verified': True, 'token_version': 0})
    PromptWorkspaceService.ensure_account_available(a)
    db.users.update_one({'_id': ObjectId(a.id)}, {'$inc': {'token_version': 1}})
    with pytest.raises(DomainError) as revoked:
        PromptWorkspaceService.ensure_account_available(a)
    assert revoked.value.code == 'account_unavailable'
    db.users.update_one({'_id': ObjectId(a.id)}, {'$set': {'token_version': 0}})
    db.companies.update_one({'_id': ObjectId(a.company.id)}, {'$set': {'status': 'suspended'}})
    with pytest.raises(DomainError) as error:
        PromptWorkspaceService.ensure_account_available(a)
    assert error.value.code == 'organization_unavailable'
    service = LLMIntegrationService(None)
    with pytest.raises(DomainError) as error:
        service.fetch_available_models(a, LLMAvailableModelsRequest(provider='ollama'))
    assert error.value.code == 'organization_unavailable'


def test_explicit_legacy_json_import_preserves_source_and_is_repeatable(test_database, tmp_path, monkeypatch):
    import scripts.migrate_phase1 as migration
    db = test_database
    monkeypatch.setattr(migration, 'get_mongo_client', lambda: db.client)
    company_id, user_id, integration_id = ObjectId(), ObjectId(), ObjectId()
    source = {'collections': {
        'companies': {'documents': {str(company_id): {'_id': company_id, 'name': 'Legacy', 'slug': 'legacy'}}},
        'users': {'documents': {str(user_id): {'_id': user_id, 'company_id': company_id,
            'first_name': 'Old', 'last_name': 'Admin', 'email': 'admin@example.test',
            'role': 'Manager', 'groups': ['Finance'], 'password_hash': 'hash'}}},
        'integrations': {'documents': {str(integration_id): {'_id': integration_id,
            'company_id': company_id, 'provider': 'openai', 'account_name': 'Primary',
            'api_key': 'sk-legacy-secret', 'models': ['model-a']}}},
        'prompt_runs': {'documents': {}},
    }}
    path = tmp_path / 'legacy-app.db'
    path.write_text(json_util.dumps(source), encoding='utf-8')
    original = path.read_bytes()
    records = load_source(path)
    assert inspect(records) == []
    assert inspect_import_target(records, source_records(db)) == []
    import_source(db, records)
    migrate(db, source_records(db))
    import_source(db, records)
    migrate(db, source_records(db))
    assert path.read_bytes() == original
    assert db.groups.count_documents({'company_id': company_id}) == 1
    assert db.users.find_one({'_id': user_id})['role'] == 'org_admin'
    stored = db.integrations.find_one({'_id': integration_id})
    assert 'api_key' not in stored
    assert db.integrations.count_documents({}) == 1
