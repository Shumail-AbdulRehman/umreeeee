from fastapi import APIRouter, Depends, Query, Request, Header
from fastapi.responses import JSONResponse
from datetime import datetime

from app.api.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.prompts import PromptRunExecuteRequest
from app.services.protected_prompt_service import ProtectedPromptService
from app.db.mongo import get_database
from app.core.errors import DomainError


router = APIRouter(prefix='/api/prompt-workspace', tags=['prompt-workspace'])


def protected_service():
    return ProtectedPromptService(get_database())


@router.get('/context')
def context(
    current_user: User = Depends(get_current_user),
    service: ProtectedPromptService = Depends(protected_service),
):
    return service.context(current_user)


@router.get('/runs')
def runs(
    page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = None, model: str | None = None, provider: str | None = None,
    from_time: datetime | None = Query(None, alias='from'), to_time: datetime | None = Query(None, alias='to'),
    user_id: str | None = None,
    current_user: User = Depends(get_current_user),
    service: ProtectedPromptService = Depends(protected_service),
):
    return service.list_runs(current_user, page=page, page_size=page_size, status=status,
                             model=model, provider=provider, start=from_time, end=to_time, user_id=user_id)


@router.get('/runs/{run_id}')
def run_detail(run_id: str, current_user: User = Depends(get_current_user),
               service: ProtectedPromptService = Depends(protected_service)):
    return service.detail(current_user, run_id)


@router.post('/run')
def run_prompt(
    payload: PromptRunExecuteRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    service: ProtectedPromptService = Depends(protected_service),
):
    if not idempotency_key:
        raise DomainError(422, 'idempotency_key_required', 'Idempotency-Key header is required')
    result = service.execute_protected(current_user, payload, {'source': 'workspace',
        'key': idempotency_key, 'request_id': request.state.request_id})
    return JSONResponse(status_code=202, content=result, headers={
        'Location': result['poll']}) if result['run']['status'] == 'processing' else result
