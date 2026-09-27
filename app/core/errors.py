import logging
import uuid

from bson import ObjectId
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)


class DomainError(Exception):
    def __init__(self, status_code: int, code: str, message: str, field_errors: dict | None = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field_errors = field_errors or {}


def object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise DomainError(422, 'invalid_id', 'Invalid resource ID')
    return ObjectId(value)


def error_response(request: Request, status_code: int, code: str, message: str,
                   field_errors: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={'detail': {
        'code': code, 'message': message, 'field_errors': field_errors or {},
        'request_id': request.state.request_id,
    }})


def install_error_handlers(app):
    from app.services.protected_prompt_service import RunOutcome

    @app.exception_handler(RunOutcome)
    async def run_outcome(request: Request, exc: RunOutcome):
        return JSONResponse(status_code=exc.status, headers={
            'Retry-After': str(exc.run['retry_after'])} if exc.status == 429 and exc.run.get('retry_after') else None,
            content={'detail': {'code': exc.code,
            'message': exc.message, 'field_errors': {}, 'request_id': request.state.request_id},
            'run': exc.run})
    @app.middleware('http')
    async def request_identity(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers['X-Request-ID'] = request.state.request_id
        return response

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, exc: DomainError):
        return error_response(request, exc.status_code, exc.code, exc.message, exc.field_errors)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = {401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
                409: 'conflict', 422: 'validation_error', 429: 'rate_limited',
                503: 'unavailable'}.get(exc.status_code, 'request_error')
        response = error_response(request, exc.status_code, code, str(exc.detail))
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields: dict[str, list[str]] = {}
        for item in exc.errors():
            location = '.'.join(str(part) for part in item['loc'] if part != 'body')
            fields.setdefault(location or 'request', []).append(item['msg'])
        return error_response(request, 422, 'validation_error', 'Check the submitted fields', fields)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.error('Unhandled request error %s (%s)', request.state.request_id, type(exc).__name__)
        return error_response(request, 500, 'internal_error', 'An unexpected error occurred')

    @app.exception_handler(PyMongoError)
    async def database_error(request: Request, exc: PyMongoError):
        logger.warning('Database unavailable for request %s: %s', request.state.request_id, type(exc).__name__)
        return error_response(request, 503, 'database_unavailable', 'Database is temporarily unavailable')
