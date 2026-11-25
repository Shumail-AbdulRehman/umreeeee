from datetime import datetime, timezone
from types import SimpleNamespace

from bson import ObjectId
from fastapi import HTTPException
import pytest

from app.core.errors import DomainError
from app.schemas.platform import PlatformCompaniesRead, PlatformCompanyRead, PlatformOverviewRead
from app.services.platform_service import PlatformService


NOW = datetime(2026, 11, 25, 14, 35, tzinfo=timezone.utc)
COMPANY = ObjectId()


def actor(role='super_admin'):
    return SimpleNamespace(role=role, company=SimpleNamespace(id=str(COMPANY)))


def row(**extra):
    return {'_id': COMPANY, 'name': 'Example company', 'slug': 'example-company',
            'created_at': NOW, 'onboarding': 'ready', 'workspace_runs': 7,
            'terminal_runs': 5, 'evaluated_runs': 4,
            'daily': [{'_id': NOW.replace(hour=0, minute=0), 'allowed': 4, 'blocked': 2, 'other': 1}], **extra}


class Metrics:
    def __init__(self):
        self.calls = []
        self.coverage = {'required': True, 'eligible_members': 2, 'covered_members': 2}
        self.company_row = row()

    def overview(self, start, end):
        self.calls.append(('overview', start, end))
        return {'totals': [{'total_companies': 8, 'using_companies': 3,
                            'onboarding_companies': 5, 'suspended_companies': 1, 'email': 'private'}],
                'companies': [row(prompt='private')], 'series': row()['daily'],
                'attention_items': [], 'attention_total': [{'count': 0}]}

    def companies(self, start, end, **filters):
        self.calls.append(('companies', start, end, filters))
        return {'items': [row(email='private')], 'total': [{'count': 13}]}

    def company(self, identifier, start, end):
        self.calls.append(('company', identifier, start, end))
        return self.company_row

    def policy_coverage(self, identifier, required):
        self.calls.append(('coverage', identifier, required))
        return self.coverage


@pytest.mark.parametrize('method,args', [('overview', ()), ('companies', ()), ('company', (str(COMPANY),))])
@pytest.mark.parametrize('role', ['user', 'org_admin'])
def test_every_public_read_rejects_tenant_roles_before_querying(method, args, role):
    metrics = Metrics()
    service = PlatformService(None, now=NOW, metrics=metrics)
    with pytest.raises(HTTPException) as caught:
        getattr(service, method)(actor(role), *args)
    assert caught.value.status_code == 403
    assert metrics.calls == []


def test_overview_reports_full_totals_and_validates_safe_response():
    metrics = Metrics()
    result = PlatformService(None, now=NOW, metrics=metrics).overview(actor())
    parsed = PlatformOverviewRead(**result)
    assert parsed.metrics.total_companies == 8 and len(parsed.companies) == 1
    assert len(parsed.series) == 7 and sum(item.allowed for item in parsed.series) == 4
    assert parsed.companies[0].is_own
    assert 'private' not in str(result)


def test_empty_overview_is_zero_data_not_sample_activity():
    result = PlatformService(None, now=NOW, metrics=SimpleNamespace(overview=lambda *_: {})).overview(actor(), days=30)
    parsed = PlatformOverviewRead(**result)
    assert parsed.metrics.total_companies == 0 and not parsed.companies
    assert len(parsed.series) == 30 and sum(item.allowed + item.blocked + item.other for item in parsed.series) == 0
    assert parsed.attention.total == 0


def test_directory_preserves_server_total_and_passes_all_filters():
    metrics = Metrics()
    result = PlatformService(None, now=NOW, metrics=metrics).companies(
        actor(), days=30, page=2, page_size=8, q='  acme  ', access='active',
        onboarding='ready', activity='used', sort='violations')
    parsed = PlatformCompaniesRead(**result)
    assert parsed.total == 13 and parsed.page == 2 and parsed.window.days == 30
    assert metrics.calls[-1][-1] == {'page': 2, 'page_size': 8, 'q': 'acme', 'access': 'active',
                                    'onboarding': 'ready', 'activity': 'used', 'sort': 'violations'}


@pytest.mark.parametrize('filters', [{'page': 0}, {'page_size': 101}, {'page': True}, {'sort': 'email'},
                                    {'q': 'x' * 121}, {'access': 'deleted'}, {'activity': 'login'},
                                    {'onboarding': 'verified'}])
def test_invalid_filters_do_not_reach_database(filters):
    metrics = Metrics()
    with pytest.raises(DomainError) as caught:
        PlatformService(None, now=NOW, metrics=metrics).companies(actor(), **filters)
    assert caught.value.status_code == 422 and not metrics.calls


def test_company_detail_distinguishes_observed_evaluation_and_actual_policy_coverage():
    metrics = Metrics()
    metrics.coverage = {'required': True, 'eligible_members': 2, 'covered_members': 1}
    result = PlatformService(None, now=NOW, metrics=metrics).company(actor(), str(COMPANY))
    parsed = PlatformCompanyRead(**result, history={'items': [], 'total': 0, 'page': 1, 'page_size': 5})
    assert parsed.metrics.evaluation_coverage == 80
    assert parsed.metrics.policy_coverage.covered_members == 1
    assert parsed.company.onboarding == 'ready'
    assert parsed.attention[0].kind == 'policy_coverage'
    assert '1 active members' in parsed.attention[0].description


def test_onboarding_is_the_same_setup_milestone_in_directory_and_detail():
    metrics = Metrics()
    metrics.coverage = {'required': True, 'eligible_members': 2, 'covered_members': 0}
    service = PlatformService(None, now=NOW, metrics=metrics)
    overview = service.overview(actor())
    directory = service.companies(actor())
    detail = service.company(actor(), str(COMPANY))
    assert overview['companies'][0]['onboarding'] == directory['items'][0]['onboarding'] == detail['company']['onboarding'] == 'ready'
    assert detail['attention'][0]['kind'] == 'policy_coverage'


def test_optional_input_policy_does_not_raise_a_required_policy_attention():
    metrics = Metrics()
    metrics.coverage = {'required': False, 'eligible_members': 2, 'covered_members': 0}
    result = PlatformService(None, now=NOW, metrics=metrics).company(actor(), str(COMPANY))
    assert result['attention'] == [] and result['company']['onboarding'] == 'ready'


def test_missing_company_is_404_and_invalid_id_is_422():
    metrics = Metrics()
    metrics.company_row = None
    service = PlatformService(None, now=NOW, metrics=metrics)
    with pytest.raises(DomainError) as caught:
        service.company(actor(), str(COMPANY))
    assert caught.value.status_code == 404
    with pytest.raises(DomainError) as caught:
        service.company(actor(), 'invalid')
    assert caught.value.status_code == 422
