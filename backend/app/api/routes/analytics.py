from datetime import datetime
from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth import get_current_user
from app.db.mongo import get_database
from app.services.analytics_service import summary, series, models

router = APIRouter(prefix='/api/analytics', tags=['analytics'])


@router.get('/summary')
def summary_route(from_time: datetime | None = Query(None, alias='from'),
                  to_time: datetime | None = Query(None, alias='to'), user_id: str | None = None,
                  status: str | None = None, group_id: str | None = None, user=Depends(get_current_user)):
    return summary(get_database(), user, from_time, to_time, user_id, status, group_id)


@router.get('/series')
def series_route(from_time: datetime | None = Query(None, alias='from'),
                 to_time: datetime | None = Query(None, alias='to'), user_id: str | None = None,
                 status: str | None = None, group_id: str | None = None, user=Depends(get_current_user)):
    return series(get_database(), user, from_time, to_time, user_id, status, group_id)


@router.get('/models')
def models_route(from_time: datetime | None = Query(None, alias='from'),
                 to_time: datetime | None = Query(None, alias='to'), user_id: str | None = None,
                 status: str | None = None, group_id: str | None = None, user=Depends(get_current_user)):
    return models(get_database(), user, from_time, to_time, user_id, status, group_id)
