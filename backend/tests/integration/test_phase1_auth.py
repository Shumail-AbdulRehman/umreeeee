from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.db.indexes import ensure_indexes
from app.repositories.company_repository import CompanyRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (AcceptInvitationRequest, ForgotPasswordRequest, LoginRequest,
                              ResendVerificationRequest, ResetPasswordRequest, SignupRequest, VerificationRequest)
from app.core.security import hash_invitation_token
from bson import ObjectId
from app.services.auth_service import AuthService
from app.services.email_service import EmailDeliveryResult


@pytest.fixture
def auth_environment(test_database, monkeypatch):
    import app.services.auth_service as auth_module

    database = test_database
    ensure_indexes(database)
    monkeypatch.setattr(auth_module, 'get_mongo_client', lambda: database.client)
    sent = {'verification': [], 'reset': []}

    def deliver_verification(email, code):
        sent['verification'].append((email, code))
        return EmailDeliveryResult(delivered=True, mode='fake')

    def deliver_reset(email, code):
        sent['reset'].append((email, code))
        return EmailDeliveryResult(delivered=True, mode='fake')

    monkeypatch.setattr(auth_module, 'send_verification_email', deliver_verification)
    monkeypatch.setattr(auth_module, 'send_password_reset_email', deliver_reset)
    companies = CompanyRepository(database)
    service = AuthService(UserRepository(database, companies), companies)
    return SimpleNamespace(db=database, service=service, sent=sent)


def signup_payload(email='admin@example.test', company='Northstar'):
    return SignupRequest(first_name='Test', last_name='Admin', company_name=company,
                         email=email, password='initial-password-123',
                         confirm_password='initial-password-123')


def test_signup_verification_reuse_and_slug_admission(auth_environment):
    env = auth_environment
    pending = env.service.signup(signup_payload())
    assert pending.requires_verification
    assert 'code' not in pending.model_dump()
    with pytest.raises(HTTPException) as conflict:
        env.service.signup(signup_payload(email='second@example.test'))
    assert conflict.value.status_code == 409
    assert env.db.companies.count_documents({}) == 1
    assert env.db.users.count_documents({}) == 1

    code = env.sent['verification'][0][1]
    verified = env.service.verify_email(VerificationRequest(email='admin@example.test', code=code))
    assert verified.user.role == 'org_admin'
    with pytest.raises(HTTPException) as reused:
        env.service.verify_email(VerificationRequest(email='admin@example.test', code=code))
    assert reused.value.status_code == 400


def test_reset_revokes_old_session_and_never_activates_inactive_account(auth_environment):
    env = auth_environment
    env.service.signup(signup_payload())
    code = env.sent['verification'][0][1]
    verified = env.service.verify_email(VerificationRequest(email='admin@example.test', code=code))
    old_token = verified.access_token
    outward = env.service.forgot_password(ForgotPasswordRequest(email='admin@example.test'))
    nonexistent = env.service.forgot_password(ForgotPasswordRequest(email='missing@example.test'))
    assert outward.message == nonexistent.message
    reset_code = env.sent['reset'][0][1]
    user_id = env.db.users.find_one({'email': 'admin@example.test'})['_id']
    env.db.users.update_one({'_id': user_id}, {'$set': {'is_active': False}})
    env.service.reset_password(ResetPasswordRequest(email='admin@example.test', code=reset_code,
        password='new-password-123', confirm_password='new-password-123'))
    record = env.db.users.find_one({'_id': user_id})
    assert record['is_active'] is False
    assert record['token_version'] == 1
    with pytest.raises(HTTPException):
        env.service.get_current_user(old_token)
    with pytest.raises(HTTPException) as reused:
        env.service.reset_password(ResetPasswordRequest(email='admin@example.test', code=reset_code,
            password='another-password-123', confirm_password='another-password-123'))
    assert reused.value.status_code == 400
    with pytest.raises(HTTPException):
        env.service.login(LoginRequest(email='admin@example.test', password='new-password-123'))


