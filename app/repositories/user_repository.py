from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException

from app.models.user import User
from app.repositories.company_repository import CompanyRepository


def _ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure UTC-aware datetimes at the repository boundary."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class UserRepository:
    def __init__(self, database, company_repository: CompanyRepository):
        self.collection = database.users
        self.company_repository = company_repository

    @staticmethod
    def _object_id(value: str) -> ObjectId:
        if not ObjectId.is_valid(value):
            raise HTTPException(status_code=422, detail='Invalid resource ID')
        return ObjectId(value)

    @staticmethod
    def _sort_key(user: User) -> tuple[str, str, str]:
        return (user.first_name.lower(), user.last_name.lower(), user.email.lower())

    def _to_document(self, user: User) -> dict:
        return {
            'full_name': user.full_name,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'department': user.department,
            'role': user.role,
            'groups': list(user.groups),
            'group_ids': [self._object_id(value) for value in user.group_ids],
            'is_active': user.is_active,
            'token_version': user.token_version,
            'version': user.version,
            'email_verification_challenge_id': user.email_verification_challenge_id,
            'password_reset_challenge_id': user.password_reset_challenge_id,
            'password_hash': user.password_hash,
            'company_id': self._object_id(user.company.id),
            'is_email_verified': user.is_email_verified,
            'invitation_token_hash': user.invitation_token_hash,
            'invitation_expires_at': user.invitation_expires_at,
            'invited_at': user.invited_at,
            'email_verification_code_hash': user.email_verification_code_hash,
            'email_verification_expires_at': user.email_verification_expires_at,
            'email_verification_sent_at': user.email_verification_sent_at,
            'email_verification_delivery_mode': user.email_verification_delivery_mode,
            'email_verification_attempts': user.email_verification_attempts,
            'password_reset_code_hash': user.password_reset_code_hash,
            'password_reset_expires_at': user.password_reset_expires_at,
            'password_reset_sent_at': user.password_reset_sent_at,
            'password_reset_delivery_mode': user.password_reset_delivery_mode,
            'password_reset_attempts': user.password_reset_attempts,
            'created_at': user.created_at,
        }

    def _to_model(self, document: dict | None) -> User | None:
        if document is None:
            return None

        company = self.company_repository.find_by_id(str(document['company_id']))
        if company is None:
            raise RuntimeError('User references a missing company document')

        return User(
            id=str(document['_id']),
            full_name=document.get('full_name', ''),
            first_name=document['first_name'],
            last_name=document['last_name'],
            email=document['email'],
            department=document.get('department', ''),
            role=document.get('role', 'Employee'),
            groups=list(document.get('groups', [])),
            group_ids=[str(value) for value in document.get('group_ids', [])],
            is_active=document.get('is_active', True),
            token_version=document.get('token_version', 0),
            version=document.get('version', 1),
            email_verification_challenge_id=document.get('email_verification_challenge_id'),
            password_reset_challenge_id=document.get('password_reset_challenge_id'),
            password_hash=document['password_hash'],
            company=company,
            is_email_verified=document.get('is_email_verified', False),
            invitation_token_hash=document.get('invitation_token_hash'),
            invitation_expires_at=_ensure_utc(document.get('invitation_expires_at')),
            invited_at=_ensure_utc(document.get('invited_at')),
            email_verification_code_hash=document.get('email_verification_code_hash'),
            email_verification_expires_at=_ensure_utc(document.get('email_verification_expires_at')),
            email_verification_sent_at=_ensure_utc(document.get('email_verification_sent_at')),
            email_verification_delivery_mode=document.get('email_verification_delivery_mode'),
            email_verification_attempts=document.get('email_verification_attempts', 0),
            password_reset_code_hash=document.get('password_reset_code_hash'),
            password_reset_expires_at=_ensure_utc(document.get('password_reset_expires_at')),
            password_reset_sent_at=_ensure_utc(document.get('password_reset_sent_at')),
            password_reset_delivery_mode=document.get('password_reset_delivery_mode'),
            password_reset_attempts=document.get('password_reset_attempts', 0),
            created_at=_ensure_utc(document['created_at']),
        )

    def find_by_email(self, email: str) -> User | None:
        return self._to_model(self.collection.find_one({'email': email}))

    def find_by_id(self, user_id: str, company_id: str | None = None) -> User | None:
        query = {'_id': self._object_id(user_id)}
        if company_id is not None:
            query['company_id'] = self._object_id(company_id)
        return self._to_model(self.collection.find_one(query))

    def find_by_invitation_token_hash(self, invitation_token_hash: str) -> User | None:
        return self._to_model(self.collection.find_one({'invitation_token_hash': invitation_token_hash}))

    def list_by_company_id(self, company_id: str) -> list[User]:
        documents = self.collection.find({'company_id': self._object_id(company_id)})
        users = [self._to_model(document) for document in documents]
        return sorted([user for user in users if user is not None], key=self._sort_key)

    def create(self, user: User, *, session=None) -> User:
        result = self.collection.insert_one(self._to_document(user), session=session)
        user.id = str(result.inserted_id)
        return user

    def save(self, user: User, *, session=None) -> User:
        self.collection.update_one(
            {'_id': self._object_id(user.id), 'company_id': self._object_id(user.company.id)},
            {'$set': self._to_document(user)},
            session=session,
        )
        return user
