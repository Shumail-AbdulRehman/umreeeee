import json
from types import SimpleNamespace

import httpx
import pytest

from app.services import provider_service
from app.services.provider_service import ProviderError, ProviderService


def provider_error(provider, response, **integration):
    service = ProviderService(transport=httpx.MockTransport(lambda request: response))
    payload = SimpleNamespace(model='test-model', prompt='hello', temperature=None, max_tokens=20)
    with pytest.raises(ProviderError) as raised:
        service.execute({'provider': provider, **integration}, payload, 'request')
    return raised.value


def test_gemini_rate_limit_reports_quota_identifier():
    quota_id = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
    error = provider_error('gemini', httpx.Response(429, headers={'Retry-After': '42'}, json={'error': {
        'status': 'RESOURCE_EXHAUSTED',
        'details': [{'violations': [{'quotaId': quota_id}, {'quotaId': 'second-quota'}]}],
    }}))

    assert (error.code, error.provider_status, error.retry_after) == ('rate_limited', 429, 42)
    assert error.retryable
    assert error.detail == f'RESOURCE_EXHAUSTED: {quota_id}'
    assert quota_id in error.message and 'second-quota' not in error.message


def test_groq_authentication_reports_type_without_free_text():
    fake_key = 'gsk_test_not_a_real_api_key'
    private_message = 'Private message with provider credentials ' * 30
    error = provider_error('groq', httpx.Response(401, json={'error': {
        'type': 'invalid_api_key', 'message': private_message + fake_key, 'param': fake_key,
    }}))

    assert (error.code, error.provider_status, error.retryable) == ('authentication', 401, False)
    assert error.message.endswith(' (invalid_api_key)')
    assert fake_key not in error.message and 'Private message' not in error.message


def test_error_detail_drops_echoed_api_key(monkeypatch):
    fake_key = 'sk-test-not-a-real-api-key'
    monkeypatch.setattr(provider_service, 'decrypt_credential', lambda ciphertext: fake_key)
    error = provider_error('openai', httpx.Response(401, json={'error': {'code': fake_key}}),
                           api_key_ciphertext='fake-ciphertext')

    assert error.code == 'authentication' and error.detail is None
    assert fake_key not in error.message


def test_rate_limit_with_non_json_body_keeps_original_message():
    error = provider_error('openai', httpx.Response(429, headers={'Retry-After': '999'}, text='private body'))

    assert error.code == 'rate_limited' and error.retry_after == 300
    assert error.message == 'Provider rate limit reached.' and error.detail is None


def test_error_detail_reads_at_most_one_8_kib_prefix():
    received = []
    body = json.dumps({'error': {'type': 'overloaded_error'}}).encode().ljust(8192)

    class ErrorStream(httpx.SyncByteStream):
        def __iter__(self):
            received.append(len(body))
            yield body
            received.append(1)
            yield b'x'

    error = provider_error('anthropic', httpx.Response(503, stream=ErrorStream()))

    assert received == [8192]
    assert error.code == 'unavailable' and error.detail == 'overloaded_error'


def test_error_detail_read_failure_keeps_status_mapping():
    class ErrorStream(httpx.SyncByteStream):
        def __iter__(self):
            raise httpx.ReadTimeout('private endpoint details')

    error = provider_error('openai', httpx.Response(429, stream=ErrorStream()))

    assert error.code == 'rate_limited' and error.retry_after is None
    assert error.message == 'Provider rate limit reached.'


def test_error_detail_allowlist_whitespace_and_length():
    detail = '  code   [value] ' + 'x' * 130
    error = ProviderError('unknown', detail=detail)

    assert error.detail == 'code value ' + 'x' * 109
    assert str(error) == f'Provider request failed. ({error.detail})'
    assert ProviderError('unknown', detail='!#').message == 'Provider request failed.'


@pytest.mark.parametrize('content', ['', None])
def test_empty_provider_reply_includes_finish_reason(content):
    error = provider_error('openai', httpx.Response(200, json={
        'choices': [{'message': {'content': content}, 'finish_reason': 'length'}],
    }))

    assert error.code == 'invalid_response'
    assert 'finish_reason=length' in error.message
