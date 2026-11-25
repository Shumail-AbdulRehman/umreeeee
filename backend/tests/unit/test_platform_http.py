from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.api.routes.platform import get_platform_audit_service, get_platform_service, router
from app.core.errors import install_error_handlers


COMPANY_ID = '123456789012345678901234'
STAMP = '2026-11-25T12:00:00+00:00'
WINDOW = {'days': 7, 'from': '2026-11-19T00:00:00+00:00', 'to': STAMP, 'timezone': 'UTC'}


@pytest.fixture
def platform_http():
    user = SimpleNamespace(id='123456789012345678901299', role='super_admin',
                           company=SimpleNamespace(id='123456789012345678901298'))
    reads, audit = Mock(), Mock()
    reads.overview.return_value = {'window': WINDOW, 'generated_at': STAMP, 'series': [],
        'metrics': {'total_companies': 0, 'using_companies': 0, 'onboarding_companies': 0,
                    'suspended_companies': 0}, 'attention': {'items': [], 'total': 0}, 'companies': []}
    reads.companies.return_value = {'items': [], 'total': 0, 'page': 1, 'page_size': 8,
                                    'window': WINDOW, 'generated_at': STAMP}
    audit.list.return_value = {'items': [], 'total': 0, 'page': 1, 'page_size': 20}
    audit.change_status.return_value = {'organization': {
        'id': COMPANY_ID, 'name': 'Company', 'status': 'suspended', 'version': 2}, 'message': 'Updated'}
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_platform_service] = lambda: reads
    app.dependency_overrides[get_platform_audit_service] = lambda: audit
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, user, reads, audit


@pytest.mark.parametrize('role', ['user', 'org_admin'])
@pytest.mark.parametrize('method,path,payload', [
    ('get', '/api/platform/overview', None),
    ('get', '/api/platform/companies', None),
    ('get', f'/api/platform/companies/{COMPANY_ID}', None),
    ('get', '/api/platform/audit', None),
    ('patch', f'/api/platform/companies/{COMPANY_ID}/status',
     {'status': 'suspended', 'version': 1, 'reason': 'Support'}),
])
def test_every_platform_route_denies_tenant_roles(platform_http, role, method, path, payload):
    client, user, reads, audit = platform_http
    user.role = role
    kwargs = {'json': payload} if payload else {}
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 403
    assert reads.method_calls == []
    assert audit.method_calls == []


def test_platform_routes_require_authentication(platform_http):
    client, _user, _reads, _audit = platform_http
    client.app.dependency_overrides.pop(get_current_user)
    response = client.get('/api/platform/overview')
    assert response.status_code == 401


@pytest.mark.parametrize('query', ['days=8', 'days=0', 'page=0', 'page_size=101', 'access=deleted',
                                  'onboarding=all', 'activity=all', 'sort=email', 'q=' + 'a' * 121])
def test_directory_rejects_invalid_filters(platform_http, query):
    client, _user, reads, _audit = platform_http
    response = client.get(f'/api/platform/companies?{query}')
    assert response.status_code == 422
    reads.companies.assert_not_called()


def test_directory_passes_filter_values_and_overview_emits_public_contract(platform_http):
    client, user, reads, _audit = platform_http
    assert client.get('/api/platform/overview?days=30').status_code == 200
    reads.overview.assert_called_once_with(user, days=30)
    response = client.get('/api/platform/companies?days=30&q=North&access=active&activity=used&sort=violations')
    assert response.status_code == 200
    reads.companies.assert_called_once_with(user, days=30, page=1, page_size=8, q='North', access='active',
                                           onboarding=None, activity='used', sort='violations')
    assert set(response.json()) == {'items', 'total', 'page', 'page_size', 'window', 'generated_at'}


@pytest.mark.parametrize('replacement', [{'reason': ''}, {'reason': '  '}, {'reason': 'a' * 181},
                                         {'version': 0}, {'version': True}, {'status': 'deleted'},
                                         {'unexpected': 'value'}])
def test_access_action_validates_reason_and_version(platform_http, replacement):
    client, _user, _reads, audit = platform_http
    payload = {'status': 'suspended', 'version': 1, 'reason': 'Support request'} | replacement
    response = client.patch(f'/api/platform/companies/{COMPANY_ID}/status', json=payload)
    assert response.status_code == 422
    audit.change_status.assert_not_called()


def test_access_action_records_trimmed_reason_with_request_identity(platform_http):
    client, user, _reads, audit = platform_http
    response = client.patch(f'/api/platform/companies/{COMPANY_ID}/status', json={
        'status': 'suspended', 'version': 1, 'reason': '  Support request  '})
    assert response.status_code == 200
    args = audit.change_status.call_args.args
    assert args[:5] == (user, COMPANY_ID, 'suspended', 1, 'Support request')
    assert args[5] == response.headers['x-request-id']


def test_audit_filters_are_forwarded_without_private_payloads(platform_http):
    client, user, _reads, audit = platform_http
    response = client.get(f'/api/platform/audit?company_id={COMPANY_ID}&event_type=auth.signup&days=7&page=2')
    assert response.status_code == 200
    audit.list.assert_called_once_with(user, company_id=COMPANY_ID, event_type='auth.signup',
                                       days=7, page=2, page_size=20)
