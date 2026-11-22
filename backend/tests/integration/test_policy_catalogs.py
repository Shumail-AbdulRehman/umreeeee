from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.api.routes import administration as admin
from app.core.errors import DomainError, install_error_handlers
from app.db.indexes import ensure_indexes
from app.services import admin_common
from app.services.enforcement_service import resolve_policies, evaluate_stage, decision
from app.services.policy_catalog import import_catalogs


@pytest.fixture
def catalogs(test_database, monkeypatch):
    db = test_database
    ensure_indexes(db)
    company, other, group, foreign = [ObjectId() for _ in range(4)]
    db.companies.insert_many([{'_id': company, 'slug': 'a', 'status': 'active'},
                             {'_id': other, 'slug': 'b', 'status': 'active'}])
    db.groups.insert_many([{'_id': group, 'company_id': company, 'status': 'active', 'name_normalized': 'a'},
                           {'_id': foreign, 'company_id': other, 'status': 'active', 'name_normalized': 'b'}])
    source = {kind: {'entries': [{'id': f'example-{i}'} for i in range(5)], 'entry_count': 5, 'source_file': kind + '.txt',
                     'source_sha256': kind} for kind in ('dlp', 'guardrail')}
    with db.client.start_session() as session:
        session.with_transaction(lambda s: import_catalogs(db, source, s))
    monkeypatch.setattr(admin, 'get_database', lambda: db)
    monkeypatch.setattr(admin_common, 'get_database', lambda: db)
    monkeypatch.setattr(admin_common, 'get_mongo_client', lambda: db.client)
    user = SimpleNamespace(id=str(ObjectId()), role='org_admin', company=SimpleNamespace(id=str(company)))
    return db, user, group, foreign, source


def assign(user, policy, groups):
    return admin.assign_policy_groups(str(policy['_id']),
        admin.PolicyAssignments(version=policy['version'], group_ids=[str(g) for g in groups]),
        SimpleNamespace(state=SimpleNamespace(request_id='catalog-test')), user)


def test_one_both_neither_and_fail_closed(catalogs):
    db, user, group, _, _ = catalogs
    cid, integration = ObjectId(user.company.id), ObjectId()
    policies = list(db.policies.find({'company_id': cid}))
    assert len(policies) == 2
    assert resolve_policies(db, cid, integration, [group]) == []
    for index, policy in enumerate(policies):
        assign(user, policy, [group])
        assert len(resolve_policies(db, cid, integration, [group])) == index + 1
    assert resolve_policies(db, cid, integration, []) == []
    resolved = resolve_policies(db, cid, integration, [group])
    evaluation, matched = evaluate_stage(resolved, 'input', {'prompt': 'hello'})
    assert decision(evaluation, matched, 'input') == 'validation_error'
    assert evaluation['errors'] == ['remote_detection_disabled'] * 2
    for policy in db.policies.find({'company_id': cid}):
        assign(user, policy, [])
    assert resolve_policies(db, cid, integration, [group]) == []


def test_assignment_validation_and_versions(catalogs):
    db, user, group, foreign, _ = catalogs
    policy = db.policies.find_one({'company_id': ObjectId(user.company.id)})
    for ids in ([foreign], [group, group], [ObjectId()]):
        with pytest.raises(DomainError) as error:
            assign(user, policy, ids)
        assert error.value.status_code == 422
    assign(user, policy, [group])
    with pytest.raises(DomainError) as error:
        assign(user, policy, [])
    assert error.value.code == 'stale_version'
    assert db.policy_versions.count_documents({'policy_id': policy['_id']}) == 2
    foreign_policy = db.policies.find_one({'company_id': {'$ne': ObjectId(user.company.id)}})
    with pytest.raises(DomainError) as error:
        assign(user, foreign_policy, [group])
    assert error.value.status_code == 404


def test_import_idempotence_and_preserved_history(catalogs):
    db, user, group, _, source = catalogs
    cid = ObjectId(user.company.id)
    policy = db.policies.find_one({'company_id': cid})
    assign(user, policy, [group])
    legacy = db.policies.insert_one({'company_id': cid, 'name_normalized': 'legacy',
                                    'category': 'custom', 'status': 'active', 'version': 1}).inserted_id
    for _ in range(2):
        with db.client.start_session() as session:
            session.with_transaction(lambda s: import_catalogs(db, source, s))
    assert db.policies.count_documents({'company_id': cid, 'managed_catalog': True}) == 2
    assert db.policies.find_one({'_id': policy['_id']})['scope']['group_ids'] == [group]
    assert db.policies.find_one({'_id': legacy})['status'] == 'archived'
    assert db.policy_versions.count_documents({'policy_id': legacy}) == 1


