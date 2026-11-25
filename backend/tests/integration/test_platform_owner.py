"""Platform acceptance against the fixture-created, transaction-capable test DB.

No application database, external detector, broker or model provider is used.
The shared fixture requires TEST_MONGODB_URL and a distinct test_* prefix.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.api.routes import administration, platform
from app.core.errors import DomainError, install_error_handlers
from app.db.indexes import ensure_indexes
from app.schemas.platform import PlatformCompanyRead, PlatformOverviewRead
from app.services import platform_audit_service as audit_module
from app.services.platform_audit_service import PlatformAuditService, STATUS_ACTION
from app.services.platform_service import PlatformService


NOW = datetime(2026, 11, 25, 12, tzinfo=timezone.utc)
START = NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
PRIVATE = 'TENANT_CONTENT_MUST_STAY_PRIVATE'


@pytest.fixture
def platform_context(test_database, monkeypatch):
    db = test_database
    ensure_indexes(db)
    ids = {name: ObjectId() for name in (
        'home', 'alpha', 'beta', 'legacy', 'owner', 'admin', 'member1', 'member2',
        'group1', 'group2', 'integration', 'disabled_integration', 'dlp', 'guardrail',
    )}
    for key, name in [('home', 'Owner Workspace'), ('alpha', 'Alpha Research'),
                      ('beta', 'Beta Systems'), ('legacy', 'Legacy Studio')]:
        company = {'_id': ids[key], 'name': name, 'slug': key,
                   'created_at': NOW - timedelta(days=45),
                   'settings': {'require_active_policy': True, 'private': PRIVATE}}
        if key != 'legacy':
            company.update(status='suspended' if key == 'beta' else 'active', version=1)
        db.companies.insert_one(company)

    def account(company, role='user', **extra):
        return {'_id': ObjectId(), 'company_id': company, 'role': role,
                'first_name': PRIVATE, 'last_name': PRIVATE, 'email': f'{ObjectId()}@example.test',
                'password_hash': PRIVATE, 'is_active': True, 'is_email_verified': True,
                'group_ids': [], 'token_version': 0, 'created_at': NOW - timedelta(days=30), **extra}

    db.users.insert_many([
        account(ids['home'], 'super_admin', _id=ids['owner'], first_name='Platform', last_name='Owner'),
        account(ids['alpha'], 'org_admin', _id=ids['admin']),
        account(ids['alpha'], _id=ids['member1'], group_ids=[ids['group1']]),
        account(ids['alpha'], _id=ids['member2'], group_ids=[ids['group2']]),
        account(ids['alpha'], is_active=False),
        account(ids['alpha'], password_hash=None, is_email_verified=False,
                invitation_token_hash=PRIVATE, invitation_delivery_status='sent'),
        account(ids['alpha'], password_hash=None, is_email_verified=False,
                invitation_token_hash=PRIVATE, invitation_delivery_status='failed', updated_at=NOW),
        account(ids['beta'], 'org_admin', is_email_verified=False),
        account(ids['legacy'], 'org_admin'),
    ])
    db.groups.insert_many([
        {'_id': ids[key], 'company_id': ids['alpha'], 'name': PRIVATE, 'name_normalized': key,
         'status': 'active', 'created_at': NOW} for key in ('group1', 'group2')
    ])
    db.integrations.insert_many([
        {'_id': ids[key], 'company_id': ids['alpha'], 'provider': 'openai',
         'account_name': PRIVATE, 'account_name_normalized': key,
         'status': 'active' if key == 'integration' else 'disabled',
         'models': ['synthetic-model'], 'system_prompt': PRIVATE, 'api_key_ciphertext': PRIVATE,
         'base_url': 'https://private.example.test', 'created_at': NOW}
        for key in ('integration', 'disabled_integration')
    ])
    for key, category, stages in [('dlp', 'dlp', ['input']), ('guardrail', 'guardrail', ['output'])]:
        db.policies.insert_one({
            '_id': ids[key], 'company_id': ids['alpha'], 'name': PRIVATE,
            'name_normalized': key, 'category': category, 'policy_set': True,
            'status': 'active', 'action': 'BLOCK', 'severity': 'high', 'version': 1,
            'assignment_mode': 'explicit_groups', 'stages': stages,
            'scope': {'group_ids': [ids['group1'], ids['group2']],
                      'integration_ids': [ids['integration']]},
            'entries': [{'id': 'synthetic-check', 'name': PRIVATE}],
            'selected_entry_ids': ['synthetic-check'],
            'rules': [{'rule_id': str(ObjectId()), 'type': 'catalog',
                       'config': {'kind': category, 'selected_entry_ids': ['synthetic-check']}}],
            'created_at': NOW,
        })
    # A reference catalog is not a configured named policy.
    db.policies.insert_one({'company_id': ids['alpha'], 'name_normalized': 'catalog',
                            'category': 'dlp', 'managed_catalog': True, 'status': 'active',
                            'assignment_mode': 'explicit_groups', 'scope': {'group_ids': []},
                            'entries': [], 'rules': [], 'stages': ['input']})

    pass_rule = {'rule_results': [{'outcome': 'pass'}]}
    match_rule = {'rule_results': [{'outcome': 'match'}]}
    records = [
        ('allowed', START, 'member1', pass_rule, None),
        ('blocked_input', START + timedelta(hours=1), 'member2', match_rule, None),
        ('provider_error', NOW - timedelta(days=1), 'member1', pass_rule, None),
        ('provider_error', NOW - timedelta(days=2), 'member2', pass_rule, None),
        ('provider_error', NOW - timedelta(days=3), 'member1', pass_rule, None),
        ('validation_error', NOW - timedelta(days=4), 'member1', {'rule_results': [{'outcome': 'error'}]}, None),
        ('processing', NOW - timedelta(hours=2), 'member2', None, None),
        ('allowed', NOW - timedelta(hours=1), 'member1', None, None),
        ('blocked_output', NOW - timedelta(minutes=30), 'member2', pass_rule, match_rule),
        ('configuration_error', NOW - timedelta(days=5), 'member1', None, None),
        ('interrupted', NOW - timedelta(days=1, minutes=10), 'member1', pass_rule, None),
    ]

    def run(company, status, created_at, source='workspace', **extra):
        return {'_id': ObjectId(), 'company_id': company, 'status': status, 'source': source,
                'created_at': created_at, 'prompt_ciphertext': PRIVATE,
                'response_ciphertext': PRIVATE, 'user_email': PRIVATE, **extra}

    db.prompt_runs.insert_many([
        run(ids['alpha'], status, created_at, user_id=ids[user],
            input_evaluation=input_eval, output_evaluation=output_eval)
        for status, created_at, user, input_eval, output_eval in records
    ] + [
        run(ids['alpha'], 'allowed', START - timedelta(microseconds=1), user_id=ids['member1']),
        run(ids['alpha'], 'allowed', NOW, user_id=ids['member1']),
        run(ids['alpha'], 'allowed', NOW - timedelta(minutes=10), source='red_team'),
        run(ids['alpha'], 'legacy_completed', NOW - timedelta(minutes=5), source='legacy'),
        run(ids['legacy'], 'allowed', NOW - timedelta(hours=3), user_id=ObjectId()),
        run(ids['beta'], 'allowed', NOW - timedelta(hours=3), source='red_team'),
    ])
    violations = []
    for company, severity, state, source in [
        ('alpha', 'high', 'open', 'workspace'), ('alpha', 'critical', 'reviewed', 'workspace'),
        ('alpha', 'medium', 'open', 'workspace'), ('alpha', 'high', 'resolved', 'workspace'),
        ('alpha', 'critical', 'open', 'red_team'), ('legacy', 'low', 'open', 'workspace'),
    ]:
        violations.append({'company_id': ids[company], 'run_id': ObjectId(), 'policy_id': ObjectId(),
                           'stage': 'input', 'severity': severity, 'source': source,
                           'resolution_status': state, 'findings': [{'text': PRIVATE}],
                           'resolution_note': PRIVATE, 'created_at': NOW - timedelta(days=40)})
    db.violations.insert_many(violations)
    owner = SimpleNamespace(id=str(ids['owner']), role='super_admin',
                            company=SimpleNamespace(id=str(ids['home'])))
    monkeypatch.setattr(audit_module, 'utcnow', lambda: NOW)
    return SimpleNamespace(db=db, ids=ids, owner=owner,
                           reads=PlatformService(db, now=NOW), audit=PlatformAuditService(db))


def test_platform_overview_uses_real_workspace_sources_and_utc_window(platform_context):
    context = platform_context
    report = context.reads.overview(context.owner, days=7)
    PlatformOverviewRead.model_validate(report)
    assert report['metrics'] == {'total_companies': 4, 'using_companies': 2,
                                 'onboarding_companies': 3, 'suspended_companies': 1}
    assert report['window']['from'] == START.isoformat()
    assert report['window']['to'] == NOW.isoformat()
    assert len(report['series']) == 7
    assert sum(point['allowed'] for point in report['series']) == 3
    assert sum(point['blocked'] for point in report['series']) == 2
    assert sum(point['other'] for point in report['series']) == 7
    assert report['series'][0] == {'date': START.isoformat(), 'allowed': 1, 'blocked': 1, 'other': 0}
    assert report['companies'][0]['id'] == str(context.ids['alpha'])
    assert report['companies'][0]['workspace_runs'] == 11
    assert PRIVATE not in str(report)
    kinds = {row['kind'] for row in report['attention']['items']}
    assert {'high_severity_violations', 'provider_errors', 'awaiting_admin'} <= kinds
    assert report['attention']['total'] >= len(report['attention']['items'])
    thirty_days = context.reads.overview(context.owner, days=30)
    assert len(thirty_days['series']) == 30
    assert sum(sum(point[key] for key in ('allowed', 'blocked', 'other'))
               for point in thirty_days['series']) == 13


def test_platform_directory_filters_and_paginates_complete_collection(platform_context):
    context = platform_context
    first = context.reads.companies(context.owner, page=1, page_size=1, activity='used', sort='runs')
    second = context.reads.companies(context.owner, page=2, page_size=1, activity='used', sort='runs')
    assert first['total'] == second['total'] == 2
    assert first['items'][0]['id'] == str(context.ids['alpha'])
    legacy = second['items'][0]
    assert legacy['id'] == str(context.ids['legacy'])
    assert legacy['status'] == 'active' and legacy['version'] == 1
    assert context.reads.companies(context.owner, q='ALPHA')['total'] == 1
    assert context.reads.companies(context.owner, q='.*')['total'] == 0
    suspended = context.reads.companies(context.owner, access='suspended')
    assert [row['id'] for row in suspended['items']] == [str(context.ids['beta'])]
    awaiting = context.reads.companies(context.owner, onboarding='awaiting_admin')
    assert [row['id'] for row in awaiting['items']] == [str(context.ids['beta'])]
    assert context.reads.companies(context.owner, activity='idle')['total'] == 2
    by_violations = context.reads.companies(context.owner, sort='violations')['items']
    assert [row['open_violations'] for row in by_violations[:2]] == [3, 1]
    by_name = context.reads.companies(context.owner, sort='name')['items']
    assert [row['name'] for row in by_name] == sorted(row['name'] for row in by_name)
    assert next(row for row in by_name if row['id'] == str(context.ids['home']))['is_own'] is True
    assert PRIVATE not in str(first)


def test_company_detail_counts_only_selected_company_and_proves_real_policy_scope(platform_context):
    context = platform_context
    detail = context.reads.company(context.owner, str(context.ids['alpha']))
    metrics = detail['metrics']
    assert metrics['active_accounts'] == 3
    assert metrics['verified_admins'] == 1
    assert metrics['pending_invitations'] == 2 and metrics['failed_invitations'] == 1
    assert metrics['active_groups'] == 2 and metrics['active_integrations'] == 1
    assert metrics['dlp_policies'] == 1 and metrics['guardrail_policies'] == 1
    assert metrics['submitting_users'] == 2
    assert metrics['allowed_runs'] == metrics['blocked_runs'] == 2
    assert metrics['provider_errors'] == 3
    assert metrics['validation_errors'] == metrics['configuration_errors'] == metrics['interrupted_runs'] == 1
    assert metrics['processing_runs'] == 1 and metrics['other_runs'] == 7
    assert metrics['evaluated_runs'] == 7 and metrics['terminal_runs'] == 10
    assert metrics['evaluation_coverage'] == 70
    assert metrics['policy_coverage'] == {'required': True, 'eligible_members': 2, 'covered_members': 2}
    assert detail['company']['open_violations'] == 3 and detail['company']['high_severity_violations'] == 2
    assert detail['company']['last_workspace_submission'] == NOW.isoformat()
    detail['history'] = context.audit.list(context.owner, company_id=str(context.ids['alpha']), page_size=5)
    PlatformCompanyRead.model_validate(detail)
    assert PRIVATE not in str(detail)

    context.db.policies.update_one({'_id': context.ids['dlp']},
                                   {'$set': {'scope.group_ids': [context.ids['group1']]}})
    partial = context.reads.company(context.owner, str(context.ids['alpha']))
    assert partial['metrics']['policy_coverage']['covered_members'] == 1
    # Setup milestones and actual enforcement applicability are independent.
    assert partial['company']['onboarding'] == 'ready'
    assert context.reads.companies(context.owner, q='Alpha')['items'][0]['onboarding'] == 'ready'
    assert 'policy_coverage' in {row['kind'] for row in partial['attention']}
    # A policy owned by another company cannot fill the selected company's gap.
    cross_policy = context.db.policies.find_one({'_id': context.ids['dlp']})
    cross_policy.update(_id=ObjectId(), company_id=context.ids['home'], name_normalized='other-company',
                        scope={'group_ids': [context.ids['group2']], 'integration_ids': []})
    context.db.policies.insert_one(cross_policy)
    assert context.reads.company(context.owner, str(context.ids['alpha']))['metrics']['policy_coverage']['covered_members'] == 1
    # Every enabled integration must have an applicable input policy.
    context.db.integrations.update_one({'_id': context.ids['disabled_integration']}, {'$set': {'status': 'active'}})
    assert context.reads.company(context.owner, str(context.ids['alpha']))['metrics']['policy_coverage']['covered_members'] == 0


def test_audit_history_deduplicates_and_attributes_target_with_safe_metadata(platform_context):
    context = platform_context
    ids, db = context.ids, context.db
    status = {'action': STATUS_ACTION, 'actor_user_id': ids['owner'], 'resource_type': 'company',
              'resource_id': ids['beta'], 'before': {'status': 'active', 'private': PRIVATE},
              'after': {'status': 'suspended', 'reason': 'Requested pause', 'private': PRIVATE},
              'request_id': 'paired-event', 'created_at': NOW - timedelta(hours=2)}
    db.audit_events.insert_many([
        {**status, 'company_id': ids['home']}, {**status, 'company_id': ids['beta']},
        {**status, 'resource_id': ids['legacy'], 'company_id': ids['home'],
         'request_id': 'actor-copy-only', 'created_at': NOW - timedelta(hours=3)},
        {'company_id': ids['alpha'], 'action': 'policy_set.updated', 'actor_user_id': ids['admin'],
         'resource_id': ids['dlp'], 'before': {'private': PRIVATE}, 'after': {'private': PRIVATE},
         'request_id': 'policy-event', 'created_at': NOW - timedelta(hours=1)},
        {'company_id': ids['beta'], 'action': 'auth.signup', 'actor_user_id': ids['owner'],
         'request_id': 'old-event', 'created_at': NOW - timedelta(days=40)},
        {'company_id': ids['alpha'], 'action': 'auth.password_reset', 'actor_user_id': ids['admin'],
         'request_id': 'not-allowlisted', 'created_at': NOW},
        {'company_id': ids['alpha'], 'action': 'auth.signup', 'actor_user_id': ids['admin'],
         'request_id': 'future-event', 'created_at': NOW + timedelta(milliseconds=1)},
    ])
    first = context.audit.list(context.owner, page_size=2)
    second = context.audit.list(context.owner, page_size=2, page=2)
    assert first['total'] == second['total'] == 4
    assert len(first['items']) == len(second['items']) == 2
    assert first['items'][0]['event'] == 'Policy updated'
    assert first['items'][0]['actor_name'] == 'Organization admin'
    assert first['items'][0]['reason'] is None
    pause = first['items'][1]
    assert pause['company_id'] == str(ids['beta']) and pause['company_name'] == 'Beta Systems'
    assert pause['event'] == 'Company suspended' and pause['actor_name'] == 'Platform Owner'
    assert pause['reason'] == 'Requested pause'
    assert second['items'][0]['company_id'] == str(ids['legacy'])
    assert context.audit.list(context.owner, company_id=str(ids['legacy']))['total'] == 1
    assert context.audit.list(context.owner, company_id=str(ids['beta']))['total'] == 2
    assert context.audit.list(context.owner, company_id=str(ids['beta']), days=7)['total'] == 1
    assert context.audit.list(context.owner, event_type='policy_set.updated')['total'] == 1
    assert PRIVATE not in str(first) + str(second)
    assert not ({row['id'] for row in first['items']} & {row['id'] for row in second['items']})
    db.audit_events.insert_many([
        {'company_id': ids['alpha'], 'action': 'settings.updated', 'actor_user_id': ids['admin'],
         'request_id': label, 'created_at': timestamp}
        for label, timestamp in [('before', START - timedelta(microseconds=1)), ('start', START),
                                 ('now', NOW), ('future', NOW + timedelta(milliseconds=1))]
    ])
    bounded = context.audit.list(context.owner, event_type='settings.updated', days=7)
    assert {row['request_id'] for row in bounded['items']} == {'start', 'now'}
    all_dates = context.audit.list(context.owner, event_type='settings.updated')
    assert {row['request_id'] for row in all_dates['items']} == {'before', 'start', 'now'}
    db.audit_events.insert_many([
        {'company_id': ids['alpha'], 'action': 'violation.resolved', 'actor_user_id': ids['admin'],
         'after': {'status': state}, 'created_at': NOW}
        for state in ('open', 'reviewed', 'resolved', None)
    ])
    outcomes = context.audit.list(context.owner, event_type='violation.resolved')
    assert {row['event'] for row in outcomes['items']} == {
        'Violation reopened', 'Violation reviewed', 'Violation resolved', 'Violation status changed'}


def test_access_mutations_preserve_atomic_audit_version_and_home_company_guards(platform_context):
    context = platform_context
    alpha = str(context.ids['alpha'])
    result = context.audit.change_status(context.owner, alpha, 'suspended', 1, '  Customer request  ', 'pause')
    assert result['organization']['version'] == 2
    rows = list(context.db.audit_events.find({'request_id': 'pause'}))
    assert len(rows) == 2 and all(row['after']['reason'] == 'Customer request' for row in rows)
    assert context.audit.list(context.owner, company_id=alpha)['total'] == 1
    noop = context.audit.change_status(context.owner, alpha, 'suspended', 2, 'Same state', 'noop')
    assert noop['organization']['version'] == 2
    assert context.db.audit_events.count_documents({'request_id': 'noop'}) == 0
    with pytest.raises(DomainError) as stale:
        context.audit.change_status(context.owner, alpha, 'active', 1, 'Outdated', 'stale')
    assert stale.value.status_code == 409
    restored = context.audit.change_status(context.owner, alpha, 'active', 2, 'Resolved', 'restore')
    assert restored['organization']['status'] == 'active' and restored['organization']['version'] == 3
    with pytest.raises(DomainError) as own:
        context.audit.change_status(context.owner, context.owner.company.id, 'suspended', 1, 'Disallowed', 'own')
    assert own.value.code == 'own_company'
    legacy = context.audit.change_status(context.owner, str(context.ids['legacy']), 'suspended', 1, None, 'legacy')
    assert legacy['organization']['version'] == 2
    assert context.db.companies.find_one({'_id': context.ids['legacy']})['version'] == 2


@pytest.mark.parametrize('role', ['org_admin', 'user'])
def test_platform_services_reject_tenant_roles_without_mutation(platform_context, role):
    context = platform_context
    user = SimpleNamespace(id=context.owner.id, role=role, company=context.owner.company)
    before = context.db.audit_events.count_documents({})
    for call in (
        lambda: context.reads.overview(user), lambda: context.reads.companies(user),
        lambda: context.reads.company(user, str(context.ids['alpha'])),
        lambda: context.audit.list(user),
        lambda: context.audit.change_status(user, str(context.ids['alpha']), 'suspended', 1, 'Forbidden', 'req'),
    ):
        with pytest.raises(HTTPException) as error:
            call()
        assert error.value.status_code == 403
    assert context.db.audit_events.count_documents({}) == before
    assert context.db.companies.find_one({'_id': context.ids['alpha']})['status'] == 'active'


def test_platform_http_composes_real_services_and_validates_privileged_actions(platform_context, monkeypatch):
    context = platform_context
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(platform.router)
    app.include_router(administration.router)
    app.dependency_overrides[get_current_user] = lambda: context.owner
    app.dependency_overrides[platform.get_platform_service] = lambda: context.reads
    app.dependency_overrides[platform.get_platform_audit_service] = lambda: context.audit
    monkeypatch.setattr(administration, 'get_database', lambda: context.db)
    alpha = str(context.ids['alpha'])
    with TestClient(app) as client:
        for path in ('/api/platform/overview', '/api/platform/companies',
                     f'/api/platform/companies/{alpha}', '/api/platform/audit'):
            response = client.get(path)
            assert response.status_code == 200, response.text
            assert PRIVATE not in response.text
        assert client.get('/api/platform/companies?days=90').status_code == 422
        assert client.get('/api/platform/companies?page_size=101').status_code == 422
        assert client.get('/api/platform/companies/bad-id').status_code == 422
        assert client.get(f'/api/platform/companies/{ObjectId()}').status_code == 404
        assert client.get('/api/platform/audit?event_type=auth.password_reset').status_code == 422
        assert client.patch(f'/api/platform/companies/{alpha}/status',
                            json={'status': 'suspended', 'version': 1, 'reason': '  '}).status_code == 422
        saved = client.patch(f'/api/platform/companies/{alpha}/status',
                             json={'status': 'suspended', 'version': 1, 'reason': 'Support review'})
        assert saved.status_code == 200, saved.text
        assert saved.json()['organization']['version'] == 2
        assert client.patch(f'/api/platform/companies/{alpha}/status',
                            json={'status': 'active', 'version': 1, 'reason': 'Stale'}).status_code == 409
        assert client.patch(f'/api/platform/companies/{context.ids["home"]}/status',
                            json={'status': 'suspended', 'version': 1, 'reason': 'Own'}).status_code == 403
        # The old entry point remains compatible and shares the same audit/version operation.
        legacy = client.patch(f'/api/platform/organizations/{alpha}/status',
                              json={'status': 'active', 'version': 2})
        assert legacy.status_code == 200 and legacy.json()['organization']['version'] == 3
        context.owner.role = 'org_admin'
        assert client.get('/api/platform/overview').status_code == 403
        assert client.patch(f'/api/platform/companies/{alpha}/status',
                            json={'status': 'suspended', 'version': 3, 'reason': 'Forbidden'}).status_code == 403
