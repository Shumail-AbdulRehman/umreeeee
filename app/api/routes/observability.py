from datetime import datetime
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies.auth import get_current_user
from app.core.errors import DomainError, object_id
from app.core.permissions import ADMIN_ROLES, require_admin
from app.db.mongo import get_database
from app.services.admin_common import audit, transaction, utcnow, serialize
from app.services.protected_prompt_service import serialize_run

router = APIRouter(prefix='/api', tags=['observability'])


def tenant(user):
    return object_id(user.company.id)


def page(collection, query, number, size):
    return {'items': [serialize(item) for item in collection.find(query).sort(
        [('created_at', -1), ('_id', -1)]).skip((number - 1) * size).limit(size)],
        'page': number, 'page_size': size, 'total': collection.count_documents(query)}


def violation_read(value, user):
    item = serialize(value)
    item['id'] = item.pop('_id')
    if user.role not in ADMIN_ROLES:
        item.pop('findings', None)
        item['findings'] = [{'type': finding['type'], 'outcome': finding['outcome'],
                             'reason_code': finding.get('reason_code')} for finding in value.get('findings', [])]
    return item


@router.get('/violations')
def violations(page_number: int = Query(1, alias='page', ge=1), page_size: int = Query(20, ge=1, le=100),
               severity: str | None = None, action: str | None = None, category: str | None = None,
               status: str | None = None, from_time: datetime | None = Query(None, alias='from'),
               to_time: datetime | None = Query(None, alias='to'), user=Depends(get_current_user)):
    query = {'company_id': tenant(user), 'source': 'workspace'}
    if user.role not in ADMIN_ROLES:
        query['user_id'] = object_id(user.id)
    for name, value in [('severity', severity), ('action', action), ('category', category),
                        ('resolution_status', status)]:
        if value:
            query[name] = value
    if from_time or to_time:
        if any(x.tzinfo is None for x in (from_time, to_time) if x):
            raise DomainError(422, 'invalid_date', 'Date filters need a timezone')
        query['created_at'] = {}
        if from_time:
            query['created_at']['$gte'] = from_time
        if to_time:
            query['created_at']['$lt'] = to_time
    db = get_database()
    total = db.violations.count_documents(query)
    rows = db.violations.find(query).sort([('created_at', -1), ('_id', -1)]).skip((page_number - 1) * page_size).limit(page_size)
    return {'items': [violation_read(row, user) for row in rows], 'page': page_number,
            'page_size': page_size, 'total': total}


@router.get('/violations/{violation_id}')
def violation_detail(violation_id: str, user=Depends(get_current_user)):
    query = {'_id': object_id(violation_id), 'company_id': tenant(user), 'source': 'workspace'}
    if user.role not in ADMIN_ROLES:
        query['user_id'] = object_id(user.id)
    item = get_database().violations.find_one(query)
    if not item:
        raise DomainError(404, 'not_found', 'Violation not found')
    return {'violation': violation_read(item, user)}


class Resolution(BaseModel):
    model_config = ConfigDict(extra='forbid')
    resolution_status: Literal['open', 'reviewed', 'resolved']
    note: str = Field(default='', max_length=2000)
    version: int = Field(ge=1)


@router.patch('/violations/{violation_id}/resolution')
def resolve_violation(violation_id: str, payload: Resolution, request: Request,
                      user=Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        query = {'_id': object_id(violation_id), 'company_id': tenant(user), 'source': 'workspace'}
        old = db.violations.find_one(query, session=session)
        if not old:
            raise DomainError(404, 'not_found', 'Violation not found')
        if old['version'] != payload.version:
            raise DomainError(409, 'stale_version', 'Violation changed. Refresh and try again.')
        now = utcnow()
        changes = {'resolution_status': payload.resolution_status, 'resolution_note': payload.note,
            'resolved_by': object_id(user.id) if payload.resolution_status == 'resolved' else None,
            'resolved_at': now if payload.resolution_status == 'resolved' else None,
            'updated_at': now}
        result = db.violations.update_one({**query, 'version': payload.version},
            {'$set': changes, '$inc': {'version': 1}}, session=session)
        if result.matched_count != 1:
            raise DomainError(409, 'stale_version', 'Violation changed. Refresh and try again.')
        audit(db, session, user, 'violation.resolved', 'violation', old['_id'], request.state.request_id,
              before={'status': old['resolution_status']}, after={'status': payload.resolution_status})
        return {'violation': violation_read(db.violations.find_one(query, session=session), user)}
    return transaction(user, operation)


@router.get('/notifications')
def notifications(page_number: int = Query(1, alias='page', ge=1), page_size: int = Query(20, ge=1, le=100),
                  unread: bool = False, user=Depends(get_current_user)):
    query = {'company_id': tenant(user), 'recipient_user_id': object_id(user.id)}
    if unread:
        query['read_at'] = None
    return page(get_database().notifications, query, page_number, page_size)


@router.patch('/notifications/{notification_id}/read')
def mark_read(notification_id: str, user=Depends(get_current_user)):
    query = {'_id': object_id(notification_id), 'company_id': tenant(user),
             'recipient_user_id': object_id(user.id)}
    db = get_database()
    result = db.notifications.update_one({**query, 'read_at': None}, {'$set': {'read_at': utcnow()}})
    item = db.notifications.find_one(query)
    if not item:
        raise DomainError(404, 'not_found', 'Notification not found')
    return {'notification': serialize(item)}
