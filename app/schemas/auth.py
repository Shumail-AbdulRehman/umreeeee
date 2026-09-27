from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SignupRequest(BaseModel):
    first_name: str = Field(min_length=2, max_length=120)
    last_name: str = Field(min_length=2, max_length=120)
    company_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class VerificationRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(min_length=6, max_length=6)


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ResetPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class AcceptInvitationRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    email: str
    department: str
    role: str
    groups: list[str]
    group_ids: list[str]
    is_active: bool
    is_email_verified: bool
    account_status: str
    created_at: datetime


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    status: str
    version: int
    created_at: datetime


class AuthenticatedUserRead(UserRead):
    company: CompanyRead
    group_summaries: list[dict[str, str]] = Field(default_factory=list)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: AuthenticatedUserRead


class VerificationPendingResponse(BaseModel):
    requires_verification: bool = True
    email: str
    message: str
    retry_after_seconds: int | None = None


class PasswordResetPendingResponse(BaseModel):
    requires_password_reset: bool = True
    email: str
    message: str
    retry_after_seconds: int | None = None


class MessageResponse(BaseModel):
    message: str


class InvitationDetailsResponse(BaseModel):
    email: str
    first_name: str
    last_name: str
    department: str
    role: str
    company_name: str
