from copy import deepcopy

import httpx
import pytest
from bson import ObjectId

from app.core import config
from app.services import remote_detection as remote
from app.services.enforcement_service import evaluate_stage, decision, resolve_policies


def policy(kind='dlp'):
    return {'_id': ObjectId(), 'version': 1, 'category': kind, 'managed_catalog': True,
        'action': 'BLOCK', 'status': 'active', 'stages': ['input', 'output'],
        'scope': {'group_ids': [ObjectId()], 'integration_ids': []},
        'entries': [{'pattern_id': 'email'}, {'pattern_id': 'card'}] if kind == 'dlp' else
                   [{'id': 'ascii-smuggling'}, {'id': 'overreliance'}],
        'selected_entry_ids': ['email'] if kind == 'dlp' else ['ascii-smuggling'],
        'rules': [{'rule_id': kind, 'type': 'catalog', 'config': {'kind': kind}}]}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(config, 'REMOTE_DETECTION_ENABLED', True)
    monkeypatch.setattr(config, 'DLP_DETECTION_API_KEY', 'synthetic-test-key')
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: pytest.fail('Unexpected real HTTP client'))


def test_payloads_are_only_selected_entries():
    dlp, guard = policy(), policy('guardrail')
    assert remote.build_request(dlp, 'hello') == (remote.DLP_URL,
        {'text': 'hello', 'pattern_ids': ['email'], 'custom_patterns': []})
    assert remote.build_request(guard, 'hello') == (remote.GUARDRAIL_URL,
        {'output': 'hello', 'plugins': [{'pluginId': 'ascii-smuggling', 'config': {}}], 'includePassing': False})
    for selected in ([], ['unknown'], ['email', 'email'], None):
        with pytest.raises(remote.DetectionError):
            remote.build_request({**dlp, 'selected_entry_ids': selected}, 'hello')


def test_disabled_never_constructs_client(monkeypatch):
    monkeypatch.setattr(config, 'REMOTE_DETECTION_ENABLED', False)
    evaluation, matched = evaluate_stage([policy()], 'input', {'user_prompt': 'hello'})
    assert evaluation['errors'] == ['remote_detection_disabled']
    assert decision(evaluation, matched, 'input') == 'validation_error'


def test_two_apis_have_separate_payloads_and_no_raw_evidence(monkeypatch):
    calls = []
    def post(url, payload, headers, timeout):
        calls.append((url, payload, headers))
        return {'detections': [{'pattern_id': 'email', 'text': 'PRIVATE'}]} if url == remote.DLP_URL else {'results': []}
    monkeypatch.setattr(remote, 'post_detection', post)
    evaluation, matched = evaluate_stage([policy(), policy('guardrail')], 'input',
                                         {'user_prompt': 'hello', 'system_prompt': ''})
    assert len(calls) == 2
    assert calls[0][2] == {'x-api-key': 'synthetic-test-key'}
    assert calls[1][2] == {}
    assert decision(evaluation, matched, 'input') == 'blocked_input'
    assert 'PRIVATE' not in str(evaluation)
    assert evaluation['rule_results'][0]['evidence'] == [{'kind': 'dlp', 'entry_id': 'email', 'entry_name': 'email'}]


def test_live_guardrail_summary_contract():
    body = {'results': [], 'violations': {}, 'summary': {'total': 2, 'passed': 2, 'failed': 0}}
    assert remote.parse_response(body, 'guardrail', ['a', 'b']) == ([], 0)
    for summary in ({'total': 1, 'passed': 1, 'failed': 0}, {'total': 2, 'passed': 1, 'failed': 1},
                    {'total': 2, 'passed': 0, 'failed': 0}):
        with pytest.raises(remote.DetectionError):
            remote.parse_response({**body, 'summary': summary}, 'guardrail', ['a', 'b'])


@pytest.mark.parametrize('body', [{}, {'detections': None}, {'detections': [], 'success': False},
    {'detections': [], 'errors': ['failed']}, {'detections': [{'pattern_id': 'unselected'}]},
    {'detections': [{'pattern_id': 'email', 'error': 'failed'}]},
    {'detections': [{'pattern_id': 'email', 'passed': True}]}])
def test_bad_response_fails_closed(monkeypatch, body):
    monkeypatch.setattr(remote, 'post_detection', lambda *args: body)
    evaluation, matched = evaluate_stage([policy()], 'input', {'user_prompt': 'hello'})
    assert decision(evaluation, matched, 'input') == 'validation_error'


def test_timeout_and_missing_key_never_pass(monkeypatch):
    monkeypatch.setattr(remote, 'post_detection', lambda *args: (_ for _ in ()).throw(httpx.ReadTimeout('secret')))
    evaluation, _ = evaluate_stage([policy()], 'input', {'user_prompt': 'hello'})
    assert evaluation['errors'] == ['detector_timeout']
    monkeypatch.setattr(config, 'DLP_DETECTION_API_KEY', '')
    evaluation, _ = evaluate_stage([policy()], 'input', {'user_prompt': 'hello'})
    assert evaluation['errors'] == ['detector_key_missing']


def test_only_matching_groups_can_reach_adapter(monkeypatch):
    from types import SimpleNamespace
    dlp, guard = policy(), policy('guardrail')
    unassigned = deepcopy(dlp)
    unassigned['scope']['group_ids'] = []
    db = SimpleNamespace(policies=SimpleNamespace(find=lambda query, **kwargs: [dlp, guard, unassigned]))
    calls = []
    monkeypatch.setattr(remote, 'post_detection', lambda url, *args: calls.append(url) or {'detections': []})
    for group_ids in ([], [ObjectId()]):
        resolved = resolve_policies(db, ObjectId(), ObjectId(), group_ids)
        assert resolved == []
        evaluate_stage(resolved, 'input', {'user_prompt': 'hello'})
    assert calls == []
    resolved = resolve_policies(db, ObjectId(), ObjectId(), dlp['scope']['group_ids'])
    evaluation, matched = evaluate_stage(resolved, 'input', {'user_prompt': 'hello'})
    assert calls == [remote.DLP_URL]
    assert decision(evaluation, matched, 'input') == 'allowed'


@pytest.mark.parametrize('status,body', [(302, '{}'), (500, '{}'), (200, 'not json'), (200, 'x' * 1_048_577)])
def test_transport_rejects_redirects_errors_and_bad_bodies(monkeypatch, status, body):
    original_client = httpx._client.Client
    mock = httpx.MockTransport(lambda request: httpx.Response(status, text=body))
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original_client(transport=mock, **kwargs))
    evaluation, matched = evaluate_stage([policy()], 'input', {'user_prompt': 'hello'})
    assert decision(evaluation, matched, 'input') == 'validation_error'
