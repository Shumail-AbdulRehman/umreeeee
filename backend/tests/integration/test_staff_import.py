from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import OperationFailure

from app.api.dependencies.auth import get_current_user
from app.api.routes import staff_import
from app.core.errors import DomainError, install_error_handlers
from app.core.security import generate_invitation_token, hash_invitation_token
from app.db.indexes import ensure_indexes
from app.services import admin_common, staff_import_service, user_management_service
from app.services.email_service import EmailDeliveryResult
from app.workers import staff_invitation_worker as worker


HEADER = b'first_name,last_name,email,department\n'
CSV = HEADER + b'Maya,Shah,maya@example.com,Operations\nIan,Smith,ian@example.com,Support\n'


@pytest.fixture
def staff(test_database, monkeypatch):
    db = test_database
    ensure_indexes(db)
    for module in (admin_common, staff_import_service, user_management_service):
        monkeypatch.setattr(module, 'get_database', lambda: db)
    monkeypatch.setattr(admin_common, 'get_mongo_client', lambda: db.client)
    company, actor, outsider_company, outsider_actor = [ObjectId() for _ in range(4)]
    db.companies.insert_many([
        {'_id': company, 'slug': 'staff', 'name': 'Staff', 'status': 'active'},
        {'_id': outsider_company, 'slug': 'outside', 'name': 'Outside', 'status': 'active'},
    ])
    db.users.insert_many([
        {'_id': actor, 'company_id': company, 'role': 'org_admin', 'email': 'admin@example.com',
         'is_active': True, 'is_email_verified': True, 'token_version': 0},
        {'_id': outsider_actor, 'company_id': outsider_company, 'role': 'org_admin', 'email': 'outside@example.com',
         'is_active': True, 'is_email_verified': True, 'token_version': 0},
    ])
    auth = SimpleNamespace(
        user=SimpleNamespace(id=str(actor), company=SimpleNamespace(id=str(company), name='Staff'),
                             role='org_admin', token_version=0),
        outsider=SimpleNamespace(id=str(outsider_actor), company=SimpleNamespace(id=str(outsider_company), name='Outside'),
                                 role='org_admin', token_version=0),
    )
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(staff_import.router)
    app.dependency_overrides[get_current_user] = lambda: auth.user
    delivered = []

    def send(email, token, company_name):
        delivered.append((email, token, company_name))
        return EmailDeliveryResult(email == 'maya@example.com', 'test')

    monkeypatch.setattr(worker, 'send_invitation_email', send)
    monkeypatch.setattr(user_management_service, 'send_invitation_email',
                        lambda *args: EmailDeliveryResult(True, 'test'))
    return db, TestClient(app), auth, delivered


def validate(client, payload=CSV):
    response = client.post('/api/users/imports/validate', content=payload, headers={'Content-Type': 'text/csv'})
    assert response.status_code == 200, response.text
    return response.json()


def commit(client, proof, payload=CSV, key=None):
    return client.post('/api/users/imports', content=payload, headers={
        'Content-Type': 'text/csv', 'X-Import-Proof': proof or '', 'Idempotency-Key': key or str(uuid4()),
    })


def test_preview_delivery_and_receipt_replay(staff):
    db, client, auth, delivered = staff
    preview = validate(client)
    assert preview['ready'] == 2 and preview['invalid'] == 0 and preview['validation_proof']
    assert db.staff_imports.count_documents({}) == db.staff_invitation_jobs.count_documents({}) == 0
    assert db.users.count_documents({}) == 2
    assert delivered == []
    key = str(uuid4())
    response = commit(client, preview['validation_proof'], key=key)
    assert response.status_code == 202, response.text
    receipt = response.json()
    assert receipt['accounts_created'] == receipt['invitations_pending'] == 2
    assert db.audit_events.count_documents({'action': 'user.invited', 'after.staff_import_id': ObjectId(receipt['id'])}) == 2
    assert db.staff_invitation_jobs.count_documents({}) == 2
    assert db.users.count_documents({'role': 'user', 'password_hash': None, 'is_email_verified': False}) == 2
    assert delivered == []
    assert commit(client, None, key=key).json()['id'] == receipt['id']
    assert commit(client, None, key=key, payload=CSV + b'\n').status_code == 409
    assert client.get(f"/api/users/imports/by-request/{key}").json()['id'] == receipt['id']
    assert worker.deliver_next(db) and worker.deliver_next(db) and not worker.deliver_next(db)
    status = client.get(f"/api/users/imports/{receipt['id']}").json()
    assert status['invitations_sent'] == status['needs_attention'] == 1
    assert status['invitations_pending'] == 0
    for email, token, name in delivered:
        user = db.users.find_one({'email': email})
        assert user['invitation_token_hash'] == hash_invitation_token(token)
        assert token not in str(status)
        assert name == 'Staff'
    failed_id = status['rows'][1]['user_id']
    db.users.update_one({'_id': ObjectId(failed_id)}, {'$set': {'invited_at': worker.utcnow() - timedelta(minutes=2)}})
    user_management_service.UserManagementService(None).resend_invitation(auth.user, failed_id, 'resend')
    assert client.get(f"/api/users/imports/{receipt['id']}").json()['invitations_sent'] == 2
    auth.user = auth.outsider
    assert client.get(f"/api/users/imports/{receipt['id']}").status_code == 404
    assert client.get(f"/api/users/imports/by-request/{key}").status_code == 404


