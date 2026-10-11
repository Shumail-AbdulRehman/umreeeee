import json
from types import SimpleNamespace

import httpx
import pytest

from app.services.provider_service import ProviderService


@pytest.mark.parametrize('provider', ['openai', 'groq', 'deepseek', 'anthropic', 'gemini', 'ollama'])
def test_provider_translates_server_owned_conversation_turns(provider):
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        if provider == 'anthropic':
            body = {'content': [{'type': 'text', 'text': 'Reply'}]}
        elif provider == 'gemini':
            body = {'candidates': [{'content': {'parts': [{'text': 'Reply'}]}}]}
        elif provider == 'ollama':
            body = {'message': {'content': 'Reply'}}
        else:
            body = {'choices': [{'message': {'content': 'Reply'}}]}
        return httpx.Response(200, json=body)
    turns = [{'role': 'user', 'content': 'Remember blue'}, {'role': 'assistant', 'content': 'I remember'}]
    payload = SimpleNamespace(model='fake-model', prompt='What color?', max_tokens=20,
                              temperature=.2, conversation_messages=turns)
    integration = {'provider': provider, 'system_prompt': 'Be helpful', 'base_url': 'http://127.0.0.1:11434'}
    ProviderService(httpx.MockTransport(handler)).execute(integration, payload, 'synthetic')
    if provider == 'gemini':
        assert captured[0]['contents'] == [
            {'role': 'user', 'parts': [{'text': 'Remember blue'}]},
            {'role': 'model', 'parts': [{'text': 'I remember'}]},
            {'role': 'user', 'parts': [{'text': 'What color?'}]}]
    else:
        messages = captured[0]['messages']
        if provider != 'anthropic':
            assert messages.pop(0) == {'role': 'system', 'content': 'Be helpful'}
        assert messages == turns + [{'role': 'user', 'content': 'What color?'}]