def test_http_custom_policy_writes_rejected(catalogs):
    _, user, _, _, _ = catalogs
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(admin.router)
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        for method, path in [('post', '/api/policies'), ('put', f'/api/policies/{ObjectId()}'),
                             ('patch', f'/api/policies/{ObjectId()}/status')]:
            response = getattr(client, method)(path, json={'category': 'custom'})
            assert response.status_code == 409
            assert response.json()['detail']['code'] == 'managed_policies_only'
        listed = client.get('/api/policies').json()
        assert listed['total'] == 2
        assert {p['category'] for p in listed['items']} == {'dlp', 'guardrail'}
        policy = listed['items'][0]
        response = client.put(f"/api/policies/{policy['_id']}/groups",
                              json={'version': policy['version'], 'group_ids': []})
        assert response.status_code == 200
    user.role = 'user'
    with TestClient(app) as client:
        assert client.post('/api/policies', json={}).status_code == 403
        assert client.put(f"/api/policies/{policy['_id']}/groups",
            json={'version': 2, 'group_ids': []}).status_code == 403


def test_entry_subsets_all_and_invalid_selections(catalogs):
    db, user, group, _, source = catalogs
    policy = db.policies.find_one({'company_id': ObjectId(user.company.id), 'category': 'dlp'})
    def save(ids, groups):
        return admin.assign_policy_groups(str(policy['_id']), admin.PolicyAssignments(
            version=policy['version'], group_ids=[str(g) for g in groups], selected_entry_ids=ids),
            SimpleNamespace(state=SimpleNamespace(request_id='selection-test')), user)
    for invalid in (['unknown'], ['example-0', 'example-0'], []):
        with pytest.raises(DomainError) as error:
            save(invalid, [group])
        assert error.value.status_code == 422
    for count in (1, 2, 3, 4, 5):
        wanted = [f'example-{i}' for i in range(count)]
        save(wanted, [group])
        policy = db.policies.find_one({'_id': policy['_id']})
        assert policy['selected_entry_ids'] == wanted
        assert policy['rules'][0]['config']['selected_entry_ids'] == wanted
        snapshot = db.policy_versions.find_one({'policy_id': policy['_id'], 'version': policy['version']})
        assert snapshot['snapshot']['selected_entry_ids'] == wanted
    save(['example-2'], [group])
    policy = db.policies.find_one({'_id': policy['_id']})
    with db.client.start_session() as session:
        session.with_transaction(lambda s: import_catalogs(db, source, s))
    assert db.policies.find_one({'_id': policy['_id']})['selected_entry_ids'] == ['example-2']
    guardrail = db.policies.find_one({'company_id': ObjectId(user.company.id), 'category': 'guardrail'})
    assert len(guardrail['selected_entry_ids']) == 5
    save([], [])
    assert db.policies.find_one({'_id': policy['_id']})['selected_entry_ids'] == []


