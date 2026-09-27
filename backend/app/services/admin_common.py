from datetime import datetime, timezone
from time import sleep

from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.errors import DomainError, object_id
from app.db.mongo import get_database, get_mongo_client


def utcnow():
    return datetime.now(timezone.utc)


def company_id(user):
    return object_id(user.company.id)


def audit(db, session, user, action, resource_type, resource_id, request_id, before=None, after=None):
    db.audit_events.insert_one({
        'company_id': company_id(user), 'actor_user_id': object_id(user.id),
        'action': action, 'resource_type': resource_type, 'resource_id': resource_id,
        'before': before or {}, 'after': after or {}, 'request_id': request_id,
        'created_at': utcnow(),
    }, session=session)


def transaction(user, operation):
    db = get_database()
    for attempt in range(6):
        try:
            with get_mongo_client().start_session() as session:
                with session.start_transaction():
                    result = db.companies.update_one({'_id': company_id(user), 'status': 'active'},
                                                     {'$inc': {'administration_revision': 1}}, session=session)
                    if result.matched_count != 1:
                        raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
                    return operation(db, session)
        except PyMongoError as exc:
            if attempt == 5 or not exc.has_error_label('TransientTransactionError'):
                raise
            sleep(min(0.02 * (2 ** attempt), 0.3))


def find_tenant(collection, user, resource_id, session=None):
    item = collection.find_one({'_id': object_id(resource_id), 'company_id': company_id(user)}, session=session)
    if not item:
        raise DomainError(404, 'not_found', 'Resource not found')
    return item


def check_version(item, version):
    if item.get('version', 1) != version:
        raise DomainError(409, 'stale_version', 'Resource changed. Refresh and try again.')


def serialize(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items() if key != 'name_normalized'}
    return value
