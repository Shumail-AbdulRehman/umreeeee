"""Explicit public contracts for the metadata-only platform workspace."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PlatformDays = Literal[7, 30]
AccessStatus = Literal['active', 'suspended']
OnboardingStatus = Literal['ready', 'setup_incomplete', 'awaiting_admin']
ActivityFilter = Literal['used', 'idle']
CompanySort = Literal['runs', 'name', 'violations']


class PlatformModel(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)


class PlatformAccessChange(PlatformModel):
    status: AccessStatus
    version: int = Field(ge=1, strict=True)
    reason: str = Field(min_length=1, max_length=180)

    @field_validator('reason', mode='before')
    @classmethod
    def trim_reason(cls, value):
        return value.strip() if isinstance(value, str) else value


class PlatformWindow(PlatformModel):
    days: PlatformDays
    from_time: datetime = Field(alias='from')
    to: datetime
    timezone: Literal['UTC'] = 'UTC'


class PlatformSeriesPoint(PlatformModel):
    date: datetime
    allowed: int = Field(ge=0)
    blocked: int = Field(ge=0)
    other: int = Field(ge=0)


class PlatformCompanySummary(PlatformModel):
    id: str
    name: str
    slug: str
    status: AccessStatus
    version: int = Field(ge=1)
    created_at: datetime
    is_own: bool
    onboarding: OnboardingStatus
    workspace_runs: int = Field(ge=0)
    last_workspace_submission: datetime | None
    open_violations: int = Field(ge=0)
    high_severity_violations: int = Field(ge=0)
    series: list[PlatformSeriesPoint]


class PlatformAttention(PlatformModel):
    id: str
    company_id: str
    company_name: str
    kind: str
    title: str
    description: str
    occurred_at: datetime | None
    tone: Literal['violet', 'green', 'amber', 'rose', 'blue', 'neutral']


class PlatformAttentionPreview(PlatformModel):
    items: list[PlatformAttention]
    total: int = Field(ge=0)


class PlatformTotals(PlatformModel):
    total_companies: int = Field(ge=0)
    using_companies: int = Field(ge=0)
    onboarding_companies: int = Field(ge=0)
    suspended_companies: int = Field(ge=0)


class PlatformOverviewRead(PlatformModel):
    window: PlatformWindow
    generated_at: datetime
    metrics: PlatformTotals
    series: list[PlatformSeriesPoint]
    attention: PlatformAttentionPreview
    companies: list[PlatformCompanySummary]


class PlatformCompaniesRead(PlatformModel):
    items: list[PlatformCompanySummary]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    window: PlatformWindow
    generated_at: datetime


class PlatformPolicyCoverage(PlatformModel):
    required: bool
    eligible_members: int = Field(ge=0)
    covered_members: int = Field(ge=0)


class PlatformCompanyMetrics(PlatformModel):
    active_accounts: int = Field(ge=0)
    verified_admins: int = Field(ge=0)
    pending_invitations: int = Field(ge=0)
    failed_invitations: int = Field(ge=0)
    active_groups: int = Field(ge=0)
    active_integrations: int = Field(ge=0)
    dlp_policies: int = Field(ge=0)
    guardrail_policies: int = Field(ge=0)
    submitting_users: int = Field(ge=0)
    allowed_runs: int = Field(ge=0)
    blocked_runs: int = Field(ge=0)
    provider_errors: int = Field(ge=0)
    validation_errors: int = Field(ge=0)
    configuration_errors: int = Field(ge=0)
    interrupted_runs: int = Field(ge=0)
    processing_runs: int = Field(ge=0)
    other_runs: int = Field(ge=0)
    evaluation_coverage: float | None = Field(ge=0, le=100)
    evaluated_runs: int = Field(ge=0)
    terminal_runs: int = Field(ge=0)
    policy_coverage: PlatformPolicyCoverage


class PlatformAuditEvent(PlatformModel):
    id: str
    company_id: str
    company_name: str
    action: str
    event: str
    actor_name: str
    created_at: datetime
    request_id: str | None
    reason: str | None


class PlatformAuditRead(PlatformModel):
    items: list[PlatformAuditEvent]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)


class PlatformCompanyRead(PlatformModel):
    company: PlatformCompanySummary
    window: PlatformWindow
    generated_at: datetime
    series: list[PlatformSeriesPoint]
    attention: list[PlatformAttention]
    metrics: PlatformCompanyMetrics
    history: PlatformAuditRead


class PlatformOrganizationAccessRead(PlatformModel):
    id: str
    name: str
    status: AccessStatus
    version: int = Field(ge=1)


class PlatformAccessRead(PlatformModel):
    organization: PlatformOrganizationAccessRead
    message: str
