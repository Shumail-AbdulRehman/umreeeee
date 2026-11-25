from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import OperationFailure

from app.api.routes.administration import CompanyStatus
from app.core.errors import DomainError
from app.services import platform_audit_service as module
from app.services.platform_audit_service import (
    EVENT_LABELS, STATUS_ACTION, PlatformAuditService, audit_event_read, audit_pipeline,
)


NOW = datetime(2026, 11, 25, 12, tzinfo=timezone.utc)


def actor(role='super_admin'):
    return SimpleNamespace(id=str(ObjectId()), role=role,
                           company=SimpleNamespace(id=str(ObjectId())))


def matches(row, query):
    for field, value in query.items():
        if field == '$or':
            if not any(matches(row, alternative) for alternative in value):
                return False
        elif isinstance(value, dict) and '$exists' in value:
            if (field in row) != value['$exists']:
                return False
        elif row.get(field) != value:
            return False
    return True


class Collection:
    def __init__(self, documents=()):
        self.documents = deepcopy(list(documents))
        self.pipeline = None
        self.aggregate_result = [{'items': [], 'total': []}]
        self.fail_insert = False

    def find_one(self, query, projection=None, **kwargs):
        row = next((row for row in self.documents if matches(row, query)), None)
        if row is None:
            return None
        return deepcopy(row if not projection else {k: v for k, v in row.items()
                                                    if k == '_id' or projection.get(k)})

    def update_one(self, query, update, **kwargs):
        row = next((row for row in self.documents if matches(row, query)), None)
        if row is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        before = deepcopy(row)
        row.update(update.get('$set', {}))
        for field, value in update.get('$inc', {}).items():
            row[field] = row.get(field, 0) + value
        return SimpleNamespace(matched_count=1, modified_count=int(row != before))

    def insert_many(self, documents, **kwargs):
        if self.fail_insert:
            raise RuntimeError('simulated audit write failure')
        self.documents.extend(deepcopy(documents))

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return deepcopy(self.aggregate_result)


class Transaction:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.companies = deepcopy(self.db.companies.documents)
        self.audit = deepcopy(self.db.audit_events.documents)

    def __exit__(self, error, *_args):
        if error:
            self.db.companies.documents[:] = self.companies
            self.db.audit_events.documents[:] = self.audit


class Session:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def start_transaction(self):
        return Transaction(self.db)


@pytest.fixture
def environment(monkeypatch):
    owner = actor()
    target = ObjectId()
    db = SimpleNamespace(
        companies=Collection([
            {'_id': ObjectId(owner.company.id), 'name': 'Home', 'status': 'active', 'version': 1},
            {'_id': target, 'name': 'Target', 'status': 'active', 'version': 1},
        ]), audit_events=Collection(),
    )
    db.client = SimpleNamespace(start_session=lambda: Session(db))
    monkeypatch.setattr(module, 'utcnow', lambda: NOW)
    return PlatformAuditService(db), db, owner, str(target)


@pytest.mark.parametrize('role', ['user', 'org_admin'])
def test_all_public_methods_deny_non_platform_roles_before_database_access(role):
    service = PlatformAuditService(None)
    for call in (lambda: service.list(actor(role)),
                 lambda: service.change_status(actor(role), str(ObjectId()), 'suspended', 1, 'Reason', 'req')):
        with pytest.raises(HTTPException) as error:
            call()
        assert error.value.status_code == 403


def test_access_change_updates_version_and_audits_both_companies_with_reason(environment):
    service, db, owner, target = environment
    result = service.change_status(owner, target, 'suspended', 1, '  Requested by customer  ', 'req-1')
    assert result['organization'] == {'id': target, 'name': 'Target', 'status': 'suspended', 'version': 2}
    assert db.companies.find_one({'_id': ObjectId(target)})['status'] == 'suspended'
    assert len(db.audit_events.documents) == 2
    assert {row['company_id'] for row in db.audit_events.documents} == {ObjectId(owner.company.id), ObjectId(target)}
    for row in db.audit_events.documents:
        assert row['resource_id'] == ObjectId(target)
        assert row['after'] == {'status': 'suspended', 'reason': 'Requested by customer'}
        assert row['before'] == {'status': 'active'}
        assert row['actor_user_id'] == ObjectId(owner.id)
        assert row['request_id'] == 'req-1'
        assert row['created_at'] == NOW


def test_own_company_and_stale_changes_are_rejected(environment):
    service, db, owner, target = environment
    for company, version, expected in [(owner.company.id, 1, 'own_company'), (target, 2, 'stale_version')]:
        with pytest.raises(DomainError) as error:
            service.change_status(owner, company, 'suspended', version, 'Reason', 'req')
        assert error.value.code == expected
    assert not db.audit_events.documents
    assert db.companies.find_one({'_id': ObjectId(target)})['status'] == 'active'


