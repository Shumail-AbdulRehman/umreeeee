"""Tenant-scoped Phase 1 administration resources."""

from datetime import datetime, timezone
from typing import Annotated, Literal, Union
from uuid import uuid4

import regex
from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

from app.api.dependencies.auth import get_current_user
from app.core.errors import DomainError, object_id
from app.core.permissions import require_admin, require_super_admin
from app.db.mongo import get_database
from app.models.user import User
from app.services.admin_common import transaction as admin_transaction
from app.validators.registry import registry
from app.services.enforcement_service import evaluate_stage, decision
from app.services.content_service import shorten_retention
from app.services.remote_detection import catalog_ready
from app.services.policy_catalog import selected_for_group

router = APIRouter(prefix='/api', tags=['administration'])


def utcnow():
    return datetime.now(timezone.utc)


def company_id(user: User):
    return object_id(user.company.id)


def clean_name(value: str):
    return ' '.join(value.split())


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


def page_result(collection, query, page, page_size, *, projection=None):
    total = collection.count_documents(query)
    cursor = collection.find(query, projection).sort([('created_at', DESCENDING), ('_id', DESCENDING)])
    items = [serialize(item) for item in cursor.skip((page - 1) * page_size).limit(page_size)]
    return {'items': items, 'page': page, 'page_size': page_size, 'total': total}


def audit(db, session, user, action, resource_type, resource_id, request_id, before=None, after=None):
    db.audit_events.insert_one({
        'company_id': company_id(user), 'actor_user_id': object_id(user.id),
        'action': action, 'resource_type': resource_type, 'resource_id': resource_id,
        'before': before or {}, 'after': after or {}, 'request_id': request_id,
        'created_at': utcnow(),
    }, session=session)


def transaction(user, operation):
    return admin_transaction(user, operation)


def find_tenant(collection, user, resource_id, session=None):
    item = collection.find_one({'_id': object_id(resource_id), 'company_id': company_id(user)}, session=session)
    if not item:
        raise DomainError(404, 'not_found', 'Resource not found')
    return item


def check_version(item, version):
    if item.get('version', 1) != version:
        raise DomainError(409, 'stale_version', 'Resource changed. Refresh and try again.')


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class GroupInput(StrictModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default='', max_length=1000)

    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        value = clean_name(value)
        if len(value) < 2:
            raise ValueError('Name must contain at least two non-space characters')
        return value


class GroupUpdate(GroupInput):
    version: int = Field(ge=1)


class GroupStatus(StrictModel):
    status: Literal['active', 'archived']
    version: int = Field(ge=1)


@router.get('/groups/mine')
def my_groups(user: User = Depends(get_current_user)):
    ids = [object_id(value) for value in user.group_ids]
    groups = get_database().groups.find({'_id': {'$in': ids}, 'company_id': company_id(user), 'status': 'active'})
    return {'items': [serialize(group) for group in groups]}


@router.get('/groups')
def list_groups(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                q: str = '', status: str | None = None, user: User = Depends(get_current_user)):
    require_admin(user)
    query = {'company_id': company_id(user)}
    if q:
        query['name_normalized'] = {'$regex': regex.escape(q.casefold())}
    if status:
        query['status'] = status
    result = page_result(get_database().groups, query, page, page_size)
    for item in result['items']:
        item['member_count'] = get_database().users.count_documents({
            'company_id': company_id(user), 'group_ids': object_id(item['_id'])})
        item['policy_count'] = get_database().policies.count_documents({
            'company_id': company_id(user), 'scope.group_ids': object_id(item['_id']),
            'status': {'$ne': 'archived'}})
    return result


