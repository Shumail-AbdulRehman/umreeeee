"""Restricted platform timelines and the shared company access operation.

Audit payloads may contain tenant content. This boundary projects only lifecycle
metadata, then constructs an explicit DTO instead of using tenant serializers.
"""

from datetime import timedelta
from time import sleep

from pymongo.errors import PyMongoError

from app.core.errors import DomainError, object_id
from app.core.permissions import require_super_admin
from app.services.admin_common import check_version, utcnow


STATUS_ACTION = 'platform.organization_status_changed'
EVENT_LABELS = {
    STATUS_ACTION: 'Company access changed',
    'auth.signup': 'Company registered',
    'auth.email_verified': 'Email verified',
    'auth.invitation_accepted': 'Invitation accepted',
    'integration.created': 'Integration created',
    'integration.updated': 'Integration updated',
    'integration.status_changed': 'Integration status changed',
    'policy.created': 'Policy created',
    'policy.updated': 'Policy updated',
    'policy.status_changed': 'Policy status changed',
    'policy.groups_updated': 'Policy assignments updated',
    'policy.group_checks_updated': 'Policy checks updated',
    'policy.catalog_imported': 'Policy catalog imported',
    'policy_set.created': 'Policy created',
    'policy_set.updated': 'Policy updated',
    'policy_set.groups_updated': 'Policy assignments updated',
    'policy_set.status_changed': 'Policy status changed',
    'violation.resolved': 'Violation status changed',
    'settings.updated': 'Company settings updated',
}


def _bounded_text(value, maximum, default=''):
    return value[:maximum] if isinstance(value, str) else default


def audit_pipeline(*, company_id=None, event_type=None, start=None, end=None, page=1, page_size=20):
    """Deduplicate access events before pagination and fetch only bounded names."""
    match = {'action': event_type or {'$in': list(EVENT_LABELS)}}
    dates = {}
    if start is not None:
        dates['$gte'] = start
    if end is not None:
        dates['$lte'] = end
    if dates:
        match['created_at'] = dates
    pipeline = [
        {'$match': match},
        {'$project': {
            'action': 1, 'created_at': 1, 'request_id': 1, 'actor_user_id': 1,
            'target_company_id': {'$convert': {
                'input': {'$cond': [{'$eq': ['$action', STATUS_ACTION]},
                                    '$resource_id', '$company_id']},
                'to': 'objectId', 'onError': None, 'onNull': None,
            }},
            'to_status': '$after.status', 'from_status': '$before.status',
            # Status reasons are the only free-form audit field approved here.
            'reason': {'$cond': [{'$eq': ['$action', STATUS_ACTION]}, '$after.reason', None]},
        }},
        {'$match': {'target_company_id': company_id if company_id is not None else {'$ne': None}}},
        {'$sort': {'created_at': -1, '_id': -1}},
        {'$group': {
            '_id': {'$cond': [{'$and': [
                {'$eq': ['$action', STATUS_ACTION]},
                {'$eq': [{'$type': '$request_id'}, 'string']},
                {'$ne': ['$request_id', '']},
            ]}, {
                'request': '$request_id', 'company': '$target_company_id',
                'before': '$from_status', 'after': '$to_status',
            }, {'event': '$_id'}]},
            'event': {'$first': '$$ROOT'},
        }},
        {'$replaceRoot': {'newRoot': '$event'}},
        {'$sort': {'created_at': -1, '_id': -1}},
        {'$facet': {
            'total': [{'$count': 'count'}],
            'items': [
                {'$skip': (page - 1) * page_size}, {'$limit': page_size},
                {'$lookup': {
                    'from': 'companies', 'localField': 'target_company_id', 'foreignField': '_id',
                    'pipeline': [{'$project': {'name': 1}}], 'as': 'company',
                }},
                {'$lookup': {
                    'from': 'users', 'localField': 'actor_user_id', 'foreignField': '_id',
                    'pipeline': [{'$project': {'role': 1, 'first_name': 1, 'last_name': 1}}],
                    'as': 'actor',
                }},
                {'$project': {
                    '_id': 1, 'action': 1, 'created_at': 1, 'request_id': 1,
                    'target_company_id': 1, 'to_status': 1, 'reason': 1,
                    'company_name': {'$arrayElemAt': ['$company.name', 0]},
                    'actor_role': {'$arrayElemAt': ['$actor.role', 0]},
                    'actor_first_name': {'$cond': [{'$eq': ['$action', STATUS_ACTION]},
                        {'$arrayElemAt': ['$actor.first_name', 0]}, None]},
                    'actor_last_name': {'$cond': [{'$eq': ['$action', STATUS_ACTION]},
                        {'$arrayElemAt': ['$actor.last_name', 0]}, None]},
                }},
            ],
        }},
    ]
    return pipeline