def test_failed_delivery_never_returns_code_and_allows_later_resend(auth_environment, monkeypatch):
    import app.services.auth_service as auth_module
    env = auth_environment
    monkeypatch.setattr(auth_module, 'send_verification_email',
                        lambda email, code: EmailDeliveryResult(delivered=False, mode='unavailable'))
    pending = env.service.signup(signup_payload())
    assert 'code' not in pending.model_dump()
    record = env.db.users.find_one({'email': 'admin@example.test'})
    assert record['email_verification_code_hash'] is None
    assert record['email_verification_challenge_id']
    env.db.users.update_one({'_id': record['_id']}, {'$set': {
        'email_verification_sent_at': datetime.now(timezone.utc) - timedelta(minutes=2)}})
    monkeypatch.setattr(auth_module, 'send_verification_email',
                        lambda email, code: (env.sent['verification'].append((email, code)) or
                                             EmailDeliveryResult(delivered=True, mode='fake')))
    response = env.service.resend_verification(SimpleNamespace(email='admin@example.test'))
    assert response.requires_verification
    assert len(env.sent['verification']) == 1


def test_concurrent_signup_does_not_leave_orphan_company(auth_environment):
    env = auth_environment

    def attempt(email):
        try:
            env.service.signup(signup_payload(email=email, company='Racing Company'))
            return 201
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, ['first@example.test', 'second@example.test']))
    assert sorted(outcomes) == [201, 409]
    assert env.db.companies.count_documents({'slug': 'racing-company'}) == 1
    assert env.db.users.count_documents({}) == 1


def test_login_rate_limit_is_persisted_and_returns_retry_after(test_database, monkeypatch):
    import app.core.rate_limits as limits
    monkeypatch.setattr(limits, 'get_database', lambda: test_database)
    ensure_indexes(test_database)
    request = SimpleNamespace(client=SimpleNamespace(host='192.0.2.55'))
    for _ in range(limits.AUTH_LOGIN_ACCOUNT_LIMIT):
        limits.check_auth_limit(request, 'login', 'ADMIN@example.test')
    with pytest.raises(HTTPException) as throttled:
        limits.check_auth_limit(request, 'login', 'admin@example.test')
    assert throttled.value.status_code == 429
    assert int(throttled.value.headers['Retry-After']) >= 1


def test_verification_resend_cooldown_returns_retry_after(auth_environment):
    env = auth_environment
    env.service.signup(signup_payload())
    with pytest.raises(HTTPException) as throttled:
        env.service.resend_verification(ResendVerificationRequest(email='admin@example.test'))
    assert throttled.value.status_code == 429
    assert int(throttled.value.headers['Retry-After']) >= 1


def test_concurrent_verification_consumes_code_only_once(auth_environment):
    env = auth_environment
    env.service.signup(signup_payload())
    code = env.sent['verification'][0][1]

    def verify():
        try:
            env.service.verify_email(VerificationRequest(email='admin@example.test', code=code))
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: verify(), range(2)))
    assert sorted(outcomes) == [200, 400]
    assert env.db.audit_events.count_documents({'action': 'auth.email_verified'}) == 1


def test_concurrent_password_reset_consumes_code_only_once(auth_environment):
    env = auth_environment
    env.service.signup(signup_payload())
    env.service.verify_email(VerificationRequest(email='admin@example.test', code=env.sent['verification'][0][1]))
    env.service.forgot_password(ForgotPasswordRequest(email='admin@example.test'))
    code = env.sent['reset'][0][1]

    def reset():
        try:
            env.service.reset_password(ResetPasswordRequest(email='admin@example.test', code=code,
                password='new-password-123', confirm_password='new-password-123'))
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: reset(), range(2)))
    assert sorted(outcomes) == [200, 400]
    assert env.db.audit_events.count_documents({'action': 'auth.password_reset'}) == 1


def test_concurrent_invitation_acceptance_succeeds_once(auth_environment):
    env = auth_environment
    env.service.signup(signup_payload())
    company = env.db.companies.find_one({})
    token = 'phase1-invitation-test-token-123456789012345'
    env.db.users.insert_one({'_id': ObjectId(), 'company_id': company['_id'],
        'first_name': 'New', 'last_name': 'Person', 'email': 'invited@example.test',
        'department': 'IT', 'role': 'user', 'password_hash': None, 'is_email_verified': False,
        'is_active': True, 'token_version': 0, 'group_ids': [],
        'invitation_token_hash': hash_invitation_token(token),
        'invitation_expires_at': datetime.now(timezone.utc) + timedelta(hours=1),
        'created_at': datetime.now(timezone.utc)})

    def accept():
        try:
            env.service.accept_invitation(AcceptInvitationRequest(token=token,
                password='invited-password-123', confirm_password='invited-password-123'))
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: accept(), range(2)))
    assert outcomes.count(200) == 1
    assert sorted(outcomes)[1] in {400, 404}
    assert env.db.audit_events.count_documents({'action': 'auth.invitation_accepted'}) == 1
