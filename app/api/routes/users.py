from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.services import get_user_management_service
from app.models.user import User
from app.schemas.users import (
    ManagedUserCreateRequest,
    ManagedUserMutationResponse,
    ManagedUsersResponse,
    ManagedUserUpdateRequest,
    ManagedUserStatusRequest,
)
from app.services.user_management_service import UserManagementService


router = APIRouter(prefix='/api/users', tags=['users'])


@router.get('', response_model=ManagedUsersResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str = '',
    status: Literal['active', 'invited', 'pending_verification', 'inactive'] | None = None,
    role: Literal['org_admin', 'user', 'super_admin'] | None = None,
    group_id: str | None = None,
    current_user: User = Depends(get_current_user),
    user_management_service: UserManagementService = Depends(get_user_management_service),
) -> ManagedUsersResponse:
    return user_management_service.list_company_users(current_user, page, page_size, q, status, role, group_id)


@router.post('', response_model=ManagedUserMutationResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: ManagedUserCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    user_management_service: UserManagementService = Depends(get_user_management_service),
) -> ManagedUserMutationResponse:
    return user_management_service.create_user(current_user, payload, request.state.request_id)


@router.put('/{user_id}', response_model=ManagedUserMutationResponse)
def update_user(
    user_id: str,
    payload: ManagedUserUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    user_management_service: UserManagementService = Depends(get_user_management_service),
) -> ManagedUserMutationResponse:
    return user_management_service.update_user(current_user, user_id, payload, request.state.request_id)


@router.patch('/{user_id}/status', response_model=ManagedUserMutationResponse)
def update_status(
    user_id: str,
    payload: ManagedUserStatusRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    user_management_service: UserManagementService = Depends(get_user_management_service),
) -> ManagedUserMutationResponse:
    return user_management_service.set_status(current_user, user_id, payload.is_active,
                                              payload.version, request.state.request_id)


@router.post('/{user_id}/resend-invitation')
def resend_invitation(user_id: str, request: Request, current_user: User = Depends(get_current_user),
                      user_management_service: UserManagementService = Depends(get_user_management_service)):
    return user_management_service.resend_invitation(current_user, user_id, request.state.request_id)
