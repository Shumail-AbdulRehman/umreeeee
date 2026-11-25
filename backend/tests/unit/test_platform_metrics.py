from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from bson import ObjectId
import pytest

from app.core.errors import DomainError
from app.schemas.platform import PlatformCompanySummary
from app.services.platform_metrics import (
    PlatformMetrics, company_metrics, company_pipeline, company_summary, daily_series,
    safe_attention, window_for,
)


NOW = datetime(2026, 11, 25, 14, 35, tzinfo=timezone.utc)


class Collection:
    def __init__(self, rows=(), aggregate_result=()):
        self.rows = list(rows)
        self.aggregate_result = list(aggregate_result)
        self.queries = []
        self.pipelines = []

    def find(self, query, projection=None):
        self.queries.append((query, projection))
        return iter(self.rows)

    def aggregate(self, pipeline):
        self.pipelines.append(pipeline)
        return iter(self.aggregate_result)


@pytest.mark.parametrize('days', [7, 30])
def test_window_counts_current_utc_day_and_converts_offset(days):
    offset_now = NOW.astimezone(timezone(timedelta(hours=5)))
    start, end, window = window_for(days, offset_now)
    assert end == NOW
    assert start == NOW.replace(hour=0, minute=0, second=0) - timedelta(days=days - 1)
    assert window == {'days': days, 'from': start.isoformat(), 'to': NOW.isoformat(), 'timezone': 'UTC'}


@pytest.mark.parametrize('days', [0, 1, 8, 31, True, '7'])
def test_unsupported_window_is_rejected(days):
    with pytest.raises(DomainError):
        window_for(days, NOW)


def test_naive_report_clock_is_rejected():
    with pytest.raises(DomainError):
        window_for(7, NOW.replace(tzinfo=None))


def test_daily_series_zero_fills_utc_dates_and_drops_outside_rows():
    start, _, _ = window_for(7, NOW)
    rows = [{'_id': start + timedelta(days=2), 'allowed': 4, 'blocked': 2, 'other': 1},
            {'date': (start - timedelta(days=1)).isoformat(), 'allowed': 900}]
    result = daily_series(rows, start, 7)
    assert len(result) == 7
    assert result[0] == {'date': start.isoformat(), 'allowed': 0, 'blocked': 0, 'other': 0}
    assert result[2]['allowed'] == 4 and result[2]['blocked'] == 2 and result[2]['other'] == 1
    assert sum(point['allowed'] for point in result) == 4


def test_company_summary_is_an_allowlist_with_historical_defaults():
    identifier = ObjectId()
    start, _, _ = window_for(7, NOW)
    row = {'_id': identifier, 'name': 'Test company', 'slug': 'test-company', 'created_at': NOW,
           'onboarding': 'awaiting_admin', 'email': 'private@example.test',
           'prompt_ciphertext': 'private', 'api_key': 'private', '_users': [{'password_hash': 'private'}]}
    result = company_summary(row, str(identifier), start, 7)
    parsed = PlatformCompanySummary(**result)
    assert parsed.status == 'active' and parsed.version == 1 and parsed.is_own
    assert parsed.last_workspace_submission is None
    assert set(result).isdisjoint({'email', 'prompt_ciphertext', 'api_key', '_users'})


def test_evaluation_coverage_has_an_actual_terminal_denominator():
    coverage = {'required': True, 'eligible_members': 2, 'covered_members': 1}
    result = company_metrics({'workspace_runs': 5, 'terminal_runs': 4, 'evaluated_runs': 3,
                              'password_hash': 'secret'}, coverage)
    assert result['evaluation_coverage'] == 75
    assert result['policy_coverage'] == coverage
    assert 'password_hash' not in result and 'workspace_runs' not in result
    assert company_metrics({}, coverage)['evaluation_coverage'] is None


def test_attention_never_exposes_aggregation_priority_or_private_values():
    raw = dict(id='a', company_id='b', company_name='Company', kind='provider_errors',
               title='Repeated provider errors', description='3 failed runs.', tone='amber',
               occurred_at=NOW, priority=1, error_message='private error', prompt='private prompt')
    safe = safe_attention(raw)
    assert safe['occurred_at'] == NOW.isoformat()
    assert set(safe) == {'id', 'company_id', 'company_name', 'kind', 'title', 'description', 'tone', 'occurred_at'}


def test_directory_search_is_literal_and_pagination_runs_in_mongo():
    companies = Collection(aggregate_result=[{'items': [], 'total': [{'count': 29}]}])
    metrics = PlatformMetrics(SimpleNamespace(companies=companies))
    start, end, _ = window_for(7, NOW)
    result = metrics.companies(start, end, page=3, page_size=8, q='(A)+',
                               access='suspended', onboarding='setup_incomplete', activity='idle', sort='name')
    assert result['total'][0]['count'] == 29
    pipeline = companies.pipelines[0]
    assert pipeline[0]['$match']['$or'][0]['name']['$regex'] == r'\(A\)\+'
    assert pipeline[-3] == {'$match': {'status': 'suspended', 'onboarding': 'setup_incomplete', 'workspace_runs': 0}}
    assert pipeline[-2] == {'$sort': {'_name_sort': 1, '_id': 1}}
    assert pipeline[-1]['$facet']['items'] == [{'$skip': 16}, {'$limit': 8}]