@router.post('/groups', status_code=201)
def create_group(payload: GroupInput, request: Request, user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        now = utcnow()
        item = {'company_id': company_id(user), 'name': payload.name,
                'name_normalized': payload.name.casefold(), 'description': payload.description.strip(),
                'status': 'active', 'version': 1, 'created_at': now, 'updated_at': now}
        try:
            result = db.groups.insert_one(item, session=session)
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A group with this name already exists') from exc
        item['_id'] = result.inserted_id
        audit(db, session, user, 'group.created', 'group', result.inserted_id, request.state.request_id,
              after={'name': item['name'], 'status': 'active'})
        return {'group': serialize(item), 'message': 'Group created'}

    return transaction(user, operation)


@router.get('/groups/{group_id}')
def get_group(group_id: str, user: User = Depends(get_current_user)):
    require_admin(user)
    db = get_database()
    item = serialize(find_tenant(db.groups, user, group_id))
    item['member_count'] = db.users.count_documents({'company_id': company_id(user),
                                                     'group_ids': object_id(group_id)})
    item['policy_count'] = db.policies.count_documents({'company_id': company_id(user),
        'scope.group_ids': object_id(group_id), 'status': {'$ne': 'archived'}})
    return {'group': item}


@router.put('/groups/{group_id}')
def edit_group(group_id: str, payload: GroupUpdate, request: Request,
               user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.groups, user, group_id, session)
        check_version(old, payload.version)
        changes = {'name': payload.name, 'name_normalized': payload.name.casefold(),
                   'description': payload.description.strip(), 'updated_at': utcnow()}
        try:
            result = db.groups.update_one({'_id': old['_id'], 'company_id': company_id(user), 'version': payload.version},
                                          {'$set': changes, '$inc': {'version': 1}}, session=session)
            if result.modified_count != 1:
                raise DomainError(409, 'stale_version', 'Group changed. Refresh and try again.')
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A group with this name already exists') from exc
        audit(db, session, user, 'group.updated', 'group', old['_id'], request.state.request_id,
              before={'name': old['name']}, after={'name': payload.name})
        return {'group': serialize(db.groups.find_one({'_id': old['_id']}, session=session)),
                'message': 'Group updated'}

    return transaction(user, operation)


@router.patch('/groups/{group_id}/status')
def group_status(group_id: str, payload: GroupStatus, request: Request,
                 user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.groups, user, group_id, session)
        check_version(old, payload.version)
        if payload.status == 'archived':
            members = db.users.count_documents({'company_id': company_id(user), 'group_ids': old['_id']}, session=session)
            policies = db.policies.count_documents({'company_id': company_id(user),
                'scope.group_ids': old['_id'], 'status': {'$ne': 'archived'}}, session=session)
            if members or policies:
                raise DomainError(409, 'group_in_use',
                    f'Group has {members} member(s) and {policies} policy reference(s). Resolve them before archiving.')
        result = db.groups.update_one({'_id': old['_id'], 'company_id': company_id(user), 'version': payload.version},
                                      {'$set': {'status': payload.status, 'updated_at': utcnow()}, '$inc': {'version': 1}},
                                      session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Group changed. Refresh and try again.')
        audit(db, session, user, 'group.status_changed', 'group', old['_id'], request.state.request_id,
              before={'status': old['status']}, after={'status': payload.status})
        return {'group': serialize(db.groups.find_one({'_id': old['_id']}, session=session)),
                'message': 'Group status updated'}

    return transaction(user, operation)


class KeywordConfig(StrictModel):
    terms: list[str] = Field(min_length=1, max_length=50)
    case_sensitive: bool = False
    match_mode: Literal['substring', 'whole_word'] = 'substring'

    @field_validator('terms')
    @classmethod
    def valid_terms(cls, values):
        if any(not value.strip() or len(value) > 100 for value in values):
            raise ValueError('Terms must be nonblank and at most 100 characters')
        return values


class RegexConfig(StrictModel):
    pattern: str = Field(min_length=1, max_length=500)
    ignore_case: bool = False

    @field_validator('pattern')
    @classmethod
    def valid_pattern(cls, value):
        try:
            regex.compile(value)
        except regex.error as exc:
            raise ValueError('Invalid regular expression') from exc
        return value


class PiiConfig(StrictModel):
    entities: list[Literal['EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD']] = Field(min_length=1)
    threshold: float = Field(default=0.8, ge=0, le=1)


class ThresholdConfig(StrictModel):
    threshold: float = Field(default=0.8, ge=0, le=1)


class KeywordRule(StrictModel):
    rule_id: str | None = None
    type: Literal['keyword']
    config: KeywordConfig


class RegexRule(StrictModel):
    rule_id: str | None = None
    type: Literal['regex']
    config: RegexConfig


class PiiRule(StrictModel):
    rule_id: str | None = None
    type: Literal['pii']
    config: PiiConfig


class InjectionRule(StrictModel):
    rule_id: str | None = None
    type: Literal['prompt_injection']
    config: ThresholdConfig


class ToxicityRule(StrictModel):
    rule_id: str | None = None
    type: Literal['toxicity']
    config: ThresholdConfig


Rule = Annotated[Union[KeywordRule, RegexRule, PiiRule, InjectionRule, ToxicityRule], Field(discriminator='type')]


class PolicyScope(StrictModel):
    group_ids: list[str] = Field(default_factory=list, max_length=50)
    integration_ids: list[str] = Field(default_factory=list, max_length=50)


class PolicyInput(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default='', max_length=2000)
    category: Literal['pii', 'prompt_injection', 'toxicity', 'restricted_content', 'custom']
    action: Literal['BLOCK', 'LOG', 'ALERT']
    severity: Literal['low', 'medium', 'high', 'critical']
    status: Literal['draft', 'active', 'disabled'] = 'draft'
    stages: list[Literal['input', 'output']] = Field(default_factory=lambda: ['input'], min_length=1, max_length=2)
    scope: PolicyScope = Field(default_factory=PolicyScope)
    match: Literal['any'] = 'any'
    rules: list[Rule] = Field(min_length=1, max_length=10)


class PolicyUpdate(PolicyInput):
    version: int = Field(ge=1)


class PolicyStatus(StrictModel):
    status: Literal['draft', 'active', 'disabled', 'archived']
    version: int = Field(ge=1)


def policy_data(payload, db, user, session, old=None):
    data = payload.model_dump(exclude={'version'})
    data['name'] = clean_name(data['name'])
    if len(data['name']) < 2:
        raise DomainError(422, 'validation_error', 'Policy name is too short')
    data['name_normalized'] = data['name'].casefold()
    data['stages'] = list(dict.fromkeys(data['stages']))
    if data['status'] == 'active':
        ensure_rules_ready(data['rules'])
    previous_ids = {item['rule_id'] for item in old.get('rules', [])} if old else set()
    used = set()
    for rule in data['rules']:
        if rule.get('rule_id'):
            if rule['rule_id'] not in previous_ids or rule['rule_id'] in used:
                raise DomainError(422, 'invalid_rule_id', 'Unknown or duplicate rule ID')
        else:
            rule['rule_id'] = str(uuid4())
        used.add(rule['rule_id'])
    for field, collection in [('group_ids', db.groups), ('integration_ids', db.integrations)]:
        ids = data['scope'][field]
        if len(ids) != len(set(ids)):
            raise DomainError(422, 'invalid_scope', 'Duplicate scope ID', {f'scope.{field}': ['Duplicate ID']})
        object_ids = [object_id(item) for item in ids]
        count = collection.count_documents({'_id': {'$in': object_ids}, 'company_id': company_id(user),
                                            'status': 'active'}, session=session)
        if count != len(ids):
            raise DomainError(422, 'invalid_scope', 'Select active resources in your organization',
                              {f'scope.{field}': ['Invalid or unavailable resource']})
        data['scope'][field] = object_ids
    return data


def ensure_rules_ready(rules):
    capabilities = registry.capabilities()
    missing = sorted({rule['type'] for rule in rules if not capabilities[rule['type']]['ready']})
    if missing:
        raise DomainError(409, 'validator_unavailable', 'Local validator unavailable: ' + ', '.join(missing))


def snapshot(db, session, item):
    db.policy_versions.insert_one({'company_id': item['company_id'], 'policy_id': item['_id'],
                                   'version': item['version'], 'snapshot': dict(item),
                                   'created_at': utcnow()}, session=session)


@router.get('/policies/capabilities')
def policy_capabilities(user: User = Depends(get_current_user)):
    require_admin(user)
    capabilities = registry.capabilities()
    required = get_database().policies.distinct('rules.type', {'company_id': company_id(user), 'status': 'active'})
    missing = [kind for kind in required if not capabilities.get(kind, {}).get('ready')]
    catalogs = get_database().policies.find({'company_id': company_id(user), 'status': 'active', 'managed_catalog': True})
    if any(not catalog_ready(policy) for policy in catalogs) and 'catalog' not in missing:
        missing.append('catalog')
    return {'enforcement_ready': not missing,
            'reason': 'Unavailable active validators: ' + ', '.join(sorted(missing)) if missing else None,
            'validators': capabilities,
            'remote_detection_enabled': capabilities.get('catalog', {}).get('configured', False),
            'limits': {'max_policies': 50, 'max_rules': 500}}


@router.get('/policies')
def list_policies(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  q: str = '', status: str | None = None, category: str | None = None,
                  group_id: str | None = None, integration_id: str | None = None,
                  user: User = Depends(get_current_user)):
    require_admin(user)
    query = {'company_id': company_id(user), 'managed_catalog': True,
             'category': {'$in': ['dlp', 'guardrail']}}
    if q:
        query['name_normalized'] = {'$regex': regex.escape(q.casefold())}
    if status:
        query['status'] = status
    if category:
        if category not in {'dlp', 'guardrail'}:
            return {'items': [], 'page': page, 'page_size': page_size, 'total': 0}
        query['category'] = category
    if group_id:
        query['scope.group_ids'] = object_id(group_id)
    if integration_id:
        query['scope.integration_ids'] = object_id(integration_id)
    return page_result(get_database().policies, query, page, page_size)


def create_policy(payload: PolicyInput, request: Request, user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        now = utcnow()
        data = policy_data(payload, db, user, session)
        data.update(company_id=company_id(user), version=1, created_at=now, updated_at=now,
                    created_by=object_id(user.id), updated_by=object_id(user.id))
        try:
            result = db.policies.insert_one(data, session=session)
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A policy with this name already exists') from exc
        data['_id'] = result.inserted_id
        snapshot(db, session, data)
        audit(db, session, user, 'policy.created', 'policy', data['_id'], request.state.request_id,
              after={'name': data['name'], 'status': data['status'], 'version': 1})
        return {'policy': serialize(data), 'message': 'Policy created'}

    return transaction(user, operation)


@router.post('/policies')
@router.put('/policies/{policy_id}')
@router.patch('/policies/{policy_id}/status')
def reject_custom_policy(user: User = Depends(get_current_user)):
    require_admin(user)
    raise DomainError(409, 'managed_policies_only',
                      'Only the imported DLP and Guardrail policies are supported. Edit their group assignments instead.')


class PolicyAssignments(StrictModel):
    version: int = Field(ge=1)
    group_ids: list[str] = Field(max_length=500)
    selected_entry_ids: list[str] | None = Field(default=None, max_length=10000)


@router.put('/policies/{policy_id}/groups')
def assign_policy_groups(policy_id: str, payload: PolicyAssignments, request: Request,
                         user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.policies, user, policy_id, session)
        if not old.get('managed_catalog') or old.get('category') not in {'dlp', 'guardrail'}:
            raise DomainError(409, 'managed_policies_only', 'Only DLP and Guardrail policies can be assigned')
        check_version(old, payload.version)
        available = [entry.get('pattern_id') or entry.get('id') for entry in old['entries']]
        previous = old.get('selected_entry_ids', available)
        selected = payload.selected_entry_ids if payload.selected_entry_ids is not None else previous
        selected_set = set(selected)
        if len(selected) != len(selected_set) or not selected_set.issubset(available):
            raise DomainError(422, 'invalid_selection', 'Select unique entries from this policy catalog')
        if payload.group_ids and not selected:
            raise DomainError(422, 'empty_selection', 'Select at least one entry before assigning groups')
        selected = [entry_id for entry_id in available if entry_id in selected_set]
        ids = [object_id(value) for value in payload.group_ids]
        if len(set(ids)) != len(ids):
            raise DomainError(422, 'invalid_scope', 'Duplicate group ID')
        count = db.groups.count_documents({'_id': {'$in': ids}, 'company_id': company_id(user),
                                           'status': 'active'}, session=session)
        if count != len(ids):
            raise DomainError(422, 'invalid_scope', 'Select active groups in your organization')
        group_selections = [{'group_id': group_id, 'selected_entry_ids':
            selected if payload.selected_entry_ids is not None else selected_for_group(old, group_id)}
            for group_id in ids]
        result = db.policies.update_one({'_id': old['_id'], 'version': payload.version},
            {'$set': {'scope': {'group_ids': ids, 'integration_ids': []}, 'updated_at': utcnow(),
                      'selected_entry_ids': selected,
                      'group_entry_selections': group_selections,
                      'rules': [{'rule_id': f"catalog-{old['category']}", 'type': 'catalog',
                                 'config': {'kind': old['category'], 'selected_entry_ids': selected}}],
                      'updated_by': object_id(user.id)}, '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = db.policies.find_one({'_id': old['_id']}, session=session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy.groups_updated', 'policy', old['_id'], request.state.request_id,
              before={'group_ids': old['scope']['group_ids'], 'selected_entry_ids': previous},
              after={'group_ids': ids, 'selected_entry_ids': selected})
        return {'policy': serialize(updated), 'message': 'Policy selection and group assignments saved'}

    return transaction(user, operation)


class GroupCheckSelection(StrictModel):
    version: int = Field(ge=1)
    group_ids: list[str] = Field(min_length=1, max_length=500)
    selected_entry_ids: list[str] = Field(max_length=10000)


@router.put('/policies/{policy_id}/group-selections')
def select_group_checks(policy_id: str, payload: GroupCheckSelection, request: Request,
                        user: User = Depends(get_current_user)):
    """Replace checks for the named groups only. Empty checks remove their assignments."""
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.policies, user, policy_id, session)
        if not old.get('managed_catalog') or old.get('category') not in {'dlp', 'guardrail'}:
            raise DomainError(409, 'managed_policies_only', 'Choose a DLP or Guardrail policy')
        check_version(old, payload.version)
        available = [entry.get('pattern_id') or entry.get('id') for entry in old['entries']]
        selected = set(payload.selected_entry_ids)
        if len(selected) != len(payload.selected_entry_ids) or not selected.issubset(available):
            raise DomainError(422, 'invalid_selection', 'Select unique checks from this policy catalog')
        ids = [object_id(value) for value in payload.group_ids]
        if len(set(ids)) != len(ids):
            raise DomainError(422, 'invalid_scope', 'Duplicate group ID')
        query = {'_id': {'$in': ids}, 'company_id': company_id(user)}
        if selected:
            query['status'] = 'active'
        if db.groups.count_documents(query, session=session) != len(ids):
            raise DomainError(422, 'invalid_scope', 'Select available groups in your organization')
        ordered = [entry_id for entry_id in available if entry_id in selected]
        assignments = {group_id: selected_for_group(old, group_id)
                       for group_id in old['scope']['group_ids']}
        before = [{'group_id': group_id, 'selected_entry_ids': assignments.get(group_id, [])}
                  for group_id in ids]
        for group_id in ids:
            if ordered:
                assignments[group_id] = ordered
            else:
                assignments.pop(group_id, None)
        if len(assignments) > 500:
            raise DomainError(422, 'invalid_scope', 'A policy supports up to 500 assigned groups')
        changes = {'scope': {**old['scope'], 'group_ids': list(assignments)},
                   'group_entry_selections': [{'group_id': group_id, 'selected_entry_ids': checks}
                                              for group_id, checks in assignments.items()],
                   'updated_at': utcnow(), 'updated_by': object_id(user.id)}
        result = db.policies.update_one({'_id': old['_id'], 'company_id': company_id(user),
            'version': payload.version}, {'$set': changes, '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = db.policies.find_one({'_id': old['_id']}, session=session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy.group_checks_updated', 'policy', old['_id'],
              request.state.request_id, before={'assignments': before},
              after={'group_ids': ids, 'selected_entry_ids': ordered})
        return {'policy': serialize(updated), 'message': 'Group policy checks saved'}

    return transaction(user, operation)


@router.get('/policies/{policy_id}')
def get_policy(policy_id: str, user: User = Depends(get_current_user)):
    require_admin(user)
    return {'policy': serialize(find_tenant(get_database().policies, user, policy_id))}


def edit_policy(policy_id: str, payload: PolicyUpdate, request: Request,
                user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.policies, user, policy_id, session)
        check_version(old, payload.version)
        if old['status'] == 'archived':
            raise DomainError(409, 'archived_policy', 'Restore archived policy to draft first')
        data = policy_data(payload, db, user, session, old)
        data.update(updated_at=utcnow(), updated_by=object_id(user.id), version=payload.version + 1)
        try:
            result = db.policies.update_one({'_id': old['_id'], 'company_id': company_id(user), 'version': payload.version},
                                            {'$set': data}, session=session)
            if result.modified_count != 1:
                raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        except DuplicateKeyError as exc:
            raise DomainError(409, 'duplicate_name', 'A policy with this name already exists') from exc
        updated = db.policies.find_one({'_id': old['_id']}, session=session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy.updated', 'policy', old['_id'], request.state.request_id,
              before={'version': payload.version}, after={'version': data['version'], 'status': data['status']})
        return {'policy': serialize(updated), 'message': 'Policy updated'}

    return transaction(user, operation)


def policy_status(policy_id: str, payload: PolicyStatus, request: Request,
                  user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = find_tenant(db.policies, user, policy_id, session)
        check_version(old, payload.version)
        if old['status'] == 'archived' and payload.status != 'draft':
            raise DomainError(409, 'archived_policy', 'Restore to draft before activation')
        if old['status'] == 'archived' and payload.status == 'draft':
            for field, collection in [('group_ids', db.groups), ('integration_ids', db.integrations)]:
                ids = old.get('scope', {}).get(field, [])
                active = collection.count_documents({'_id': {'$in': ids}, 'company_id': company_id(user),
                                                     'status': 'active'}, session=session)
                if active != len(ids):
                    raise DomainError(409, 'invalid_scope', 'Restore scoped groups and integrations before this policy')
        if payload.status == 'active':
            ensure_rules_ready(old['rules'])
        result = db.policies.update_one({'_id': old['_id'], 'company_id': company_id(user), 'version': payload.version},
                                        {'$set': {'status': payload.status, 'updated_at': utcnow(),
                                                  'updated_by': object_id(user.id)}, '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Policy changed. Refresh and try again.')
        updated = db.policies.find_one({'_id': old['_id']}, session=session)
        snapshot(db, session, updated)
        audit(db, session, user, 'policy.status_changed', 'policy', old['_id'], request.state.request_id,
              before={'status': old['status']}, after={'status': payload.status})
        return {'policy': serialize(updated), 'message': 'Policy status updated'}

    return transaction(user, operation)


@router.get('/policies/{policy_id}/versions')
def policy_versions(policy_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                    user: User = Depends(get_current_user)):
    require_admin(user)
    find_tenant(get_database().policies, user, policy_id)
    return page_result(get_database().policy_versions,
                       {'company_id': company_id(user), 'policy_id': object_id(policy_id)}, page, page_size)


class PolicySample(StrictModel):
    text: str = Field(min_length=1, max_length=24000)
    stage: Literal['input', 'output'] = 'input'


@router.post('/policies/{policy_id}/test')
def test_policy(policy_id: str, payload: PolicySample, user: User = Depends(get_current_user)):
    require_admin(user)
    policy = find_tenant(get_database().policies, user, policy_id)
    evaluation, matched = evaluate_stage([policy], payload.stage, {'sample': payload.text})
    return {'evaluation': serialize(evaluation), 'decision': decision(evaluation, matched, payload.stage),
            'preview_only': True}


class SettingsUpdate(StrictModel):
    version: int = Field(ge=1)
    name: str = Field(min_length=2, max_length=160)
    content_retention_days: int = Field(default=7, ge=1, le=30)
    require_active_policy: bool = True


@router.get('/settings')
def get_settings(user: User = Depends(get_current_user)):
    require_admin(user)
    item = get_database().companies.find_one({'_id': company_id(user)})
    return {'settings': {'name': item['name'], 'slug': item['slug'], 'status': item.get('status', 'active'),
             'version': item.get('version', 1), 'content_retention_days': item.get('settings', {}).get('content_retention_days', 7),
             'require_active_policy': item.get('settings', {}).get('require_active_policy', True)}}


@router.put('/settings')
def update_settings(payload: SettingsUpdate, request: Request, user: User = Depends(get_current_user)):
    require_admin(user)

    def operation(db, session):
        old = db.companies.find_one({'_id': company_id(user)}, session=session)
        check_version(old, payload.version)
        name = clean_name(payload.name)
        if len(name) < 2:
            raise DomainError(422, 'invalid_name', 'Organization name must contain at least two characters')
        changes = {'name': name, 'settings': {
            'content_retention_days': payload.content_retention_days,
            'require_active_policy': payload.require_active_policy}, 'updated_at': utcnow()}
        result = db.companies.update_one({'_id': company_id(user), 'version': payload.version},
                                         {'$set': changes, '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Settings changed. Refresh and try again.')
        if payload.content_retention_days < old.get('settings', {}).get('content_retention_days', 7):
            shorten_retention(db, company_id(user), payload.content_retention_days, session=session)
        audit(db, session, user, 'settings.updated', 'company', company_id(user), request.state.request_id,
              before={'name': old['name']}, after={'name': changes['name']})
        return {'settings': {'name': changes['name'], 'slug': old['slug'], 'status': old.get('status', 'active'),
                             'version': payload.version + 1, **changes['settings']},
                'message': 'Organization settings updated'}

    return transaction(user, operation)


@router.get('/audit')
def list_audit(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
               action: str | None = None, resource_type: str | None = None,
               from_time: datetime | None = Query(None, alias='from'),
               to_time: datetime | None = Query(None, alias='to'),
               user: User = Depends(get_current_user)):
    require_admin(user)
    query = {'company_id': company_id(user)}
    if action:
        query['action'] = action
    if resource_type:
        query['resource_type'] = resource_type
    if from_time or to_time:
        if any(value.tzinfo is None for value in [from_time, to_time] if value):
            raise DomainError(422, 'invalid_date', 'Date filters must include a timezone')
        if from_time and to_time and from_time >= to_time:
            raise DomainError(422, 'invalid_date', 'The from date must be before the to date')
        query['created_at'] = {}
        if from_time:
            query['created_at']['$gte'] = from_time
        if to_time:
            query['created_at']['$lt'] = to_time
    return page_result(get_database().audit_events, query, page, page_size)


@router.get('/platform/organizations')
def organizations(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  user: User = Depends(get_current_user)):
    require_super_admin(user)
    return page_result(get_database().companies, {}, page, page_size,
                       projection={'name': 1, 'slug': 1, 'status': 1, 'version': 1, 'created_at': 1})


class CompanyStatus(StrictModel):
    status: Literal['active', 'suspended']
    version: int = Field(ge=1)


@router.patch('/platform/organizations/{organization_id}/status')
def organization_status(organization_id: str, payload: CompanyStatus, request: Request,
                        user: User = Depends(get_current_user)):
    require_super_admin(user)
    target = object_id(organization_id)
    if target == company_id(user):
        raise DomainError(403, 'own_company', 'Cannot suspend your own organization')

    def operation(db, session):
        old = db.companies.find_one({'_id': target}, session=session)
        if not old:
            raise DomainError(404, 'not_found', 'Organization not found')
        check_version(old, payload.version)
        result = db.companies.update_one({'_id': target, 'version': payload.version},
                                         {'$set': {'status': payload.status, 'updated_at': utcnow()},
                                          '$inc': {'version': 1}}, session=session)
        if result.modified_count != 1:
            raise DomainError(409, 'stale_version', 'Organization changed. Refresh and try again.')
        audit(db, session, user, 'platform.organization_status_changed', 'company', target,
              request.state.request_id, before={'status': old.get('status', 'active')},
              after={'status': payload.status})
        db.audit_events.insert_one({'company_id': target, 'actor_user_id': object_id(user.id),
            'action': 'platform.organization_status_changed', 'resource_type': 'company',
            'resource_id': target, 'before': {'status': old.get('status', 'active')},
            'after': {'status': payload.status}, 'request_id': request.state.request_id,
            'created_at': utcnow()}, session=session)
        return {'organization': {'id': organization_id, 'name': old['name'], 'status': payload.status,
                                 'version': payload.version + 1}, 'message': 'Organization status updated'}

    return transaction(user, operation)
