from types import SimpleNamespace
import json

import httpx
import pytest

from app.services.provider_service import ProviderService, ProviderError
from app.validators.registry import registry


def test_registered_guardrails_keyword_and_pii_are_real_checks():
    keyword = {'rule_id': 'one', 'type': 'keyword', 'config': {'terms': ['Secret']}}
    assert registry.evaluate(keyword, 'A secret', 'user_prompt')['outcome'] == 'match'
    assert registry.evaluate(keyword, 'ordinary text', 'user_prompt')['outcome'] == 'pass'
    pii = {'rule_id': 'two', 'type': 'pii', 'config': {
        'entities': ['EMAIL_ADDRESS', 'CREDIT_CARD'], 'threshold': .8}}
    result = registry.evaluate(pii, 'alice@example.com and 4111 1111 1111 1111', 'sample')
    assert result['outcome'] == 'match'
    assert {item['kind'] for item in result['evidence']} == {'EMAIL_ADDRESS', 'CREDIT_CARD'}
    assert all('text' not in item for item in result['evidence'])


def test_pathological_regex_is_error_not_pass():
    rule = {'rule_id': 'r', 'type': 'regex', 'config': {'pattern': '(a+)+$'}}
    assert registry.evaluate(rule, 'a' * 10000 + '!', 'sample')['outcome'] == 'error'


def test_provider_request_shapes_and_bounded_errors():
    captured = []

    def handler(request):
        captured.append((str(request.url), json.loads(request.content)))
        if 'generativelanguage' in str(request.url):
            return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'Gemini reply'}]}, 'finishReason': 'STOP'}]})
        return httpx.Response(200, json={'choices': [{'message': {'content': 'OpenAI reply'}, 'finish_reason': 'stop'}],
                                         'usage': {'prompt_tokens': 3, 'completion_tokens': 4}})

    service = ProviderService(httpx.MockTransport(handler))
    payload = SimpleNamespace(model='gpt-5-test', prompt='hello', temperature=.2, max_tokens=40)
    integration = {'provider': 'openai', 'system_prompt': 'Server instruction'}
    assert service.execute(integration, payload, 'request').response_text == 'OpenAI reply'
    body = captured[-1][1]
    assert body['messages'][0]['role'] == 'developer'
    assert body['max_completion_tokens'] == 40 and 'temperature' not in body
    payload.model = 'gemini-test'
    integration['provider'] = 'gemini'
    assert service.execute(integration, payload, 'request').response_text == 'Gemini reply'
    assert captured[-1][1]['systemInstruction']['parts'][0]['text'] == 'Server instruction'
    assert captured[-1][1]['contents'][0]['parts'][0]['text'] == 'hello'

    failing = ProviderService(httpx.MockTransport(lambda request: httpx.Response(401, text='SECRET RAW BODY')))
    try:
        failing.execute({'provider': 'openai', 'system_prompt': ''}, payload, 'request')
    except ProviderError as error:
        assert error.code == 'authentication' and 'SECRET' not in error.message


@pytest.mark.parametrize(('response', 'expected'), [
    (httpx.Response(429, headers={'Retry-After': '999'}, text='private quota message'), 'rate_limited'),
    (httpx.Response(200, text='not json'), 'invalid_response'),
])
def test_provider_errors_do_not_forward_raw_bodies(response, expected):
    service = ProviderService(httpx.MockTransport(lambda request: response))
    payload = SimpleNamespace(model='test-model', prompt='hello', temperature=.2, max_tokens=20)
    with pytest.raises(ProviderError) as raised:
        service.execute({'provider': 'openai', 'system_prompt': ''}, payload, 'request')
    assert raised.value.code == expected and 'private' not in raised.value.message
    if expected == 'rate_limited':
        assert raised.value.retry_after == 300


def test_provider_timeout_is_safe_and_not_retried():
    calls = []

    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout('private endpoint details')

    service = ProviderService(httpx.MockTransport(timeout))
    payload = SimpleNamespace(model='test-model', prompt='hello', temperature=.2, max_tokens=20)
    with pytest.raises(ProviderError) as raised:
        service.execute({'provider': 'openai', 'system_prompt': ''}, payload, 'request')
    assert raised.value.code == 'timeout' and len(calls) == 1
    assert 'private' not in raised.value.message
