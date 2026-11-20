from urllib.parse import parse_qs, urlsplit

import pytest

from app.services import llm_integration_service


@pytest.mark.parametrize(('fetcher', 'args', 'payload', 'auth_header'), [
    ('fetch_openai_compatible_models', ('groq', 'fake-key'), {'data': []}, ('Authorization', 'Bearer fake-key')),
    ('fetch_gemini_models', ('fake-key',), {'models': []}, None),
    ('fetch_anthropic_models', ('fake-key',), {'data': []}, ('X-api-key', 'fake-key')),
    ('fetch_ollama_models', ('http://127.0.0.1:11434',), {'models': []}, None),
])
def test_model_discovery_sends_user_agent(monkeypatch, fetcher, args, payload, auth_header):
    service = llm_integration_service.LLMIntegrationService(None)
    requests = []

    def read_json_response(request):
        requests.append(request)
        return payload

    monkeypatch.setattr(service, 'read_json_response', read_json_response)
    monkeypatch.setattr(llm_integration_service, 'ALLOWED_OLLAMA_ORIGINS', ['http://127.0.0.1:11434'])

    getattr(service, fetcher)(*args)

    request, = requests
    assert request.get_header('User-agent') == llm_integration_service.DISCOVERY_USER_AGENT
    if auth_header:
        header, value = auth_header
        assert request.get_header(header) == value
    if fetcher == 'fetch_gemini_models':
        assert parse_qs(urlsplit(request.full_url).query)['key'] == ['fake-key']
