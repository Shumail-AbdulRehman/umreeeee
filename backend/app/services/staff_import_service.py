"""Tenant-scoped validation, atomic provisioning and invitation delivery receipts."""

import hmac
from datetime import timedelta
from hashlib import sha256
from uuid import UUID

from bson import ObjectId
from jose import JWTError, jwt
from pymongo.errors import BulkWriteError

from app.core.config import SECRET_KEY
from app.core.errors import DomainError, object_id
from app.core.permissions import ADMIN_ROLES, require_admin
from app.core.security import generate_invitation_token
from app.db.mongo import get_database
from app.schemas.staff_import import ImportIssue, StaffImportPreview, StaffImportReceipt, StaffImportReceiptRow
from app.schemas.users import ManagedUserCreateRequest
from app.services.admin_common import audit_record, company_id, transaction, utcnow
from app.services.staff_import_csv import COLUMNS, parse_staff_csv
from app.services.user_management_service import UserManagementService, invitation_record


PROOF_AUDIENCE = 'averiq:staff-import'
PROOF_TTL = timedelta(minutes=20)


class StaffImportConflict(DomainError):
    def __init__(self, code, message, validation):
        super().__init__(409, code, message)
        self.validation = validation


def _proof_key():
    return hmac.digest(SECRET_KEY.encode(), PROOF_AUDIENCE.encode(), 'sha256')


def _preview(db, content, session=None):
    rows, issues = parse_staff_csv(content)
    emails = {row.email for row in rows if not any(issue.field == 'email' for issue in row.issues)}
    if emails:
        existing = {record['email'] for record in db.users.find(
            {'email': {'$in': list(emails)}}, {'_id': 0, 'email': 1}, session=session,
        )}
        for row in rows:
            if row.email in existing:
                row.issues.append(ImportIssue(
                    row=row.row, field='email', code='duplicate_email', reason='Email is already registered.',
                    fix='Remove this row or use the correct staff email address.',
                ))
    invalid = sum(bool(row.issues) for row in rows)
    return StaffImportPreview(rows=rows, file_issues=issues, ready=len(rows) - invalid, invalid=invalid)


def _require_valid(preview):
    if preview.file_issues or preview.invalid or not preview.ready:
        raise StaffImportConflict('staff_import_invalid',
                                  'The CSV has issues. Fix them and validate the file again.', preview)


