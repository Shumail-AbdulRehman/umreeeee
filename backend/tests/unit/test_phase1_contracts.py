from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.administration import PolicyInput
from app.core.encryption import decrypt_credential, encrypt_credential
from app.core.security import create_access_token
from app.schemas.auth import SignupRequest
from app.services.auth_service import AuthService
from app.services.email_service import send_verification_email
from app.services.llm_integration_service import LLMIntegrationService
from app.services.user_management_service import UserManagementService
from scripts.migrate_phase1 import inspect, inspect_import_target


def test_signup_existing_slug_cannot_join_organization():
    users = SimpleNamespace(find_by_email=lambda email: None)
    companies = SimpleNamespace(find_by_slug=lambda slug: SimpleNamespace(id='other-company'))
    service = AuthService(users, companies)
    with pytest.raises(HTTPException) as error:
        service.signup(SignupRequest(first_name='Ava', last_name='Jones', company_name='Acme',
                                     email='new@example.com', password='longpassword', confirm_password='longpassword'))
    assert error.value.status_code == 409


def test_auth_response_uses_immutable_id_and_version():
    user = SimpleNamespace(id='507f1f77bcf86cd799439011', token_version=3,
        first_name='Ava', last_name='Jones', email='ava@example.com', department='IT', role='org_admin',
        groups=[], group_ids=[], is_active=True, is_email_verified=True, account_status='active',
        created_at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc),
        company=SimpleNamespace(id='507f1f77bcf86cd799439012', name='Acme', slug='acme', status='active', version=1,
                                 created_at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc)))
    response = AuthService.build_auth_response(user)
    assert response.access_token
    assert response.user.role == 'org_admin'
    assert create_access_token(user.id, 3) != create_access_token(user.id, 4)


def test_credentials_are_encrypted_and_not_prefix_masked():
    secret = 'sk-sensitive-value-1234'
    ciphertext = encrypt_credential(secret)
    assert secret not in ciphertext
    assert decrypt_credential(ciphertext) == secret
    assert LLMIntegrationService.mask_api_key(secret) == '••••1234'


def test_disallowed_ollama_origin_is_rejected():
    from app.core.errors import DomainError
    for url in ['http://example.com', 'http://127.0.0.1:11434@evil.com',
                'http://127.0.0.1:11434/path', 'http://127.0.0.1:11434?x=1']:
        with pytest.raises(DomainError):
            LLMIntegrationService.validate_ollama_url(url)


def test_policy_rules_are_typed_and_reject_unknown_fields():
    good = {'name': 'Sensitive terms', 'category': 'custom', 'action': 'BLOCK', 'severity': 'high',
            'rules': [{'type': 'keyword', 'config': {'terms': ['confidential']}}]}
    assert PolicyInput.model_validate(good).rules[0].type == 'keyword'
    with pytest.raises(ValidationError):
        PolicyInput.model_validate({**good, 'rules': [{'type': 'keyword', 'config': {'terms': [], 'unknown': True}}]})
    with pytest.raises(ValidationError):
        PolicyInput.model_validate({**good, 'company_id': 'another-company'})


def test_last_admin_guard():
    from app.core.errors import DomainError
    db = SimpleNamespace(users=SimpleNamespace(count_documents=lambda *args, **kwargs: 0))
    actor = SimpleNamespace(company=SimpleNamespace(id='507f1f77bcf86cd799439012'))
    target = {'_id': __import__('bson').ObjectId(), 'role': 'org_admin', 'is_active': True,
              'is_email_verified': True}
    with pytest.raises(DomainError) as error:
        UserManagementService.ensure_other_admin(db, actor, target, None)
    assert error.value.code == 'last_admin'


def test_migration_stops_unknown_roles():
    records = {'companies': [{'_id': 'company', 'slug': 'acme'}],
               'users': [{'_id': 'user', 'email': 'a@example.com', 'role': 'Owner'}],
               'integrations': [], 'prompt_runs': []}
    assert any('unmapped role' in value for value in inspect(records))