def test_row_errors_and_conflict_create_no_accounts(staff):
    db, client, auth, delivered = staff
    invalid = HEADER + b'Maya,Shah,maya@example.com,Operations\nIan,Smith,bad,\n'
    result = validate(client, invalid)
    assert result['ready'] == result['invalid'] == 1 and result['validation_proof'] is None
    assert {issue['field'] for issue in result['rows'][1]['issues']} == {'email', 'department'}
    assert commit(client, None, invalid).status_code == 422
    proof = validate(client)['validation_proof']
    db.users.insert_one({'_id': ObjectId(), 'company_id': ObjectId(auth.outsider.company.id),
                         'email': 'ian@example.com', 'role': 'user'})
    result = commit(client, proof)
    assert result.status_code == 409, result.text
    assert result.json()['validation']['rows'][1]['issues'][0]['code'] == 'duplicate_email'
    assert 'Outside' not in result.text
    assert db.users.count_documents({'email': 'maya@example.com'}) == 0
    assert db.staff_imports.count_documents({}) == db.staff_invitation_jobs.count_documents({}) == 0
    assert delivered == []


def test_permissions_proof_binding_and_size(staff):
    db, client, auth, _ = staff
    proof = validate(client)['validation_proof']
    assert commit(client, proof, payload=CSV + b'\n').status_code == 422
    original = auth.user
    auth.user = auth.outsider
    assert commit(client, proof).status_code == 422
    auth.user = original
    for payload, status in [(CSV, 403), (b'a' * (256 * 1024 + 1), 413)]:
        original.role = 'user' if status == 403 else 'org_admin'
        response = client.post('/api/users/imports/validate', content=payload, headers={'Content-Type': 'text/csv'})
        assert response.status_code == status
    db.companies.update_one({'_id': ObjectId(original.company.id)}, {'$set': {'status': 'suspended'}})
    assert commit(client, proof).status_code == 403


def test_audit_failure_rolls_back_accounts_jobs_and_receipt(staff, monkeypatch):
    db, client, _, delivered = staff
    proof, key = validate(client)['validation_proof'], str(uuid4())
    collection = type(db.audit_events)
    insert_many = collection.insert_many

    def fail_audit_insert(target, *args, **kwargs):
        if target.name == 'audit_events':
            raise OperationFailure('simulated audit write failure')
        return insert_many(target, *args, **kwargs)

    with monkeypatch.context() as patched:
        patched.setattr(collection, 'insert_many', fail_audit_insert)
        response = commit(client, proof, key=key)
        assert response.status_code == 503
        assert response.json()['detail']['code'] == 'database_unavailable'

    assert db.users.count_documents({}) == 2
    for name in ('staff_imports', 'staff_invitation_jobs', 'audit_events'):
        assert db[name].count_documents({}) == 0
    assert delivered == []
    assert commit(client, proof, key=key).status_code == 202


def test_concurrent_retries_share_a_receipt(staff):
    db, client, _, _ = staff
    proof, key = validate(client)['validation_proof'], str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(commit, client, proof, key=key) for _ in range(2)]
        first, second = [future.result(timeout=15) for future in futures]
    assert first.status_code == second.status_code == 202
    assert first.json()['id'] == second.json()['id']
    assert db.users.count_documents({}) == 4
    assert db.staff_imports.count_documents({}) == 1
    assert db.staff_invitation_jobs.count_documents({}) == 2


def test_worker_recovers_claim_without_resending_ambiguous_delivery(staff):
    db, client, auth, delivered = staff
    first = commit(client, validate(client)['validation_proof']).json()['rows'][0]
    job = worker._claim(db)
    db.staff_invitation_jobs.update_one({'_id': job['_id']}, {'$set': {'lease_until': worker.utcnow()}})
    retry = worker._claim(db)
    assert retry['_id'] == job['_id'] and retry['attempt'] != job['attempt']
    assert worker._begin_send(db, job, hash_invitation_token(generate_invitation_token())) is None
    assert worker._begin_send(db, retry, hash_invitation_token(generate_invitation_token()))
    user_id = str(retry['user_id'])
    with pytest.raises(DomainError, match='sending this invitation'):
        user_management_service.UserManagementService(None).resend_invitation(auth.user, user_id, 'resend')
    db.staff_invitation_jobs.update_one({'_id': retry['_id']}, {'$set': {'lease_until': worker.utcnow()}})
    assert worker.deliver_next(db)
    assert db.staff_invitation_jobs.find_one({'_id': retry['_id']})['state'] == 'unconfirmed'
    assert 'staff_invite_attempt' not in db.users.find_one({'_id': ObjectId(user_id)})
    assert delivered == []
    assert db.users.find_one({'_id': ObjectId(first['user_id'])}) is not None