@pytest.mark.parametrize('kind', ['dlp', 'guardrail'])
def test_group_specific_checks_are_isolated_combined_and_snapshotted(catalogs, kind):
    from app.services.remote_detection import build_request
    db, user, group, foreign, source = catalogs
    cid, integration, second = ObjectId(user.company.id), ObjectId(), ObjectId()
    db.groups.insert_one({'_id': second, 'company_id': cid, 'status': 'active', 'name_normalized': 'second'})
    policy = db.policies.find_one({'company_id': cid, 'category': kind})
    # Existing groups keep the old shared selection with no migration required.
    assign(user, policy, [group, second])
    policy = db.policies.find_one({'_id': policy['_id']})
    version = policy['version']
    request = SimpleNamespace(state=SimpleNamespace(request_id='group-checks'))
    result = admin.select_group_checks(str(policy['_id']), admin.GroupCheckSelection(
        version=version, group_ids=[str(group)], selected_entry_ids=['example-1', 'example-3']), request, user)
    assert result['policy']['version'] == version + 1
    assert resolve_policies(db, cid, integration, [group])[0]['selected_entry_ids'] == ['example-1', 'example-3']
    assert len(resolve_policies(db, cid, integration, [second])[0]['selected_entry_ids']) == 5
    # Different check sets combine once, without adding another group's checks to a single-group user.
    admin.select_group_checks(str(policy['_id']), admin.GroupCheckSelection(
        version=version + 1, group_ids=[str(second)], selected_entry_ids=['example-2', 'example-3']), request, user)
    resolved = resolve_policies(db, cid, integration, [group, second])
    assert len(resolved) == 1
    assert resolved[0]['selected_entry_ids'] == ['example-1', 'example-2', 'example-3']
    assert resolved[0]['rules'][0]['config']['selected_entry_ids'] == resolved[0]['selected_entry_ids']
    _, outbound = build_request(resolved[0], 'synthetic test')
    sent_ids = outbound['pattern_ids'] if kind == 'dlp' else [p['pluginId'] for p in outbound['plugins']]
    assert sent_ids == ['example-1', 'example-2', 'example-3']
    frozen = db.policy_versions.find_one({'policy_id': policy['_id'], 'version': version + 1})
    assert next(a for a in frozen['snapshot']['group_entry_selections'] if a['group_id'] == group)['selected_entry_ids'] == ['example-1', 'example-3']
    assert len(next(a for a in frozen['snapshot']['group_entry_selections'] if a['group_id'] == second)['selected_entry_ids']) == 5
    # Removing this assignment leaves the second group, other policy, and history intact.
    admin.select_group_checks(str(policy['_id']), admin.GroupCheckSelection(
        version=version + 2, group_ids=[str(group)], selected_entry_ids=[]), request, user)
    assert resolve_policies(db, cid, integration, [group]) == []
    assert resolve_policies(db, cid, integration, [second])[0]['selected_entry_ids'] == ['example-2', 'example-3']
    assert db.policies.find_one({'company_id': cid, 'category': 'guardrail' if kind == 'dlp' else 'dlp'})['scope']['group_ids'] == []
    # Changed catalog imports retain group-specific selections, and refuse to remove selected checks.
    changed = {k: {**v, 'source_sha256': v['source_sha256'] + '-v2'} for k, v in source.items()}
    with db.client.start_session() as session:
        session.with_transaction(lambda s: import_catalogs(db, changed, s))
    assert resolve_policies(db, cid, integration, [second])[0]['selected_entry_ids'] == ['example-2', 'example-3']
    stored = db.policies.find_one({'_id': policy['_id']})
    db.policies.update_one({'_id': policy['_id']}, {'$set': {'selected_entry_ids': ['example-0']}})
    removed = {**changed, kind: {**changed[kind], 'source_sha256': 'removed',
        'entries': [{'id': 'example-0'}], 'entry_count': 1}}
    with pytest.raises(ValueError, match='group-selected'):
        with db.client.start_session() as session:
            session.with_transaction(lambda s: import_catalogs(db, removed, s))
    assert db.policies.find_one({'_id': policy['_id']})['version'] == stored['version']


def test_group_selection_http_validation_atomicity_and_permissions(catalogs):
    db, user, group, foreign, _ = catalogs
    cid = ObjectId(user.company.id)
    policy = db.policies.find_one({'company_id': cid, 'category': 'dlp'})
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(admin.router)
    app.dependency_overrides[get_current_user] = lambda: user
    url = f"/api/policies/{policy['_id']}/group-selections"
    with TestClient(app) as client:
        for targets, entries in (([str(foreign)], ['example-0']),
                                  ([str(group), str(group)], ['example-0']),
                                  ([str(group)], ['unknown']),
                                  ([str(group)], ['example-0', 'example-0']),
                                  ([], ['example-0'])):
            response = client.put(url, json={'version': 1, 'group_ids': targets, 'selected_entry_ids': entries})
            assert response.status_code == 422
        assert db.policies.find_one({'_id': policy['_id']})['version'] == 1
        response = client.put(url, json={'version': 1, 'group_ids': [str(group)], 'selected_entry_ids': ['example-0']})
        assert response.status_code == 200
        assert response.json()['policy']['group_entry_selections'] == [{'group_id': str(group), 'selected_entry_ids': ['example-0']}]
        assert client.put(url, json={'version': 1, 'group_ids': [str(group)], 'selected_entry_ids': []}).status_code == 409
        foreign_policy = db.policies.find_one({'company_id': {'$ne': cid}, 'category': 'dlp'})
        assert client.put(f"/api/policies/{foreign_policy['_id']}/group-selections", json={
            'version': 1, 'group_ids': [str(group)], 'selected_entry_ids': ['example-0']}).status_code == 404
        user.role = 'user'
        assert client.put(url, json={'version': 2, 'group_ids': [str(group)], 'selected_entry_ids': []}).status_code == 403
    assert db.audit_events.count_documents({'company_id': cid, 'action': 'policy.group_checks_updated'}) == 1