def test_same_status_is_a_noop_and_legacy_calls_accept_no_reason(environment):
    service, db, owner, target = environment
    result = service.change_status(owner, target, 'active', 1, 'Unchanged', 'req')
    assert result['organization']['version'] == 1
    assert not db.audit_events.documents
    result = service.change_status(owner, target, 'suspended', 1, None, 'legacy')
    assert result['organization']['version'] == 2
    assert all('reason' not in row['after'] for row in db.audit_events.documents)


def test_historical_missing_status_and_version_follow_active_version_one(environment):
    service, db, owner, target = environment
    record = db.companies.documents[-1]
    record.pop('version')
    record.pop('status')
    result = service.change_status(owner, target, 'suspended', 1, 'Legacy tenant', 'req')
    assert result['organization']['version'] == 2
    assert record['version'] == 2
    assert db.audit_events.documents[0]['before']['status'] == 'active'


def test_audit_failure_rolls_back_access_and_version(environment):
    service, db, owner, target = environment
    db.audit_events.fail_insert = True
    with pytest.raises(RuntimeError, match='audit write failure'):
        service.change_status(owner, target, 'suspended', 1, 'Reason', 'req')
    company = db.companies.find_one({'_id': ObjectId(target)})
    assert company['status'] == 'active' and company['version'] == 1
    assert not db.audit_events.documents


def test_unavailable_home_company_and_missing_target_are_rejected(environment):
    service, db, owner, _target = environment
    with pytest.raises(DomainError) as missing:
        service.change_status(owner, str(ObjectId()), 'suspended', 1, 'Reason', 'req')
    assert missing.value.code == 'not_found'
    db.companies.documents[0]['status'] = 'suspended'
    with pytest.raises(DomainError) as unavailable:
        service.change_status(owner, str(ObjectId()), 'suspended', 1, 'Reason', 'req')
    assert unavailable.value.code == 'organization_unavailable'
    assert not db.audit_events.documents


def test_transient_transaction_conflict_retries_without_duplicate_audit(environment, monkeypatch):
    service, db, owner, target = environment
    original = db.companies.update_one
    attempts, delays = [], []

    def conflict_once(query, update, **kwargs):
        attempts.append(query)
        if len(attempts) == 1:
            raise OperationFailure('write conflict', 112, {'errorLabels': ['TransientTransactionError']})
        return original(query, update, **kwargs)

    monkeypatch.setattr(db.companies, 'update_one', conflict_once)
    monkeypatch.setattr(module, 'sleep', delays.append)
    result = service.change_status(owner, target, 'suspended', 1, 'Reason', 'req')
    assert result['organization']['version'] == 2
    assert delays == [.02]
    assert len(db.audit_events.documents) == 2


@pytest.mark.parametrize('reason', ['', '  ', 'x' * 181, 42])
def test_optional_legacy_reason_is_validated_when_present(environment, reason):
    service, db, owner, target = environment
    with pytest.raises(DomainError) as error:
        service.change_status(owner, target, 'suspended', 1, reason, 'req')
    assert error.value.code == 'invalid_reason'
    assert not db.audit_events.documents


def test_legacy_request_schema_trims_reason_and_preserves_old_payloads():
    assert CompanyStatus(status='active', version=1).reason is None
    assert CompanyStatus(status='active', version=1, reason=' done ').reason == 'done'
    with pytest.raises(ValidationError):
        CompanyStatus(status='active', version=1, reason='  ')


def test_audit_pipeline_attributes_target_deduplicates_before_stable_pagination():
    target = ObjectId()
    pipeline = audit_pipeline(company_id=target, page=3, page_size=8)
    assert pipeline[0]['$match']['action']['$in'] == list(EVENT_LABELS)
    assert pipeline[1]['$project']['target_company_id']['$convert']['input']['$cond'][1] == '$resource_id'
    assert pipeline[2]['$match'] == {'target_company_id': target}
    group_index = next(i for i, stage in enumerate(pipeline) if '$group' in stage)
    facet_index = next(i for i, stage in enumerate(pipeline) if '$facet' in stage)
    assert group_index < facet_index
    assert pipeline[facet_index - 1] == {'$sort': {'created_at': -1, '_id': -1}}
    items = pipeline[facet_index]['$facet']['items']
    assert items[:2] == [{'$skip': 16}, {'$limit': 8}]
    serialized = str(pipeline)
    assert "'email':" not in serialized and '$email' not in serialized
    assert 'password' not in serialized and 'ciphertext' not in serialized
    assert 'before.status' in serialized and 'after.reason' in serialized


