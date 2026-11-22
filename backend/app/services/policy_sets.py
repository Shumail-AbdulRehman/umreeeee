"""Named DLP/Guardrail policies backed by immutable catalog check definitions."""
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import DomainError, object_id
from app.services.admin_common import audit, transaction


def now():
    return datetime.now(timezone.utc)


def snapshot(db, session, item):
    db.policy_versions.insert_one({'company_id': item['company_id'], 'policy_id': item['_id'],
        'version': item['version'], 'snapshot': dict(item), 'created_at': now()}, session=session)


def catalog(db, company_id, kind, session):
    value = db.policies.find_one({'company_id': company_id, 'managed_catalog': True,
                                  'category': kind, 'status': 'active'}, session=session)
    if not value:
        raise DomainError(409, 'catalog_unavailable', 'Import the active catalog before creating a policy')
    return value


def checks(source, selected):
    available = [entry.get('pattern_id') or entry.get('id') for entry in source['entries']]
    chosen = set(selected)
    if not selected or len(chosen) != len(selected) or not chosen.issubset(available):
        raise DomainError(422, 'invalid_selection', 'Select one or more unique checks from this catalog')
    return [entry_id for entry_id in available if entry_id in chosen]


def user_company(user):
    return object_id(user.company.id)


def owned(db, user, policy_id, session):
    value = db.policies.find_one({'_id': object_id(policy_id), 'company_id': user_company(user),
                                  'policy_set': True}, session=session)
    if not value:
        raise DomainError(404, 'not_found', 'Policy not found')
    return value


def version_check(value, version):
    if value['version'] != version:
        raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')


def validate_groups(db, user, group_ids, session):
    ids = [object_id(value) for value in group_ids]
    if len(ids) != len(set(ids)):
        raise DomainError(422, 'invalid_scope', 'Select each group only once')
    if db.groups.count_documents({'_id': {'$in': ids}, 'company_id': user_company(user),
                                  'status': 'active'}, session=session) != len(ids):
        raise DomainError(422, 'invalid_scope', 'Select active groups in your organization')
    return ids


def create(user, payload, request_id):
    def operation(db, session):
        source = catalog(db, user_company(user), payload.category, session)
        selected = checks(source, payload.selected_entry_ids)
        name = ' '.join(payload.name.split())
        if len(name) < 2:
            raise DomainError(422, 'invalid_name', 'Enter a policy name of at least two characters')
        item = {'company_id': user_company(user), 'policy_set': True, 'category': payload.category,
                'catalog_id': source['_id'], 'source_sha256': source['source_sha256'],
                'entries': source['entries'], 'entry_count': source['entry_count'],
                'name': name, 'name_normalized': name.casefold(),
                'description': payload.description.strip(), 'status': 'active',
                'action': 'BLOCK', 'severity': 'high', 'match': 'any',
                'stages': ['input', 'output'], 'scope': {'group_ids': [], 'integration_ids': []},
                'assignment_mode': 'explicit_groups', 'selected_entry_ids': selected,
                'rules': [{'rule_id': str(uuid4()), 'type': 'catalog',
                           'config': {'kind': payload.category, 'selected_entry_ids': selected}}],
                'version': 1, 'created_at': now(), 'updated_at': now(),
                'created_by': object_id(user.id), 'updated_by': object_id(user.id)}
        try:
            item['_id'] = db.policies.insert_one(item, session=session).inserted_id
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A policy with this name already exists') from exc
        snapshot(db, session, item)
        audit(db, session, user, 'policy_set.created', 'policy', item['_id'], request_id,
              after={'category': item['category'], 'name': name, 'selected_count': len(selected)})
        return item
    return transaction(user, operation)


def update(user, policy_id, payload, request_id):
    def operation(db, session):
        old = owned(db, user, policy_id, session)
        version_check(old, payload.version)
        if old['status'] == 'archived':
            raise DomainError(409, 'archived_policy', 'Archived policies cannot be edited')
        source = catalog(db, user_company(user), old['category'], session)
        selected = checks(source, payload.selected_entry_ids)
        name = ' '.join(payload.name.split())
        if len(name) < 2:
            raise DomainError(422, 'invalid_name', 'Enter a policy name of at least two characters')
        changes = {'name': name, 'name_normalized': name.casefold(),
                   'description': payload.description.strip(), 'selected_entry_ids': selected,
                   'entries': source['entries'], 'entry_count': source['entry_count'],
                   'source_sha256': source['source_sha256'], 'catalog_id': source['_id'],
                   'rules': [{**old['rules'][0], 'config': {'kind': old['category'],
                                                             'selected_entry_ids': selected}}],
                   'updated_at': now(), 'updated_by': object_id(user.id)}
        try:
            result = db.policies.update_one({'_id': old['_id'], 'company_id': user_company(user),
                'version': payload.version}, {'$set': changes, '$inc': {'version': 1}}, session=session)
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A policy with this name already exists') from exc
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = owned(db, user, policy_id, session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy_set.updated', 'policy', old['_id'], request_id,
              before={'selected_count': len(old['selected_entry_ids'])},
              after={'name': name, 'selected_count': len(selected)})
        return updated
    return transaction(user, operation)


def assign(user, policy_id, payload, request_id):
    def operation(db, session):
        old = owned(db, user, policy_id, session)
        version_check(old, payload.version)
        if old['status'] == 'archived':
            raise DomainError(409, 'archived_policy', 'Archived policies cannot be assigned')
        ids = validate_groups(db, user, payload.group_ids, session)
        result = db.policies.update_one({'_id': old['_id'], 'company_id': user_company(user),
            'version': payload.version}, {'$set': {'scope.group_ids': ids,
                'updated_at': now(), 'updated_by': object_id(user.id)}, '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = owned(db, user, policy_id, session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy_set.groups_updated', 'policy', old['_id'], request_id,
              before={'group_ids': old['scope']['group_ids']}, after={'group_ids': ids})
        return updated
    return transaction(user, operation)


def set_status(user, policy_id, payload, request_id):
    def operation(db, session):
        old = owned(db, user, policy_id, session)
        version_check(old, payload.version)
        if old['status'] == 'archived':
            raise DomainError(409, 'archived_policy', 'Archived policies cannot be changed')
        groups = old['scope']['group_ids'] if payload.status != 'archived' else []
        result = db.policies.update_one({'_id': old['_id'], 'company_id': user_company(user),
            'version': payload.version}, {'$set': {'status': payload.status,
                'scope.group_ids': groups, 'updated_at': now(), 'updated_by': object_id(user.id)},
                '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = owned(db, user, policy_id, session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy_set.status_changed', 'policy', old['_id'], request_id,
              before={'status': old['status']}, after={'status': payload.status})
        return updated
    return transaction(user, operation)