def audit_event_read(row):
    """A second explicit allowlist keeps unapproved fields out of public DTOs."""
    action = row.get('action')
    if action not in EVENT_LABELS:
        raise DomainError(503, 'audit_unavailable', 'Audit history is temporarily unavailable')
    event = EVENT_LABELS[action]
    if action == STATUS_ACTION:
        event = {'suspended': 'Company suspended', 'active': 'Company reactivated'}.get(
            row.get('to_status'), event)
        actor = ' '.join(part for part in (
            _bounded_text(row.get('actor_first_name'), 80),
            _bounded_text(row.get('actor_last_name'), 80),
        ) if part).strip() or 'Platform owner'
    else:
        if action == 'violation.resolved':
            # The existing tenant writer keeps this action ID for all three
            # review transitions; after.status is the actual resulting state.
            event = {'open': 'Violation reopened', 'reviewed': 'Violation reviewed',
                     'resolved': 'Violation resolved'}.get(row.get('to_status'), event)
        role = row.get('actor_role')
        actor = 'Organization admin' if role in {'org_admin', 'super_admin'} else 'Member'
        if row.get('actor_role') is None:
            actor = 'System'
        if action == 'auth.email_verified' and role in {'org_admin', 'super_admin'}:
            event = 'Admin verified'
    created_at = row.get('created_at')
    return {
        'id': str(row['_id']), 'company_id': str(row['target_company_id']),
        'company_name': _bounded_text(row.get('company_name'), 160, 'Former company'),
        'action': action, 'event': event, 'actor_name': actor,
        'created_at': created_at.isoformat() if hasattr(created_at, 'isoformat') else created_at,
        'request_id': _bounded_text(row.get('request_id'), 200, None),
        'reason': _bounded_text(row.get('reason'), 180, None) if action == STATUS_ACTION else None,
    }


class PlatformAuditService:
    def __init__(self, db):
        self.db = db

    def list(self, user, company_id=None, event_type=None, days=None, page=1, page_size=20):
        require_super_admin(user)
        if type(page) is not int or page < 1 or type(page_size) is not int or not 1 <= page_size <= 100:
            raise DomainError(422, 'invalid_page', 'Use a valid page and page size')
        if days is not None and (type(days) is not int or days not in {7, 30}):
            raise DomainError(422, 'invalid_window', 'Choose a 7-day or 30-day reporting window')
        if event_type is not None and event_type not in EVENT_LABELS:
            raise DomainError(422, 'invalid_event_type', 'Choose a supported audit event type')
        target = object_id(company_id) if company_id is not None else None
        if target is not None and not self.db.companies.find_one({'_id': target}, {'_id': 1}):
            raise DomainError(404, 'not_found', 'Company not found')
        now = utcnow()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1) if days else None
        result = next(iter(self.db.audit_events.aggregate(audit_pipeline(
            company_id=target, event_type=event_type, start=start, end=now, page=page, page_size=page_size,
        ))), {'items': [], 'total': []})
        return {'items': [audit_event_read(row) for row in result['items']],
                'total': result['total'][0]['count'] if result['total'] else 0,
                'page': page, 'page_size': page_size}

    def change_status(self, user, company_id, status, version, reason, request_id):
        require_super_admin(user)
        target, home = object_id(company_id), object_id(user.company.id)
        if target == home:
            raise DomainError(403, 'own_company', 'Cannot change access to your own organization')
        if status not in {'active', 'suspended'} or type(version) is not int or version < 1:
            raise DomainError(422, 'invalid_status', 'Choose a valid access status and version')
        if reason is not None:
            if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 180:
                raise DomainError(422, 'invalid_reason', 'Enter a reason of 1 to 180 characters',
                                  {'reason': ['Enter a reason of 1 to 180 characters']})
            reason = reason.strip()
        for attempt in range(6):
            try:
                with self.db.client.start_session() as session:
                    with session.start_transaction():
                        reachable = self.db.companies.update_one(
                            {'_id': home, '$or': [{'status': 'active'}, {'status': {'$exists': False}}]},
                            {'$inc': {'administration_revision': 1}}, session=session,
                        )
                        if reachable.matched_count != 1:
                            raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
                        return self._change_status(user, target, status, version, reason, request_id, session)
            except PyMongoError as exc:
                if attempt == 5 or not exc.has_error_label('TransientTransactionError'):
                    raise
                sleep(min(.02 * 2 ** attempt, .3))

    def _change_status(self, user, target, status, version, reason, request_id, session):
        old = self.db.companies.find_one({'_id': target}, {'name': 1, 'status': 1, 'version': 1},
                                         session=session)
        if not old:
            raise DomainError(404, 'not_found', 'Company not found')
        check_version(old, version)
        if old.get('status', 'active') == status:
            return self._status_response(old, status, version, 'Organization access is unchanged')
        query = {'_id': target, 'version': version}
        if 'version' not in old:
            query = {'_id': target, '$or': [{'version': version}, {'version': {'$exists': False}}]}
        now = utcnow()
        changed = self.db.companies.update_one(query, {'$set': {
            'status': status, 'version': version + 1, 'updated_at': now,
        }}, session=session)
        if changed.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Organization changed. Refresh and try again.')
        before, after = {'status': old.get('status', 'active')}, {'status': status}
        if reason is not None:
            after['reason'] = reason
        event = {
            'actor_user_id': object_id(user.id), 'action': STATUS_ACTION,
            'resource_type': 'company', 'resource_id': target,
            'before': before, 'after': after, 'request_id': request_id, 'created_at': now,
        }
        self.db.audit_events.insert_many([
            {**event, 'company_id': object_id(user.company.id)}, {**event, 'company_id': target},
        ], session=session)
        return self._status_response(old, status, version + 1, 'Organization status updated')

    @staticmethod
    def _status_response(company, status, version, message):
        return {'organization': {'id': str(company['_id']), 'name': company['name'],
                                 'status': status, 'version': version}, 'message': message}