def test_legacy_group_only_edits_preserve_specific_check_sets(catalogs):
    db, user, group, _, _ = catalogs
    cid, second = ObjectId(user.company.id), ObjectId()
    db.groups.insert_one({'_id': second, 'company_id': cid, 'status': 'active', 'name_normalized': 'second'})
    policy = db.policies.find_one({'company_id': cid, 'category': 'dlp'})
    admin.select_group_checks(str(policy['_id']), admin.GroupCheckSelection(
        version=1, group_ids=[str(group)], selected_entry_ids=['example-3']),
        SimpleNamespace(state=SimpleNamespace(request_id='specific')), user)
    policy = db.policies.find_one({'_id': policy['_id']})
    assign(user, policy, [group, second])
    assert resolve_policies(db, cid, ObjectId(), [group])[0]['selected_entry_ids'] == ['example-3']
    assert len(resolve_policies(db, cid, ObjectId(), [second])[0]['selected_entry_ids']) == 5


def test_named_policy_created_then_reused_across_groups(catalogs):
    db, user, group, _, source = catalogs
    cid = ObjectId(user.company.id)
    another = ObjectId()
    db.groups.insert_one({'_id': another, 'company_id': cid, 'status': 'active', 'name_normalized': 'another'})
    request = SimpleNamespace(state=SimpleNamespace(request_id='named-policy-test'))
    created = admin.create_policy_set(admin.PolicySetInput(category='dlp', name='Customer data',
        description='Protect customer details', selected_entry_ids=['example-1', 'example-3']), request, user)['policy']
    pid = created['_id']
    assert created['scope']['group_ids'] == [] and created['selected_entry_ids'] == ['example-1', 'example-3']
    assert resolve_policies(db, cid, ObjectId(), [group]) == []
    assert admin.list_policy_sets(category='dlp', page=1, page_size=50, user=user)['total'] == 1
    assigned = admin.assign_policy_set(pid, admin.PolicySetGroups(version=1,
        group_ids=[str(group), str(another)]), request, user)['policy']
    for gid in (group, another):
        resolved = resolve_policies(db, cid, ObjectId(), [gid])
        assert len(resolved) == 1 and resolved[0]['selected_entry_ids'] == ['example-1', 'example-3']
    updated = admin.update_policy_set(pid, admin.PolicySetUpdate(version=2, name='Customer data',
        description='Only financial checks', selected_entry_ids=['example-4']), request, user)['policy']
    assert updated['scope']['group_ids'] == [str(group), str(another)]
    assert resolve_policies(db, cid, ObjectId(), [group])[0]['selected_entry_ids'] == ['example-4']
    with db.client.start_session() as session:
        session.with_transaction(lambda s: import_catalogs(db, source, s))
    assert db.policies.find_one({'_id': ObjectId(pid)})['status'] == 'active'
    disabled = admin.change_policy_set_status(pid, admin.PolicySetStatus(version=3, status='disabled'), request, user)['policy']
    assert disabled['status'] == 'disabled' and resolve_policies(db, cid, ObjectId(), [group]) == []
    assert db.policy_versions.count_documents({'policy_id': ObjectId(pid)}) == 4


def test_named_policy_rejects_invalid_checks_foreign_groups_and_stale_updates(catalogs):
    db, user, group, foreign, _ = catalogs
    request = SimpleNamespace(state=SimpleNamespace(request_id='policy-validation-test'))
    for ids in (['not-in-catalog'], ['example-1', 'example-1']):
        with pytest.raises(DomainError) as error:
            admin.create_policy_set(admin.PolicySetInput(category='guardrail', name='Safe replies',
                selected_entry_ids=ids), request, user)
        assert error.value.status_code == 422
    created = admin.create_policy_set(admin.PolicySetInput(category='guardrail', name='Safe replies',
        selected_entry_ids=['example-2']), request, user)['policy']
    assert db.policies.count_documents({'policy_set': True, 'company_id': ObjectId(user.company.id)}) == 1
    with pytest.raises(DomainError) as error:
        admin.create_policy_set(admin.PolicySetInput(category='guardrail', name='Safe replies',
            selected_entry_ids=['example-3']), request, user)
    assert error.value.code == 'duplicate_name'
    for groups in ([str(foreign)], [str(group), str(group)]):
        with pytest.raises(DomainError) as error:
            admin.assign_policy_set(created['_id'], admin.PolicySetGroups(version=1, group_ids=groups), request, user)
        assert error.value.status_code == 422
    with pytest.raises(DomainError) as error:
        admin.assign_policy_set(created['_id'], admin.PolicySetGroups(version=2, group_ids=[str(group)]), request, user)
    assert error.value.code == 'stale_version'
    foreign_company = db.groups.find_one({'_id': foreign})['company_id']
    other_user = SimpleNamespace(id=str(ObjectId()), role='org_admin',
                                 company=SimpleNamespace(id=str(foreign_company)))
    with pytest.raises(DomainError) as error:
        admin.assign_policy_set(created['_id'], admin.PolicySetGroups(version=1, group_ids=[str(group)]), request, other_user)
    assert error.value.status_code == 404