def test_email_unavailable_never_logs_code(monkeypatch, caplog):
    import app.services.email_service as email_service
    monkeypatch.setattr(email_service, 'SMTP_ENABLED', False)
    code = '123456'
    result = send_verification_email('someone@example.com', code)
    assert not result.delivered
    assert code not in caplog.text


def test_mongo_failure_never_selects_json_fallback(monkeypatch):
    import app.db.mongo as mongo
    from pymongo.errors import ServerSelectionTimeoutError
    monkeypatch.setattr(mongo, 'get_mongo_client', lambda: (_ for _ in ()).throw(ServerSelectionTimeoutError('offline')))
    with pytest.raises(ServerSelectionTimeoutError):
        mongo.get_database()


def test_regular_user_cannot_administer():
    from app.core.permissions import require_admin
    with pytest.raises(HTTPException) as error:
        require_admin(SimpleNamespace(role='user'))
    assert error.value.status_code == 403


def test_liveness_and_readiness_when_mongo_is_unavailable(monkeypatch):
    from fastapi.testclient import TestClient
    from pymongo.errors import ServerSelectionTimeoutError
    import app.main as main_module
    import app.api.routes.health as health_module

    monkeypatch.setattr(main_module, 'get_mongo_client', lambda: None)
    monkeypatch.setattr(main_module, 'verify_transactions',
                        lambda: (_ for _ in ()).throw(ServerSelectionTimeoutError('offline')))
    monkeypatch.setattr(health_module, 'get_database_status',
                        lambda: {'status': 'unavailable', 'mode': 'mongodb', 'database_name': 'test'})
    with TestClient(main_module.app) as client:
        assert client.get('/api/health').status_code == 200
        assert client.get('/api/ready').status_code == 503


def test_integration_repository_never_persists_plaintext_key():
    from datetime import datetime, timezone
    from app.models.llm_integration import LLMIntegration
    from app.repositories.llm_integration_repository import LLMIntegrationRepository
    company = SimpleNamespace(id='507f1f77bcf86cd799439012')
    model = LLMIntegration(id='507f1f77bcf86cd799439013', company=company,
        provider='openai', account_name='Main', api_key='sk-top-secret', policy_name='', models=['gpt-test'],
        created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    repo = LLMIntegrationRepository.__new__(LLMIntegrationRepository)
    document = repo._to_document(model)
    assert 'api_key' not in document
    assert 'sk-top-secret' not in str(document)
    assert decrypt_credential(document['api_key_ciphertext']) == 'sk-top-secret'


def test_ollama_redirect_is_rejected():
    from app.services.llm_integration_service import RejectRedirect
    with pytest.raises(HTTPException) as error:
        RejectRedirect().redirect_request(None, None, 302, 'Found', {}, 'http://other-host')
    assert error.value.status_code == 502


def test_provider_model_discovery_rejects_malformed_lists(monkeypatch):
    service = LLMIntegrationService(None)
    monkeypatch.setattr(service, 'read_json_response', lambda request: {'data': 'not a list'})
    with pytest.raises(HTTPException) as error:
        service.fetch_openai_compatible_models('openai', 'test-key')
    assert error.value.status_code == 502
    monkeypatch.setattr(service, 'read_json_response', lambda request: {'data': [None]})
    with pytest.raises(HTTPException) as error:
        service.fetch_anthropic_models('test-key')
    assert error.value.status_code == 502


def test_migration_detects_missing_company_and_target_collision():
    from bson import ObjectId
    company_id = ObjectId()
    another_id = ObjectId()
    user_id = ObjectId()
    source = {'companies': [{'_id': company_id, 'slug': 'acme'}],
              'users': [{'_id': user_id, 'company_id': another_id,
                         'email': 'a@example.com', 'role': 'employee'}],
              'integrations': [], 'prompt_runs': []}
    assert any('missing company' in conflict for conflict in inspect(source))
    target = {'companies': [{'_id': another_id, 'slug': 'ACME'}],
              'users': [], 'integrations': [], 'prompt_runs': []}
    assert any('conflicting target identity' in conflict
               for conflict in inspect_import_target(source, target))
