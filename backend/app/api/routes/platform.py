"""Super-admin reporting uses dedicated, metadata-only platform responses."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies.auth import get_current_user
from app.core.permissions import require_super_admin
from app.db.mongo import get_database
from app.schemas.platform import (
    AccessStatus, ActivityFilter, CompanySort, OnboardingStatus,
    PlatformAccessChange, PlatformAccessRead, PlatformAuditRead,
    PlatformCompaniesRead, PlatformCompanyRead, PlatformOverviewRead,
)
from app.services.platform_audit_service import PlatformAuditService
from app.services.platform_service import PlatformService


router = APIRouter(prefix='/api/platform', tags=['platform'])
DaysQuery = Literal['7', '30']


def platform_user(user=Depends(get_current_user)):
    require_super_admin(user)
    return user


def get_platform_service():
    return PlatformService(get_database())


def get_platform_audit_service():
    return PlatformAuditService(get_database())


@router.get('/overview', response_model=PlatformOverviewRead)
def overview(days: DaysQuery = Query('7'), user=Depends(platform_user),
             service: PlatformService = Depends(get_platform_service)):
    return service.overview(user, days=int(days))


@router.get('/companies', response_model=PlatformCompaniesRead)
def companies(days: DaysQuery = Query('7'), page: int = Query(1, ge=1),
              page_size: int = Query(8, ge=1, le=100), q: str = Query('', max_length=120),
              access: AccessStatus | None = None, onboarding: OnboardingStatus | None = None,
              activity: ActivityFilter | None = None, sort: CompanySort = 'runs',
              user=Depends(platform_user), service: PlatformService = Depends(get_platform_service)):
    return service.companies(user, days=int(days), page=page, page_size=page_size, q=q,
                             access=access, onboarding=onboarding, activity=activity, sort=sort)


@router.get('/companies/{company_id}', response_model=PlatformCompanyRead)
def company(company_id: str, days: DaysQuery = Query('7'), user=Depends(platform_user),
            service: PlatformService = Depends(get_platform_service),
            audit: PlatformAuditService = Depends(get_platform_audit_service)):
    data = service.company(user, company_id, days=int(days))
    return {**data, 'history': audit.list(user, company_id=company_id, page=1, page_size=5)}


@router.get('/audit', response_model=PlatformAuditRead)
def history(company_id: str | None = None, event_type: str | None = Query(None, max_length=100),
            days: DaysQuery | None = Query(None), page: int = Query(1, ge=1),
            page_size: int = Query(20, ge=1, le=100), user=Depends(platform_user),
            service: PlatformAuditService = Depends(get_platform_audit_service)):
    return service.list(user, company_id=company_id, event_type=event_type,
                        days=int(days) if days is not None else None, page=page, page_size=page_size)


@router.patch('/companies/{company_id}/status', response_model=PlatformAccessRead)
def change_access(company_id: str, payload: PlatformAccessChange, request: Request,
                  user=Depends(platform_user), service: PlatformAuditService = Depends(get_platform_audit_service)):
    return service.change_status(user, company_id, payload.status, payload.version,
                                 payload.reason, request.state.request_id)
