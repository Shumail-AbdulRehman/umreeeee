"""Employee lifecycle. Every mutation is serialized at the company document."""

from datetime import timedelta

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.services.admin_common import audit, company_id, transaction, utcnow
from app.core.errors import DomainError, object_id
from app.core.permissions import require_admin
from app.core.security import generate_invitation_token, hash_invitation_token
from app.db.mongo import get_database
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.users import ManagedUserRead
from app.services.email_service import send_invitation_email
from app.utils.normalizers import normalize_department_name, normalize_email, normalize_person_name, validate_email


class UserManagementService:
    def __init__(self, user_repository: UserRepository):
        self.repo = user_repository

    @staticmethod
    def read(document):
        return ManagedUserRead(
            id=str(document['_id']), first_name=document['first_name'], last_name=document['last_name'],
            email=document['email'], department=document.get('department', ''), role=document['role'],
            group_ids=[str(value) for value in document.get('group_ids', [])],
            account_status=('inactive' if not document.get('is_active', True) else
                            'invited' if document.get('invitation_token_hash') else
                            'active' if document.get('password_hash') and document.get('is_email_verified') else
                            'pending_verification'),
            is_email_verified=document.get('is_email_verified', False),
            is_active=document.get('is_active', True), version=document.get('version', 1),
            invitation_delivery_status=document.get('invitation_delivery_status'),
            created_at=document['created_at'],
        )

    @staticmethod
    def fields(payload):
        first = normalize_person_name(payload.first_name)
        last = normalize_person_name(payload.last_name)
        department = normalize_department_name(payload.department)
        email = normalize_email(payload.email)
        validate_email(email)
        if not first or not last or not department:
            raise DomainError(422, 'validation_error', 'Name and department are required')
        return {'first_name': first, 'last_name': last, 'full_name': f'{first} {last}',
                'email': email, 'department': department, 'role': payload.role}

    @staticmethod
    def validate_groups(db, user, ids, session):
        if len(ids) != len(set(ids)):
            raise DomainError(422, 'invalid_groups', 'Duplicate group ID', {'group_ids': ['Duplicate ID']})
        values = [object_id(value) for value in ids]
        count = db.groups.count_documents({'_id': {'$in': values}, 'company_id': company_id(user),
                                           'status': 'active'}, session=session)
        if count != len(values):
            raise DomainError(422, 'invalid_groups', 'Select active groups in your organization',
                              {'group_ids': ['Invalid group']})
        return values

    @staticmethod
    def ensure_other_admin(db, user, target, session):
        if target['role'] in {'org_admin', 'super_admin'} and target.get('is_active', True) and target.get('is_email_verified'):
            count = db.users.count_documents({'company_id': company_id(user), '_id': {'$ne': target['_id']},
                    'is_active': True, 'is_email_verified': True, 'role': {'$in': ['org_admin', 'super_admin']}},
                    session=session)
            if count == 0:
                raise DomainError(409, 'last_admin', 'At least one active verified administrator must remain')

    def list_company_users(self, user, page=1, page_size=20, q='', status=None, role=None, group_id=None):
        require_admin(user)
        db = get_database()
        query = {'company_id': company_id(user)}
        if q:
            import regex
            query['$or'] = [{'first_name': {'$regex': regex.escape(q), '$options': 'i'}},
                            {'last_name': {'$regex': regex.escape(q), '$options': 'i'}},
                            {'email': {'$regex': regex.escape(q), '$options': 'i'}}]
        if role:
            query['role'] = role
        if group_id:
            query['group_ids'] = object_id(group_id)
        if status == 'inactive':
            query['is_active'] = False
        elif status == 'active':
            query.update(is_active=True, is_email_verified=True, password_hash={'$ne': None})
        elif status == 'invited':
            query.update(is_active=True, invitation_token_hash={'$ne': None}, password_hash=None)
        elif status == 'pending_verification':
            query.update(is_active=True, is_email_verified=False, invitation_token_hash=None)
        total = db.users.count_documents(query)
        records = db.users.find(query).sort([('created_at', -1), ('_id', -1)]).skip((page - 1) * page_size).limit(page_size)
        return {'items': [self.read(item) for item in records], 'page': page, 'page_size': page_size, 'total': total}

    def create_user(self, user, payload, request_id):
        require_admin(user)
        fields = self.fields(payload)
        token = generate_invitation_token()
        now = utcnow()

        def operation(db, session):
            ids = self.validate_groups(db, user, payload.group_ids, session)
            record = {**fields, 'company_id': company_id(user), 'group_ids': ids, 'groups': [],
                      'password_hash': None, 'is_email_verified': False, 'is_active': True,
                      'token_version': 0, 'version': 1, 'invitation_token_hash': hash_invitation_token(token),
                      'invitation_expires_at': now + timedelta(hours=72), 'invited_at': now,
                      'created_at': now, 'updated_at': now}
            try:
                result = db.users.insert_one(record, session=session)
            except DuplicateKeyError as exc:
                raise DomainError(409, 'duplicate_email', 'Email is already registered') from exc
            record['_id'] = result.inserted_id
            audit(db, session, user, 'user.invited', 'user', result.inserted_id, request_id,
                  after={'role': record['role'], 'group_ids': ids})
            return record

        record = transaction(user, operation)
        delivery = send_invitation_email(record['email'], token, user.company.name)
        get_database().users.update_one({'_id': record['_id'], 'invitation_token_hash': hash_invitation_token(token)},
            {'$set': {'invitation_delivery_status': 'sent' if delivery.delivered else 'failed'}})
        record['invitation_delivery_status'] = 'sent' if delivery.delivered else 'failed'
        return {'user': self.read(record), 'message': 'Invitation sent' if delivery.delivered else
                'Account created; invitation delivery failed. Configure SMTP and resend.'}

    def update_user(self, user, user_id, payload, request_id):
        require_admin(user)
        fields = self.fields(payload)
        if user_id == user.id:
            raise DomainError(403, 'self_edit', 'Use account settings for your own profile')

        def operation(db, session):
            target = db.users.find_one({'_id': object_id(user_id), 'company_id': company_id(user)}, session=session)
            if target is None:
                raise DomainError(404, 'not_found', 'User not found')
            if target.get('version', 1) != payload.version:
                raise DomainError(409, 'stale_version', 'User changed. Refresh and try again.')
            if target['role'] == 'super_admin':
                raise DomainError(403, 'privileged_account', 'Super Admin changes require the local command')
            email_changed = fields['email'] != target['email']
            if email_changed and target.get('password_hash') is not None:
                raise DomainError(422, 'immutable_email', 'Verified email changes are not supported',
                                  {'email': ['Email cannot be changed here']})
            if target['role'] == 'org_admin' and fields['role'] != 'org_admin':
                self.ensure_other_admin(db, user, target, session)
            ids = self.validate_groups(db, user, payload.group_ids, session)
            token = generate_invitation_token() if email_changed else None
            changes = {**fields, 'group_ids': ids, 'updated_at': utcnow()}
            increments = {'version': 1}
            if token:
                changes.update(invitation_token_hash=hash_invitation_token(token),
                               invitation_expires_at=utcnow() + timedelta(hours=72), invited_at=utcnow())
                increments['token_version'] = 1
            try:
                result = db.users.update_one({'_id': target['_id'], 'company_id': company_id(user), 'version': payload.version},
                    {'$set': changes, '$inc': increments}, session=session)
            except DuplicateKeyError as exc:
                raise DomainError(409, 'duplicate_email', 'Email is already registered') from exc
            if result.modified_count != 1:
                raise DomainError(409, 'stale_version', 'User changed. Refresh and try again.')
            audit(db, session, user, 'user.updated', 'user', target['_id'], request_id,
                  before={'role': target['role'], 'group_ids': target.get('group_ids', [])},
                  after={'role': fields['role'], 'group_ids': ids})
            return db.users.find_one({'_id': target['_id']}, session=session), token

        updated, token = transaction(user, operation)
        if token:
            delivered = send_invitation_email(updated['email'], token, user.company.name).delivered
            get_database().users.update_one({'_id': updated['_id'], 'invitation_token_hash': hash_invitation_token(token)},
                {'$set': {'invitation_delivery_status': 'sent' if delivered else 'failed'}})
            updated['invitation_delivery_status'] = 'sent' if delivered else 'failed'
            message = 'User updated and new invitation sent' if delivered else 'User updated; invitation delivery failed. Configure SMTP and resend.'
        else:
            message = 'User updated'
        return {'user': self.read(updated), 'message': message}

    def set_status(self, user, user_id, active, version, request_id):
        require_admin(user)
        if user_id == user.id:
            raise DomainError(403, 'self_deactivation', 'You cannot deactivate yourself')

        def operation(db, session):
            target = db.users.find_one({'_id': object_id(user_id), 'company_id': company_id(user)}, session=session)
            if target is None:
                raise DomainError(404, 'not_found', 'User not found')
            if target.get('version', 1) != version:
                raise DomainError(409, 'stale_version', 'User changed. Refresh and try again.')
            if target['role'] == 'super_admin':
                raise DomainError(403, 'privileged_account', 'Super Admin changes require the local command')
            if not active and target.get('is_active', True):
                self.ensure_other_admin(db, user, target, session)
            result = db.users.update_one({'_id': target['_id'], 'company_id': company_id(user), 'version': version},
                {'$set': {'is_active': active, 'updated_at': utcnow()},
                 '$inc': {'version': 1, 'token_version': 1}}, session=session)
            if result.modified_count != 1:
                raise DomainError(409, 'stale_version', 'User changed. Refresh and try again.')
            audit(db, session, user, 'user.status_changed', 'user', target['_id'], request_id,
                  before={'is_active': target.get('is_active', True)}, after={'is_active': active})
            return db.users.find_one({'_id': target['_id']}, session=session)

        return {'user': self.read(transaction(user, operation)), 'message': 'User status updated'}

    def resend_invitation(self, user, user_id, request_id):
        require_admin(user)
        token = generate_invitation_token()

        def operation(db, session):
            target = db.users.find_one({'_id': object_id(user_id), 'company_id': company_id(user)}, session=session)
            if target is None:
                raise DomainError(404, 'not_found', 'User not found')
            if target.get('password_hash') or not target.get('is_active', True):
                raise DomainError(409, 'not_invited', 'Only active invited accounts can be resent')
            sent = target.get('invited_at')
            if sent and (utcnow() - sent).total_seconds() < 60:
                raise HTTPException(status_code=429, detail='Wait before resending the invitation',
                                    headers={'Retry-After': '60'})
            result = db.users.update_one({'_id': target['_id'], 'company_id': company_id(user),
                                          'password_hash': None,
                                          'invitation_token_hash': target.get('invitation_token_hash')},
                {'$set': {'invitation_token_hash': hash_invitation_token(token),
                          'invitation_expires_at': utcnow() + timedelta(hours=72), 'invited_at': utcnow()},
                 '$inc': {'version': 1, 'token_version': 1}}, session=session)
            if result.modified_count != 1:
                raise DomainError(409, 'invitation_changed', 'Invitation changed. Refresh and try again.')
            audit(db, session, user, 'user.invitation_resent', 'user', target['_id'], request_id)
            return target

        target = transaction(user, operation)
        delivered = send_invitation_email(target['email'], token, user.company.name).delivered
        get_database().users.update_one({'_id': target['_id'], 'invitation_token_hash': hash_invitation_token(token)},
            {'$set': {'invitation_delivery_status': 'sent' if delivered else 'failed'}})
        return {'message': 'Invitation sent' if delivered else 'Invitation delivery failed. Configure SMTP and retry later.'}
