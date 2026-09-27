from datetime import datetime, timedelta, timezone
from math import ceil
from uuid import uuid4

from bson import ObjectId

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import (
    INVITATION_EXPIRE_HOURS,
    PASSWORD_RESET_CODE_EXPIRE_MINUTES,
    PASSWORD_RESET_MAX_ATTEMPTS,
    PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
    VERIFICATION_CODE_EXPIRE_MINUTES,
    VERIFICATION_MAX_ATTEMPTS,
    VERIFICATION_RESEND_COOLDOWN_SECONDS,
)
from app.db.mongo import get_mongo_client
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_invitation_token,
    generate_verification_code,
    hash_invitation_token,
    hash_password,
    hash_password_reset_code,
    hash_verification_code,
    verify_email_code,
    verify_password,
    verify_password_reset_code,
)
from app.models.user import User
from app.repositories.company_repository import CompanyRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AcceptInvitationRequest,
    AuthResponse,
    AuthenticatedUserRead,
    ForgotPasswordRequest,
    InvitationDetailsResponse,
    LoginRequest,
    MessageResponse,
    PasswordResetPendingResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerificationPendingResponse,
    VerificationRequest,
)
from app.services.email_service import (
    EmailDeliveryResult,
    send_password_reset_email,
    send_verification_email,
)
from app.utils.normalizers import (
    normalize_company_name,
    normalize_department_name,
    normalize_email,
    normalize_person_name,
    slugify_company,
    validate_email,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class AuthService:
    def __init__(self, user_repository: UserRepository, company_repository: CompanyRepository):
        self.user_repository = user_repository
        self.company_repository = company_repository

    @staticmethod
    def run_single_use_transaction(operation):
        for attempt in range(3):
            try:
                with get_mongo_client().start_session() as session:
                    with session.start_transaction():
                        return operation(session)
            except PyMongoError as exc:
                if attempt == 2 or not exc.has_error_label('TransientTransactionError'):
                    raise

    def prepare_verification(self, user: User) -> str:
        code = generate_verification_code()
        issued_at = now_utc()
        user.is_email_verified = False
        user.email_verification_code_hash = hash_verification_code(user.email, code)
        user.email_verification_challenge_id = str(uuid4())
        user.email_verification_sent_at = issued_at
        user.email_verification_expires_at = issued_at + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)
        user.email_verification_attempts = 0
        return code

    def prepare_password_reset(self, user: User) -> str:
        code = generate_verification_code()
        issued_at = now_utc()
        user.password_reset_code_hash = hash_password_reset_code(user.email, code)
        user.password_reset_challenge_id = str(uuid4())
        user.password_reset_sent_at = issued_at
        user.password_reset_expires_at = issued_at + timedelta(minutes=PASSWORD_RESET_CODE_EXPIRE_MINUTES)
        user.password_reset_attempts = 0
        return code

    @staticmethod
    def clear_verification_state(user: User) -> None:
        user.email_verification_code_hash = None
        user.email_verification_challenge_id = None
        user.email_verification_expires_at = None
        user.email_verification_sent_at = None
        user.email_verification_delivery_mode = None
        user.email_verification_attempts = 0

    @staticmethod
    def clear_password_reset_state(user: User) -> None:
        user.password_reset_code_hash = None
        user.password_reset_challenge_id = None
        user.password_reset_expires_at = None
        user.password_reset_sent_at = None
        user.password_reset_delivery_mode = None
        user.password_reset_attempts = 0

    @staticmethod
    def clear_invitation_state(user: User) -> None:
        user.invitation_token_hash = None
        user.invitation_expires_at = None
        user.invited_at = None

    @staticmethod
    def prepare_invitation(user: User) -> str:
        token = generate_invitation_token()
        issued_at = now_utc()
        user.invitation_token_hash = hash_invitation_token(token)
        user.invitation_expires_at = issued_at + timedelta(hours=INVITATION_EXPIRE_HOURS)
        user.invited_at = issued_at
        return token

    @staticmethod
    def verification_pending_response(
        email: str,
        message: str = 'A verification code has been sent to your email address',
        retry_after_seconds: int | None = None,
    ) -> VerificationPendingResponse:
        return VerificationPendingResponse(
            email=email,
            message=message,
            retry_after_seconds=retry_after_seconds,
        )

    @staticmethod
    def password_reset_pending_response(
        email: str,
        message: str,
        retry_after_seconds: int | None = None,
    ) -> PasswordResetPendingResponse:
        return PasswordResetPendingResponse(
            email=email,
            message=message,
            retry_after_seconds=retry_after_seconds,
        )

    @staticmethod
    def seconds_until_resend(user: User, current_time: datetime | None = None) -> int:
        if user.email_verification_sent_at is None:
            return 0

        current_time = current_time or now_utc()
        available_at = user.email_verification_sent_at + timedelta(
            seconds=VERIFICATION_RESEND_COOLDOWN_SECONDS
        )
        remaining = (available_at - current_time).total_seconds()
        return max(0, ceil(remaining))

    @staticmethod
    def seconds_until_password_reset_resend(
        user: User,
        current_time: datetime | None = None,
    ) -> int:
        if user.password_reset_sent_at is None:
            return 0

        current_time = current_time or now_utc()
        available_at = user.password_reset_sent_at + timedelta(
            seconds=PASSWORD_RESET_RESEND_COOLDOWN_SECONDS
        )
        remaining = (available_at - current_time).total_seconds()
        return max(0, ceil(remaining))

    @staticmethod
    def build_delivery_message(
        verification_code: str,
        delivery_result: EmailDeliveryResult,
    ) -> str:
        if delivery_result.delivered:
            return 'A verification code has been sent to your email address'
        return 'Email delivery is unavailable. Configure SMTP, then request a new code.'

    @staticmethod
    def build_password_reset_delivery_message(
        verification_code: str,
        delivery_result: EmailDeliveryResult,
    ) -> str:
        if delivery_result.delivered:
            return 'A password reset code has been sent to your email address'
        return 'If an account exists for this email, reset instructions will be sent.'

    def issue_verification_code(self, user: User) -> VerificationPendingResponse:
        previous_challenge = user.email_verification_challenge_id
        verification_code = self.prepare_verification(user)
        result = self.user_repository.collection.update_one(
            {'_id': ObjectId(user.id), 'email_verification_challenge_id': previous_challenge,
             'is_email_verified': False},
            {'$set': {'email_verification_challenge_id': user.email_verification_challenge_id,
                      'email_verification_code_hash': user.email_verification_code_hash,
                      'email_verification_sent_at': user.email_verification_sent_at,
                      'email_verification_expires_at': user.email_verification_expires_at,
                      'email_verification_attempts': 0}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail='Verification challenge changed. Try again.')
        delivery_result = send_verification_email(user.email, verification_code)
        if not delivery_result.delivered:
            self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'email_verification_challenge_id': user.email_verification_challenge_id},
                {'$set': {'email_verification_code_hash': None}},
            )
        return self.verification_pending_response(
            user.email,
            message=self.build_delivery_message(verification_code, delivery_result),
        )

    def issue_password_reset_code(self, user: User) -> PasswordResetPendingResponse:
        previous_challenge = user.password_reset_challenge_id
        verification_code = self.prepare_password_reset(user)
        result = self.user_repository.collection.update_one(
            {'_id': ObjectId(user.id), 'password_reset_challenge_id': previous_challenge,
             'is_active': True, 'is_email_verified': True},
            {'$set': {'password_reset_challenge_id': user.password_reset_challenge_id,
                      'password_reset_code_hash': user.password_reset_code_hash,
                      'password_reset_sent_at': user.password_reset_sent_at,
                      'password_reset_expires_at': user.password_reset_expires_at,
                      'password_reset_attempts': 0}},
        )
        if result.modified_count != 1:
            return self.password_reset_pending_response(user.email,
                'If an account exists for this email, a password reset code has been sent.')
        delivery_result = send_password_reset_email(user.email, verification_code)
        if not delivery_result.delivered:
            self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'password_reset_challenge_id': user.password_reset_challenge_id},
                {'$set': {'password_reset_code_hash': None}},
            )
        return self.password_reset_pending_response(
            user.email,
            message=self.build_password_reset_delivery_message(verification_code, delivery_result),
        )

    @staticmethod
    def build_auth_response(user: User) -> AuthResponse:
        return AuthResponse(
            access_token=create_access_token(user.id, user.token_version),
            user=AuthenticatedUserRead.model_validate(user),
        )

    def get_current_user(self, token: str) -> User:
        payload = decode_access_token(token)
        subject = payload.get('sub')
        version = payload.get('ver')
        if not isinstance(subject, str) or not ObjectId.is_valid(subject) or not isinstance(version, int):
            raise HTTPException(status_code=401, detail='Invalid session')
        user = self.user_repository.find_by_id(subject)
        if (user is None or not user.is_active or not user.is_email_verified
                or user.company.status != 'active' or user.token_version != version):
            raise HTTPException(status_code=401, detail='Session expired or account unavailable')

        return user

    def get_invited_user(self, token: str) -> User:
        invitation_token_hash = hash_invitation_token(token.strip())
        user = self.user_repository.find_by_invitation_token_hash(invitation_token_hash)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Invitation not found')
        if user.password_hash is not None:
            raise HTTPException(status_code=400, detail='Invitation has already been accepted')
        if user.invitation_expires_at is None or user.invitation_expires_at < now_utc():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invitation link has expired')
        if not user.is_active or user.company.status != 'active':
            raise HTTPException(status_code=403, detail='Invitation is unavailable')
        return user

    def signup(self, payload: SignupRequest, request_id: str = 'local') -> VerificationPendingResponse:
        email = normalize_email(payload.email)
        first_name = normalize_person_name(payload.first_name)
        last_name = normalize_person_name(payload.last_name)
        company_name = normalize_company_name(payload.company_name)

        validate_email(email)
        if payload.password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Password and confirm password must match',
            )
        if not first_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='First name is required')
        if not last_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Last name is required')
        if not company_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Company name is required')

        if self.user_repository.find_by_email(email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Email is already registered')

        company_slug = slugify_company(company_name)
        if self.company_repository.find_by_slug(company_slug):
            raise HTTPException(status_code=409, detail='Organization already exists. Ask its administrator for an invitation.')

        user = User(
            id='',
            full_name=' '.join(part for part in [first_name, last_name] if part).strip(),
            first_name=first_name,
            last_name=last_name,
            email=email,
            department=normalize_department_name('Management'),
            role='org_admin',
            password_hash=hash_password(payload.password),
            company=None,
            is_email_verified=False,
            invitation_token_hash=None,
            invitation_expires_at=None,
            invited_at=None,
            email_verification_code_hash=None,
            email_verification_expires_at=None,
            email_verification_sent_at=None,
            email_verification_delivery_mode=None,
            email_verification_attempts=0,
            password_reset_code_hash=None,
            password_reset_expires_at=None,
            password_reset_sent_at=None,
            password_reset_delivery_mode=None,
            password_reset_attempts=0,
            created_at=now_utc(),
        )
        for attempt in range(3):
            try:
                with get_mongo_client().start_session() as session:
                    with session.start_transaction():
                        company = self.company_repository.create(company_name, company_slug, session=session)
                        user.company = company
                        code = self.prepare_verification(user)
                        self.user_repository.create(user, session=session)
                        self.company_repository.collection.database.audit_events.insert_one({
                            'company_id': ObjectId(company.id), 'actor_user_id': ObjectId(user.id),
                            'action': 'auth.signup', 'resource_type': 'user', 'resource_id': ObjectId(user.id),
                            'before': {}, 'after': {'role': 'org_admin'}, 'request_id': request_id,
                            'created_at': now_utc(),
                        }, session=session)
                break
            except DuplicateKeyError as exc:
                if self.company_repository.find_by_slug(company_slug):
                    raise HTTPException(status_code=409, detail='Organization already exists. Ask its administrator for an invitation.') from exc
                raise HTTPException(status_code=409, detail='Email is already registered') from exc
            except PyMongoError as exc:
                if not exc.has_error_label('TransientTransactionError'):
                    raise
                if self.company_repository.find_by_slug(company_slug):
                    raise HTTPException(status_code=409, detail='Organization already exists. Ask its administrator for an invitation.') from exc
                if self.user_repository.find_by_email(email):
                    raise HTTPException(status_code=409, detail='Email is already registered') from exc
                if attempt == 2:
                    raise
        delivery = send_verification_email(user.email, code)
        if not delivery.delivered:
            self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'email_verification_challenge_id': user.email_verification_challenge_id},
                {'$set': {'email_verification_code_hash': None}},
            )
        return self.verification_pending_response(user.email, self.build_delivery_message(code, delivery))

    def login(self, payload: LoginRequest) -> AuthResponse | VerificationPendingResponse:
        email = normalize_email(payload.email)
        validate_email(email)

        user = self.user_repository.find_by_email(email)
        if user is None or user.password_hash is None or not user.is_active or user.company.status != 'active':
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password')
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password')
        if not user.is_email_verified:
            current_time = now_utc()
            retry_after_seconds = self.seconds_until_resend(user, current_time)
            if (
                retry_after_seconds > 0
                and user.email_verification_expires_at is not None
                and user.email_verification_expires_at > current_time
            ):
                return self.verification_pending_response(
                    user.email,
                    message=('Use the verification code already sent to your email address.'
                             if user.email_verification_code_hash else
                             'Email delivery is unavailable. Configure SMTP and request a new code.'),
                    retry_after_seconds=retry_after_seconds,
                )
            response = self.issue_verification_code(user)
            return response

        return self.build_auth_response(user)

    def verify_email(self, payload: VerificationRequest, request_id: str = 'local') -> AuthResponse:
        email = normalize_email(payload.email)
        user = self.user_repository.find_by_email(email)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
        if not user.is_active or user.company.status != 'active':
            raise HTTPException(status_code=403, detail='Account is unavailable')
        if user.is_email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Email is already verified. Please sign in.',
            )
        if (
            user.email_verification_expires_at is None
            or user.email_verification_expires_at < now_utc()
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Verification code has expired')
        if user.email_verification_attempts >= VERIFICATION_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Too many invalid verification attempts. Request a new code.',
            )
        if not verify_email_code(user.email, payload.code.strip(), user.email_verification_code_hash):
            result = self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'email_verification_challenge_id': user.email_verification_challenge_id,
                 'email_verification_attempts': {'$lt': VERIFICATION_MAX_ATTEMPTS}},
                {'$inc': {'email_verification_attempts': 1}},
            )
            if result.modified_count == 0:
                raise HTTPException(status_code=400, detail='Verification challenge is no longer valid')
            user.email_verification_attempts += 1
            attempts_remaining = VERIFICATION_MAX_ATTEMPTS - user.email_verification_attempts
            if attempts_remaining <= 0:
                self.clear_verification_state(user)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Too many invalid verification attempts. Request a new code.',
                )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid verification code')

        def operation(session):
            result = self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'email_verification_challenge_id': user.email_verification_challenge_id,
                 'email_verification_code_hash': user.email_verification_code_hash, 'is_email_verified': False,
                 'email_verification_expires_at': {'$gt': now_utc()},
                 'email_verification_attempts': {'$lt': VERIFICATION_MAX_ATTEMPTS}},
                {'$set': {'is_email_verified': True, 'email_verification_code_hash': None,
                          'email_verification_challenge_id': None}}, session=session)
            if result.modified_count != 1:
                raise HTTPException(status_code=400, detail='Verification challenge is no longer valid')
            self.user_repository.collection.database.audit_events.insert_one({
                'company_id': ObjectId(user.company.id), 'actor_user_id': ObjectId(user.id),
                'action': 'auth.email_verified', 'resource_type': 'user', 'resource_id': ObjectId(user.id),
                'before': {}, 'after': {'is_email_verified': True}, 'request_id': request_id,
                'created_at': now_utc(),
            }, session=session)

        self.run_single_use_transaction(operation)
        user.is_email_verified = True
        return self.build_auth_response(user)

    def resend_verification(self, payload: ResendVerificationRequest) -> VerificationPendingResponse:
        email = normalize_email(payload.email)
        validate_email(email)

        user = self.user_repository.find_by_email(email)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
        if user.is_email_verified:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Email is already verified')
        if not user.is_active or user.company.status != 'active':
            raise HTTPException(status_code=403, detail='Account is unavailable')

        retry_after_seconds = self.seconds_until_resend(user)
        if retry_after_seconds > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    'A verification code was sent recently. '
                    f'Try again in {retry_after_seconds} seconds.'
                ),
                headers={'Retry-After': str(retry_after_seconds)},
            )

        response = self.issue_verification_code(user)
        return response

    def forgot_password(self, payload: ForgotPasswordRequest) -> PasswordResetPendingResponse:
        email = normalize_email(payload.email)
        validate_email(email)

        user = self.user_repository.find_by_email(email)
        generic_message = 'If an account exists for this email, a password reset code has been sent.'
        if user is None or not user.is_active or not user.password_hash or not user.is_email_verified:
            return self.password_reset_pending_response(email, generic_message)

        current_time = now_utc()
        retry_after_seconds = self.seconds_until_password_reset_resend(user, current_time)
        if (
            retry_after_seconds > 0
            and user.password_reset_expires_at is not None
            and user.password_reset_expires_at > current_time
        ):
            return self.password_reset_pending_response(email, generic_message)

        self.issue_password_reset_code(user)
        return self.password_reset_pending_response(email, generic_message)

    def reset_password(self, payload: ResetPasswordRequest, request_id: str = 'local') -> MessageResponse:
        email = normalize_email(payload.email)
        validate_email(email)
        if payload.password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Password and confirm password must match',
            )

        user = self.user_repository.find_by_email(email)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
        if user.password_reset_expires_at is None or user.password_reset_expires_at < now_utc():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Password reset code has expired')
        if user.password_reset_attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Too many invalid reset attempts. Request a new code.',
            )
        if not verify_password_reset_code(email, payload.code.strip(), user.password_reset_code_hash):
            result = self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'password_reset_challenge_id': user.password_reset_challenge_id,
                 'password_reset_attempts': {'$lt': PASSWORD_RESET_MAX_ATTEMPTS}},
                {'$inc': {'password_reset_attempts': 1}},
            )
            if result.modified_count != 1:
                raise HTTPException(status_code=400, detail='Reset challenge is no longer valid')
            user.password_reset_attempts += 1
            attempts_remaining = PASSWORD_RESET_MAX_ATTEMPTS - user.password_reset_attempts
            if attempts_remaining <= 0:
                self.clear_password_reset_state(user)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Too many invalid reset attempts. Request a new code.',
                )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid password reset code')

        password_hash = hash_password(payload.password)
        def operation(session):
            result = self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'password_reset_challenge_id': user.password_reset_challenge_id,
                 'password_reset_code_hash': user.password_reset_code_hash,
                 'password_reset_expires_at': {'$gt': now_utc()},
                 'password_reset_attempts': {'$lt': PASSWORD_RESET_MAX_ATTEMPTS}},
                {'$set': {'password_hash': password_hash, 'password_reset_code_hash': None,
                          'password_reset_challenge_id': None}, '$inc': {'token_version': 1}}, session=session)
            if result.modified_count != 1:
                raise HTTPException(status_code=400, detail='Reset challenge is no longer valid')
            self.user_repository.collection.database.audit_events.insert_one({
                'company_id': ObjectId(user.company.id), 'actor_user_id': ObjectId(user.id),
                'action': 'auth.password_reset', 'resource_type': 'user', 'resource_id': ObjectId(user.id),
                'before': {}, 'after': {'sessions_revoked': True}, 'request_id': request_id,
                'created_at': now_utc(),
            }, session=session)

        self.run_single_use_transaction(operation)
        return MessageResponse(message='Password reset successful. Please sign in with your new password.')

    def get_invitation_details(self, token: str) -> InvitationDetailsResponse:
        user = self.get_invited_user(token)
        return InvitationDetailsResponse(
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            department=user.department,
            role=user.role,
            company_name=user.company.name,
        )

    def accept_invitation(self, payload: AcceptInvitationRequest, request_id: str = 'local') -> MessageResponse:
        if payload.password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Password and confirm password must match',
            )

        user = self.get_invited_user(payload.token)
        password_hash = hash_password(payload.password)
        def operation(session):
            result = self.user_repository.collection.update_one(
                {'_id': ObjectId(user.id), 'invitation_token_hash': hash_invitation_token(payload.token),
                 'invitation_expires_at': {'$gt': now_utc()}, 'password_hash': None, 'is_active': True},
                {'$set': {'password_hash': password_hash, 'is_email_verified': True,
                          'invitation_token_hash': None, 'invitation_expires_at': None},
                 '$inc': {'token_version': 1}}, session=session)
            if result.modified_count != 1:
                raise HTTPException(status_code=400, detail='Invitation is no longer valid')
            self.user_repository.collection.database.audit_events.insert_one({
                'company_id': ObjectId(user.company.id), 'actor_user_id': ObjectId(user.id),
                'action': 'auth.invitation_accepted', 'resource_type': 'user', 'resource_id': ObjectId(user.id),
                'before': {}, 'after': {'is_email_verified': True}, 'request_id': request_id,
                'created_at': now_utc(),
            }, session=session)

        self.run_single_use_transaction(operation)
        return MessageResponse(message='Invitation accepted. You can now sign in to your account.')
