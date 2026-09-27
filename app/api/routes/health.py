from fastapi import APIRouter, Response, status

from app.db.mongo import get_database_status
from app.db.mongo import get_database, verify_transactions
from app.db.indexes import ensure_indexes
from app.db.diagnostics import log_failure
from pymongo.errors import PyMongoError
from app.validators.registry import registry


router = APIRouter(tags=['health'])


@router.get('/api/health')
def health_check() -> dict[str, str]:
    return {'status': 'live'}


@router.get('/api/ready')
def readiness(response: Response) -> dict[str, str]:
    database_status = get_database_status()
    if database_status['status'] == 'ready':
        phase = 'readiness_transactions'
        try:
            verify_transactions()
            phase = 'readiness_indexes'
            ensure_indexes(get_database())
            phase = 'readiness_policy_models'
            missing = [kind for kind in ('prompt_injection', 'toxicity')
                       if not registry.capabilities()[kind]['ready'] and
                       get_database().policies.count_documents({'status': 'active', 'rules.type': kind}, limit=1)]
            if missing:
                database_status['status'] = 'unavailable'
        except (PyMongoError, RuntimeError, ValueError) as exc:
            log_failure(phase, exc)
            database_status['status'] = 'unavailable'
    if database_status['status'] != 'ready':
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {'status': database_status['status']}
