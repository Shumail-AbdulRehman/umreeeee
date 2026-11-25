import pytest
from pydantic import ValidationError

from app.schemas.platform import PlatformAccessChange, PlatformCompanySummary


def test_access_change_requires_a_real_reason_and_exact_fields():
    change = PlatformAccessChange(status='suspended', version=1, reason='  Support request  ')
    assert change.reason == 'Support request'
    for replacement in ({'reason': '   '}, {'reason': 'x' * 181}, {'version': 0},
                        {'version': True}, {'version': '1'}, {'status': 'deleted'},
                        {'company_id': 'other'}, {'reason': None}):
        with pytest.raises(ValidationError):
            PlatformAccessChange(**({'status': 'active', 'version': 1, 'reason': 'Resolved'} | replacement))


def test_summary_contract_rejects_private_tenant_fields():
    summary = dict(id='company', name='Company', slug='company', status='active', version=1,
                   created_at='2026-11-25T00:00:00Z', is_own=False, onboarding='ready',
                   workspace_runs=0, last_workspace_submission=None, open_violations=0,
                   high_severity_violations=0, series=[])
    assert PlatformCompanySummary(**summary).workspace_runs == 0
    for private_field in ('prompt', 'response_text', 'api_key', 'email', 'findings'):
        with pytest.raises(ValidationError):
            PlatformCompanySummary(**summary, **{private_field: 'must not escape'})
