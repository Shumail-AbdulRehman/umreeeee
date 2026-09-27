from fastapi import APIRouter, Depends, Request, status
from app.core.rate_limits import check_auth_limit

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.services import get_auth_service
from app.models.user import User
from app.db.mongo import get_database
from bson import ObjectId
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
from app.services.auth_service import AuthService


router = APIRouter(prefix='/api/auth', tags=['auth'])


@router.post('/signup', response_model=VerificationPendingResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> VerificationPendingResponse:
    check_auth_limit(request, 'signup')
    return auth_service.signup(payload, request.state.request_id)


@router.post('/login', response_model=AuthResponse | VerificationPendingResponse)
def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse | VerificationPendingResponse:
    check_auth_limit(request, 'login', payload.email)
    return auth_service.login(payload)


@router.post('/verify-email', response_model=AuthResponse)
def verify_email(
    payload: VerificationRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    return auth_service.verify_email(payload, request.state.request_id)


@router.post('/resend-verification', response_model=VerificationPendingResponse)
def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> VerificationPendingResponse:
    check_auth_limit(request, 'recovery', payload.email)
    return auth_service.resend_verification(payload)


@router.post('/forgot-password', response_model=PasswordResetPendingResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> PasswordResetPendingResponse:
    check_auth_limit(request, 'recovery', payload.email)
    return auth_service.forgot_password(payload)


@router.post('/reset-password', response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    return auth_service.reset_password(payload, request.state.request_id)


@router.get('/invitation', response_model=InvitationDetailsResponse)
def invitation_details(
    token: str,
    auth_service: AuthService = Depends(get_auth_service),
) -> InvitationDetailsResponse:
    return auth_service.get_invitation_details(token)


@router.post('/accept-invitation', response_model=MessageResponse)
def accept_invitation(
    payload: AcceptInvitationRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    return auth_service.accept_invitation(payload, request.state.request_id)


@router.get('/me', response_model=AuthenticatedUserRead)
def me(current_user: User = Depends(get_current_user)) -> AuthenticatedUserRead:
    response = AuthenticatedUserRead.model_validate(current_user)
    if current_user.group_ids:
        groups = get_database().groups.find({'_id': {'$in': [ObjectId(value) for value in current_user.group_ids]},
            'company_id': ObjectId(current_user.company.id), 'status': 'active'}, {'name': 1})
        response.group_summaries = [{'id': str(item['_id']), 'name': item['name']} for item in groups]
    return response