def test_timeline_is_a_bounded_allowlist_and_does_not_reveal_tenant_actors(environment):
    service, db, owner, target = environment
    row = {'_id': ObjectId(), 'target_company_id': ObjectId(target), 'company_name': 'Target',
           'action': 'policy_set.updated', 'actor_role': 'org_admin', 'actor_first_name': 'Private',
           'actor_last_name': 'Person', 'email': 'private@example.test', 'created_at': NOW,
           'request_id': 'req', 'reason': 'Secret policy text', 'before': {'prompt': 'secret'},
           'after': {'api_key': 'secret'}}
    db.audit_events.aggregate_result = [{'items': [row], 'total': [{'count': 13}]}]
    result = service.list(owner, company_id=target, days=7, page=2, page_size=5)
    assert result['total'] == 13 and result['page'] == 2 and result['page_size'] == 5
    item = result['items'][0]
    assert item['actor_name'] == 'Organization admin'
    assert item['reason'] is None
    assert set(item) == {'id', 'company_id', 'company_name', 'action', 'event', 'actor_name',
                         'created_at', 'request_id', 'reason'}
    assert 'Private' not in str(item) and 'secret' not in str(item).lower()
    assert db.audit_events.pipeline[0]['$match']['created_at']['$gte'] == NOW.replace(
        hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    assert db.audit_events.pipeline[0]['$match']['created_at']['$lte'] == NOW


@pytest.mark.parametrize('days', [None, 7, 30])
def test_audit_list_caps_every_window_at_captured_now_including_all_dates(environment, days):
    service, db, owner, _target = environment
    service.list(owner, days=days)
    bounds = db.audit_events.pipeline[0]['$match']['created_at']
    assert bounds['$lte'] == NOW
    if days is None:
        assert bounds == {'$lte': NOW}
    else:
        assert bounds == {'$gte': NOW.replace(hour=0, minute=0, second=0, microsecond=0)
                          - timedelta(days=days - 1), '$lte': NOW}


def test_audit_pipeline_uses_inclusive_recorded_event_bounds():
    start = NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    match = audit_pipeline(start=start, end=NOW)[0]['$match']['created_at']
    assert match == {'$gte': start, '$lte': NOW}


def test_platform_actor_and_reason_are_the_only_named_freeform_event_fields():
    row = {'_id': ObjectId(), 'target_company_id': ObjectId(), 'action': STATUS_ACTION,
           'actor_first_name': 'Platform', 'actor_last_name': 'Owner', 'to_status': 'suspended',
           'created_at': NOW, 'reason': 'Customer requested pause'}
    event = audit_event_read(row)
    assert event['event'] == 'Company suspended'
    assert event['actor_name'] == 'Platform Owner'
    assert event['reason'] == 'Customer requested pause'
    row['to_status'] = 'active'
    assert audit_event_read(row)['event'] == 'Company reactivated'


@pytest.mark.parametrize('status,label', [
    ('open', 'Violation reopened'), ('reviewed', 'Violation reviewed'),
    ('resolved', 'Violation resolved'), (None, 'Violation status changed'),
])
def test_violation_event_label_uses_actual_recorded_status_without_changing_action(status, label):
    row = {'_id': ObjectId(), 'target_company_id': ObjectId(), 'action': 'violation.resolved',
           'actor_role': 'org_admin', 'created_at': NOW}
    if status is not None:
        row['to_status'] = status
    event = audit_event_read(row)
    assert event['action'] == 'violation.resolved'
    assert event['event'] == label
    assert event['actor_name'] == 'Organization admin' and event['reason'] is None


def test_invalid_filters_and_unknown_company_fail_explicitly(environment):
    service, _db, owner, _target = environment
    for options, code in [({'company_id': 'bad'}, 'invalid_id'),
                          ({'company_id': str(ObjectId())}, 'not_found'),
                          ({'days': 90}, 'invalid_window'), ({'days': True}, 'invalid_window'),
                          ({'page': 0}, 'invalid_page'), ({'page_size': 101}, 'invalid_page'),
                          ({'event_type': 'auth.password_reset'}, 'invalid_event_type')]:
        with pytest.raises(DomainError) as error:
            service.list(owner, **options)
        assert error.value.code == code


def test_empty_history_is_a_real_zero(environment):
    service, _db, owner, _target = environment
    assert service.list(owner) == {'items': [], 'total': 0, 'page': 1, 'page_size': 20}
