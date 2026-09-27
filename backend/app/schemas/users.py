from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ManagedUserCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    first_name: str = Field(min_length=2, max_length=120)
    last_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    department: str = Field(min_length=2, max_length=160)
    role: Literal['org_admin', 'user']
    group_ids: list[str] = Field(default_factory=list, max_length=32)


class ManagedUserUpdateRequest(ManagedUserCreateRequest):
    version: int = Field(ge=1)


class ManagedUserStatusRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_active: bool
    version: int = Field(ge=1)


class ManagedUserRead(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: str
    department: str
    role: str
    group_ids: list[str]
    account_status: str
    is_email_verified: bool
    is_active: bool
    invitation_delivery_status: Literal['sent', 'failed', 'pending'] | None = None
    version: int
    created_at: datetime


class ManagedUsersResponse(BaseModel):
    items: list[ManagedUserRead]
    page: int
    page_size: int
    total: int


class ManagedUserMutationResponse(BaseModel):
    user: ManagedUserRead
    message: str