def test_aggregation_scopes_every_join_and_separates_window_from_backlog():
    start, end, _ = window_for(7, NOW)
    lookups = [stage['$lookup'] for stage in company_pipeline(start, end) if '$lookup' in stage]
    assert all(join['pipeline'][0]['$match']['$expr'] == {'$eq': ['$company_id', '$$company']} for join in lookups)
    run_joins = [join for join in lookups if join['from'] == 'prompt_runs']
    assert all(join['pipeline'][0]['$match']['source'] == 'workspace' for join in run_joins)
    assert run_joins[0]['pipeline'][0]['$match']['created_at'] == {'$gte': start, '$lt': end}
    assert 'created_at' not in run_joins[1]['pipeline'][0]['$match']
    backlog = next(join for join in lookups if join['from'] == 'violations')['pipeline'][0]['$match']
    assert backlog['source'] == 'workspace' and backlog['resolution_status'] == {'$ne': 'resolved'}
    assert 'created_at' not in backlog


def _policy(group, integration=None, stage='input', explicit=True):
    return {'_id': ObjectId(), 'stages': [stage], 'rules': [{'type': 'keyword', 'config': {'terms': ['x']}}],
            'assignment_mode': 'explicit_groups' if explicit else 'global',
            'scope': {'group_ids': [group] if group else [], 'integration_ids': [integration] if integration else []}}


def test_policy_coverage_uses_active_memberships_and_every_enabled_integration():
    company, group_a, group_b, archived = (ObjectId() for _ in range(4))
    first, second = ObjectId(), ObjectId()
    users = Collection([{'group_ids': [group_a]}, {'group_ids': [group_a]},
                        {'group_ids': [group_b]}, {'group_ids': [archived]}])
    policies = Collection([_policy(group_a, first), _policy(group_a, second), _policy(group_b, stage='output')])
    db = SimpleNamespace(users=users, groups=Collection([{'_id': group_a}, {'_id': group_b}]),
                         integrations=Collection([{'_id': first}, {'_id': second}]), policies=policies)
    coverage = PlatformMetrics(db).policy_coverage(company)
    assert coverage == {'required': True, 'eligible_members': 4, 'covered_members': 2}
    assert len(policies.queries) == 1
    assert 'rules' not in policies.queries[0][1] and 'entries' not in policies.queries[0][1]
    assert policies.queries[0][1]['rules.type'] == 1
    assert users.queries[0][0] == {'company_id': company, 'role': 'user', 'is_active': True,
                                  'is_email_verified': True, 'password_hash': {'$ne': None}}
    assert users.queries[0][1] == {'_id': 0, 'group_ids': 1}
    assert db.integrations.queries[0][0]['models.0'] == {'$exists': True}


def test_empty_explicit_assignments_do_not_count_as_global_policy_coverage():
    company, target = ObjectId(), ObjectId()
    db = SimpleNamespace(users=Collection([{'group_ids': []}]), groups=Collection(),
        integrations=Collection([{'_id': target}]), policies=Collection([_policy(None)]))
    assert PlatformMetrics(db).policy_coverage(company)['covered_members'] == 0
    db.policies = Collection([_policy(None, explicit=False)])
    assert PlatformMetrics(db).policy_coverage(company)['covered_members'] == 1


def test_no_integration_does_not_invent_policy_coverage():
    db = SimpleNamespace(users=Collection([{'group_ids': []}]), groups=Collection(),
                         integrations=Collection(), policies=Collection())
    coverage = PlatformMetrics(db).policy_coverage(ObjectId(), required=False)
    assert coverage == {'required': False, 'eligible_members': 1, 'covered_members': 0}
    assert not db.policies.queries


def test_only_integrations_with_enabled_models_participate_in_policy_coverage():
    company, enabled, no_models = ObjectId(), ObjectId(), ObjectId()

    class EnabledIntegrations(Collection):
        def find(self, query, projection=None):
            self.queries.append((query, projection))
            assert query['models.0'] == {'$exists': True}
            return iter(row for row in self.rows if row.get('models'))

    integrations = EnabledIntegrations([{'_id': enabled, 'models': ['enabled-model']},
                                        {'_id': no_models, 'models': []},
                                        {'_id': ObjectId()}])
    db = SimpleNamespace(users=Collection([{'group_ids': []}]), groups=Collection(),
        integrations=integrations, policies=Collection([_policy(None, enabled, explicit=False)]))
    assert PlatformMetrics(db).policy_coverage(company)['covered_members'] == 1
    integrations.rows = [{'_id': no_models, 'models': []}, {'_id': ObjectId()}]
    assert PlatformMetrics(db).policy_coverage(company)['covered_members'] == 0
