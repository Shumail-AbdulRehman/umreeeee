from datetime import datetime, timedelta
import socket
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import Response

from app.api.dependencies.auth import get_current_user
from app.core.config import RABBITMQ_URL, RED_TEAM_QUEUE_NAME
from app.core.errors import DomainError
from app.core.permissions import require_admin
from app.db.mongo import get_database
from app.schemas.red_team import CloneRequest, LaunchRequest, TestConfig, TestEdit
from app.services.admin_common import utcnow
from app.services.red_team_service import RedTeamService


router = APIRouter(prefix='/api/red-team', tags=['red-team'])


def service():
    return RedTeamService(get_database())


@router.get('/capabilities')
def capabilities(user=Depends(get_current_user), red_team: RedTeamService = Depends(service)):
    require_admin(user)
    payload = red_team.capabilities()
    parts = urlsplit(RABBITMQ_URL)
    reachable = False
    try:
        with socket.create_connection((parts.hostname or '127.0.0.1', parts.port or 5672), timeout=.3):
            reachable = True
    except OSError:
        pass
    now = utcnow()
    heartbeats = {
        row['kind']: row['updated_at'].isoformat()
        for row in get_database().worker_heartbeats.find(
            {'updated_at': {'$gte': now - timedelta(seconds=45)}}, {'kind': 1, 'updated_at': 1},
        )
    }
    return {**payload, 'broker_transport_reachable': reachable,
            'worker_observed': 'worker' in heartbeats, 'dispatcher_observed': 'dispatcher' in heartbeats,
            'observed_at': heartbeats, 'queue_name': RED_TEAM_QUEUE_NAME}


@router.post('/config-preview')
def preview(payload: TestConfig, test_id: str | None = None, user=Depends(get_current_user),
            red_team: RedTeamService = Depends(service)):
    return red_team.preview(user, payload, test_id)


@router.get('/tests')
def tests(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          q: str | None = None, status: str | None = None, mode: str | None = None,
          integration_id: str | None = None, from_time: datetime | None = Query(None, alias='from'),
          to_time: datetime | None = Query(None, alias='to'), user=Depends(get_current_user),
          red_team: RedTeamService = Depends(service)):
    return red_team.list(user, page, page_size, q, status, mode, integration_id, from_time, to_time)


@router.post('/tests', status_code=201)
def create(payload: TestConfig, request: Request, user=Depends(get_current_user),
           red_team: RedTeamService = Depends(service)):
    return red_team.create(user, payload, request.state.request_id)


@router.get('/tests/{test_id}')
def detail(test_id: str, user=Depends(get_current_user), red_team: RedTeamService = Depends(service)):
    return red_team.detail(user, test_id)


@router.get('/tests/{test_id}/config-preview')
def stored_preview(test_id: str, user=Depends(get_current_user),
                   red_team: RedTeamService = Depends(service)):
    return red_team.stored_preview(user, test_id)


@router.put('/tests/{test_id}')
def edit(test_id: str, payload: TestEdit, request: Request, user=Depends(get_current_user),
         red_team: RedTeamService = Depends(service)):
    return red_team.edit(user, test_id, payload, request.state.request_id)


@router.post('/tests/{test_id}/launch', status_code=202)
def launch(test_id: str, payload: LaunchRequest, request: Request,
           idempotency_key: str | None = Header(None, alias='Idempotency-Key'),
           user=Depends(get_current_user), red_team: RedTeamService = Depends(service)):
    if not idempotency_key:
        raise DomainError(422, 'idempotency_key_required', 'Idempotency-Key header is required')
    return red_team.launch(user, test_id, payload.version, idempotency_key, request.state.request_id)


@router.post('/tests/{test_id}/cancel')
def cancel(test_id: str, request: Request, user=Depends(get_current_user),
           red_team: RedTeamService = Depends(service)):
    return red_team.cancel(user, test_id, request.state.request_id)


@router.post('/tests/{test_id}/clone', status_code=201)
def clone(test_id: str, payload: CloneRequest, request: Request, user=Depends(get_current_user),
          red_team: RedTeamService = Depends(service)):
    return red_team.clone(user, test_id, payload.mode, request.state.request_id)


@router.get('/tests/{test_id}/results')
def results(test_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
            plugin: str | None = None, strategy: str | None = None, verdict: str | None = None,
            verdict_source: str | None = None, user=Depends(get_current_user),
            red_team: RedTeamService = Depends(service)):
    return red_team.results(user, test_id, page, page_size, plugin=plugin, strategy=strategy,
                            verdict=verdict, verdict_source=verdict_source)


@router.get('/tests/{test_id}/results/{attack_id}')
def result_detail(test_id: str, attack_id: str, user=Depends(get_current_user),
                  red_team: RedTeamService = Depends(service)):
    return red_team.result_detail(user, test_id, attack_id)


@router.get('/tests/{test_id}/report')
def report(test_id: str, user=Depends(get_current_user), red_team: RedTeamService = Depends(service)):
    return red_team.report(user, test_id)


@router.get('/tests/{test_id}/export')
def export(test_id: str, format: str = 'json', user=Depends(get_current_user),
           red_team: RedTeamService = Depends(service)):
    content, mime = red_team.export(user, test_id, format)
    return Response(content, media_type=mime, headers={
        'Content-Disposition': f'attachment; filename="red-team-{test_id}.{format}"',
    })
