from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.api.dependencies.auth import get_current_user
from app.core.errors import DomainError
from app.core.permissions import require_admin
from app.schemas.staff_import import StaffImportPreview, StaffImportReceipt
from app.services.staff_import_csv import MAX_BYTES
from app.services.staff_import_service import (
    StaffImportConflict, commit_staff_import, get_staff_import, get_staff_import_by_request, validate_staff_import,
)


router = APIRouter(prefix='/api/users/imports', tags=['staff import'])


async def _read_csv(request):
    if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'text/csv':
        raise DomainError(415, 'invalid_csv_type', 'Choose a CSV file and try again.')
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_BYTES:
            raise DomainError(413, 'file_too_large', 'The CSV exceeds 256 KB. Split the file and try again.')
        content.extend(chunk)
    return bytes(content)


@router.post('/validate', response_model=StaffImportPreview)
async def preview(request: Request, user=Depends(get_current_user)):
    require_admin(user)
    content = await _read_csv(request)
    return await run_in_threadpool(validate_staff_import, user, content)


@router.post('', response_model=StaffImportReceipt, status_code=202)
async def commit(request: Request, proof: str = Header(default='', alias='X-Import-Proof'),
                 idempotency_key: str = Header(alias='Idempotency-Key'), user=Depends(get_current_user)):
    require_admin(user)
    content = await _read_csv(request)
    try:
        return await run_in_threadpool(commit_staff_import, user, content, proof, idempotency_key,
                                       request.state.request_id)
    except StaffImportConflict as exc:
        return JSONResponse(status_code=409, content={
            'detail': {'code': exc.code, 'message': exc.message, 'request_id': request.state.request_id},
            'validation': exc.validation.model_dump(mode='json'),
        })


@router.get('/by-request/{idempotency_key}', response_model=StaffImportReceipt)
def receipt_by_request(idempotency_key: str, user=Depends(get_current_user)):
    return get_staff_import_by_request(user, idempotency_key)


@router.get('/{receipt_id}', response_model=StaffImportReceipt)
def receipt(receipt_id: str, user=Depends(get_current_user)):
    return get_staff_import(user, receipt_id)