def _key(value):
    try:
        return str(UUID(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise DomainError(422, 'invalid_idempotency_key', 'Provide a valid import request ID.') from exc


def _check_proof(proof, digest, company, actor):
    try:
        claims = jwt.decode(proof, _proof_key(), algorithms=['HS256'], audience=PROOF_AUDIENCE,
                            options={'require_exp': True, 'require_aud': True})
    except JWTError as exc:
        raise DomainError(422, 'invalid_import_proof', 'Validation expired or is invalid. Check the CSV again.') from exc
    if (claims.get('company'), claims.get('sub'), claims.get('digest')) != (str(company), str(actor), digest):
        raise DomainError(422, 'invalid_import_proof', 'The file or account changed. Check the CSV again.')


def _receipt_for_key(db, company, actor, key, digest, session=None):
    stored = db.staff_imports.find_one({'company_id': company, 'idempotency_key': key}, session=session)
    if stored and (stored['digest'] != digest or stored['actor_id'] != actor):
        raise DomainError(409, 'staff_import_key_conflict', 'This request ID was already used for another import.')
    return stored


def validate_staff_import(user, content):
    require_admin(user)
    db = get_database()
    if not db.companies.find_one({'_id': company_id(user), 'status': 'active'}, {'_id': 1}):
        raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
    preview = _preview(db, content)
    if preview.ready and not preview.invalid and not preview.file_issues:
        preview.validation_proof = jwt.encode({
            'aud': PROOF_AUDIENCE, 'sub': str(user.id), 'company': str(company_id(user)),
            'digest': sha256(content).hexdigest(), 'exp': utcnow() + PROOF_TTL,
        }, _proof_key(), algorithm='HS256')
    return preview


def commit_staff_import(user, content, proof, idempotency_key, request_id):
    require_admin(user)
    db = get_database()
    company, actor = company_id(user), object_id(user.id)
    key = _key(idempotency_key)
    digest = sha256(content).hexdigest()
    existing = _receipt_for_key(db, company, actor, key, digest)
    if existing:
        return _read_receipt(db, existing)
    _check_proof(proof, digest, company, actor)

    def operation(database, session):
        admin = database.users.find_one(
            {'_id': actor, 'company_id': company},
            {'role': 1, 'is_active': 1, 'is_email_verified': 1, 'token_version': 1}, session=session,
        )
        # Match the defaults used by authentication for older user documents.
        if (not admin or admin.get('role') not in ADMIN_ROLES or not admin.get('is_active', True)
                or not admin.get('is_email_verified', False) or admin.get('token_version', 0) != user.token_version):
            raise DomainError(403, 'forbidden', 'An active administrator account is required.')
        stored = _receipt_for_key(database, company, actor, key, digest, session)
        if stored:
            return stored
        preview = _preview(database, content, session)
        _require_valid(preview)

        now = utcnow()
        receipt = {'_id': ObjectId(), 'company_id': company, 'actor_id': actor,
                   'idempotency_key': key, 'digest': digest, 'created_at': now}
        users, jobs, audit_rows = [], [], []
        for row in preview.rows:
            payload = ManagedUserCreateRequest(**{field: getattr(row, field) for field in COLUMNS}, role='user')
            fields = UserManagementService.fields(payload)
            account = invitation_record(fields, company, [], generate_invitation_token(), now)
            account.update(_id=ObjectId(), invitation_expires_at=now, invited_at=None,
                           invitation_delivery_status='pending')
            users.append(account)
            jobs.append({'company_id': company, 'receipt_id': receipt['_id'], 'row': row.row,
                         'user_id': account['_id'], 'expected_hash': account['invitation_token_hash'],
                         'state': 'pending', 'created_at': now})
            audit_rows.append(audit_record(
                user, 'user.invited', 'user', account['_id'], request_id,
                after={'role': 'user', 'group_ids': [], 'staff_import_id': receipt['_id']},
            ))
        database.users.insert_many(users, session=session)
        database.staff_imports.insert_one(receipt, session=session)
        database.staff_invitation_jobs.insert_many(jobs, session=session)
        database.audit_events.insert_many(audit_rows, session=session)
        return receipt

    try:
        receipt = transaction(user, operation)
    except BulkWriteError as exc:
        errors = (exc.details or {}).get('writeErrors', [])
        if not errors or any(error.get('code') != 11000 for error in errors):
            raise
        # The global unique email index also catches races between companies.
        changed = _preview(db, content)
        _require_valid(changed)
        raise StaffImportConflict('staff_import_conflict', 'The directory changed. Check the CSV again.', changed) from exc
    return _read_receipt(db, receipt)


def get_staff_import(user, receipt_id):
    require_admin(user)
    db = get_database()
    receipt = db.staff_imports.find_one({'_id': object_id(receipt_id), 'company_id': company_id(user)})
    if receipt is None:
        raise DomainError(404, 'staff_import_not_found', 'Staff import not found.')
    return _read_receipt(db, receipt)


def get_staff_import_by_request(user, idempotency_key):
    require_admin(user)
    db = get_database()
    receipt = db.staff_imports.find_one({'company_id': company_id(user), 'actor_id': object_id(user.id),
                                        'idempotency_key': _key(idempotency_key)})
    if receipt is None:
        raise DomainError(404, 'staff_import_not_found', 'No saved import was found for this request.')
    return _read_receipt(db, receipt)


def _read_receipt(db, receipt):
    company = receipt['company_id']
    jobs = list(db.staff_invitation_jobs.find(
        {'company_id': company, 'receipt_id': receipt['_id']},
        {'user_id': 1, 'row': 1, 'state': 1},
    ).sort('row', 1))
    users = {row['_id']: row for row in db.users.find(
        {'company_id': company, '_id': {'$in': [job['user_id'] for job in jobs]}},
        {field: 1 for field in (*COLUMNS, 'invitation_delivery_status', 'is_email_verified')},
    )}
    rows = []
    for job in jobs:
        account = users.get(job['user_id'], {})
        delivery = job['state']
        if delivery in {'claimed', 'sending'}:
            delivery = 'pending'
        elif delivery in {'failed', 'unconfirmed', 'skipped'} and (
            account.get('invitation_delivery_status') == 'sent' or account.get('is_email_verified')
        ):
            delivery = 'sent'
        rows.append(StaffImportReceiptRow(
            row=job['row'], user_id=str(job['user_id']), delivery=delivery,
            **{field: account.get(field) for field in COLUMNS},
        ))
    sent = sum(row.delivery == 'sent' for row in rows)
    pending = sum(row.delivery == 'pending' for row in rows)
    return StaffImportReceipt(
        id=str(receipt['_id']), created_at=receipt['created_at'], accounts_created=len(rows),
        invitations_sent=sent, invitations_pending=pending, needs_attention=len(rows) - sent - pending, rows=rows,
    )
