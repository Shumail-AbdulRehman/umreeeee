"""One bounded, non-retrying transport for all six providers. No raw payload logging."""
from dataclasses import dataclass
import json
from time import monotonic
from urllib.parse import quote

import httpx

from app.core.config import ALLOWED_OLLAMA_ORIGINS, PROVIDER_TIMEOUT_SECONDS
from app.core.encryption import decrypt_credential

ENDPOINTS = {'openai': 'https://api.openai.com/v1/chat/completions',
             'groq': 'https://api.groq.com/openai/v1/chat/completions',
             'deepseek': 'https://api.deepseek.com/chat/completions'}


@dataclass(repr=False)
class ProviderResult:
    response_text: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    provider_request_id: str | None = None
    finish_reason: str | None = None
    provider_latency_ms: float = 0
    usage_details: dict | None = None
    response_model: str | None = None
    service_tier: str | None = None


class ProviderError(Exception):
    def __init__(self, code, provider_status=None, retry_after=None):
        self.code = code
        self.provider_status = provider_status
        self.retryable = code in {'timeout', 'unavailable', 'rate_limited'}
        self.retry_after = retry_after
        self.message = {'authentication': 'Provider credentials were rejected. Ask an administrator to update the integration.',
            'rate_limited': 'Provider rate limit reached.', 'timeout': 'Provider timed out; generation may have incurred cost.',
            'unavailable': 'Provider is unavailable.', 'invalid_model': 'Model or generation settings are unsupported by the provider.',
            'invalid_response': 'Provider returned an unusable response.', 'unknown': 'Provider request failed.'}[code]
        super().__init__(self.message)


def token(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


class ProviderService:
    def __init__(self, transport=None):
        self.transport = transport

    def execute(self, integration, payload, request_id, admission=None):
        start = monotonic()
        if admission:
            db, company_id, integration_id, lease_token = admission
            from app.services.integration_admission import IntegrationAdmission
            if not IntegrationAdmission(db).verify(company_id, integration_id, lease_token):
                raise ProviderError('unavailable')
        provider, model = integration['provider'], payload.model
        system = integration.get('system_prompt', '')
        try:
            key = decrypt_credential(integration['api_key_ciphertext']) if integration.get('api_key_ciphertext') else ''
        except Exception as exc:
            raise ProviderError('authentication') from exc
        messages = ([{'role': 'system', 'content': system}] if system else []) + [{'role': 'user', 'content': payload.prompt}]
        headers = {'Content-Type': 'application/json'}
        if provider in ENDPOINTS:
            url = ENDPOINTS[provider]
            headers['Authorization'] = f'Bearer {key}'
            reasoning = provider == 'openai' and model.startswith(('o1', 'o3', 'o4', 'gpt-5', 'gpt-6'))
            if reasoning and system:
                messages[0]['role'] = 'developer'
            body = {'model': model, 'messages': messages}
            body['max_completion_tokens' if provider == 'openai' else 'max_tokens'] = payload.max_tokens
            if payload.temperature is not None and not reasoning:
                body['temperature'] = payload.temperature
        elif provider == 'anthropic':
            url = 'https://api.anthropic.com/v1/messages'
            headers.update({'x-api-key': key, 'anthropic-version': '2023-06-01'})
            body = {'model': model, 'messages': [{'role': 'user', 'content': payload.prompt}], 'max_tokens': payload.max_tokens or 1024}
            if system:
                body['system'] = system
            if payload.temperature is not None:
                body['temperature'] = payload.temperature
        elif provider == 'gemini':
            url = f'https://generativelanguage.googleapis.com/v1beta/models/{quote(model.removeprefix("models/"), safe="")}:generateContent'
            headers['x-goog-api-key'] = key
            body = {'contents': [{'role': 'user', 'parts': [{'text': payload.prompt}]}],
                    'generationConfig': {'maxOutputTokens': payload.max_tokens}}
            if payload.temperature is not None:
                body['generationConfig']['temperature'] = payload.temperature
            if system:
                body['systemInstruction'] = {'parts': [{'text': system}]}
        elif provider == 'ollama':
            origin = (integration.get('base_url') or '').rstrip('/')
            if origin not in ALLOWED_OLLAMA_ORIGINS:
                raise ProviderError('invalid_model')
            url = origin + '/api/chat'
            body = {'model': model, 'messages': messages, 'stream': False,
                    'options': {'num_predict': payload.max_tokens}}
            if payload.temperature is not None:
                body['options']['temperature'] = payload.temperature
        else:
            raise ProviderError('invalid_model')
        try:
            # A read timeout also bounds a single stalled chunk; the elapsed check bounds trickling bodies.
            with httpx.Client(timeout=httpx.Timeout(PROVIDER_TIMEOUT_SECONDS, connect=5),
                              follow_redirects=False, transport=self.transport, trust_env=False) as client:
                with client.stream('POST', url, headers=headers, json=body) as response:
                    if response.status_code >= 300:
                        code = {400: 'invalid_model', 401: 'authentication', 403: 'authentication',
                                404: 'invalid_model', 429: 'rate_limited'}.get(response.status_code, 'unavailable')
                        retry = response.headers.get('retry-after', '')
                        raise ProviderError(code, response.status_code, min(300, int(retry)) if retry.isdigit() else None)
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        if monotonic() - start > PROVIDER_TIMEOUT_SECONDS:
                            raise ProviderError('timeout')
                        raw.extend(chunk)
                        if len(raw) > 2_000_000:
                            raise ProviderError('invalid_response')
                    data = json.loads(raw)
                    result = self.normalize(provider, data)
                    result.provider_request_id = response.headers.get('x-request-id', result.provider_request_id)
                    result.provider_latency_ms = round((monotonic() - start) * 1000, 3)
                    return result
        except httpx.TimeoutException as exc:
            raise ProviderError('timeout') from exc
        except httpx.HTTPError as exc:
            raise ProviderError('unavailable') from exc
        except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
            raise ProviderError('invalid_response') from exc

    @staticmethod
    def normalize(provider, data):
        if provider in ENDPOINTS:
            choice = data['choices'][0]
            text = choice['message']['content']
            usage = data.get('usage') or {}
            a, b, total = usage.get('prompt_tokens'), usage.get('completion_tokens'), usage.get('total_tokens')
            finish, rid = choice.get('finish_reason'), data.get('id')
        elif provider == 'anthropic':
            text = ''.join(p['text'] for p in data['content'] if p.get('type') == 'text')
            usage = data.get('usage') or {}
            a, b = usage.get('input_tokens'), usage.get('output_tokens')
            total, finish, rid = None, data.get('stop_reason'), data.get('id')
        elif provider == 'gemini':
            candidate = data['candidates'][0]
            text = ''.join(p['text'] for p in candidate['content']['parts'] if 'text' in p and not p.get('thought'))
            usage = data.get('usageMetadata') or {}
            a, b, total = usage.get('promptTokenCount'), usage.get('candidatesTokenCount'), usage.get('totalTokenCount')
            finish, rid = candidate.get('finishReason'), data.get('responseId')
        else:
            text = data['message']['content']
            a, b, total = data.get('prompt_eval_count'), data.get('eval_count'), None
            finish, rid = data.get('done_reason'), None
        if not isinstance(text, str) or not text or len(text) > 24000:
            raise ProviderError('invalid_response')
        a, b, total = token(a), token(b), token(total)
        details = {}
        if provider in ENDPOINTS:
            for field in ('prompt_tokens_details', 'completion_tokens_details'):
                values = usage.get(field)
                if isinstance(values, dict):
                    details[field] = {k: v for k, v in values.items()
                                      if k in {'cached_tokens', 'reasoning_tokens', 'audio_tokens', 'text_tokens'}
                                      and token(v) is not None}
            if provider == 'deepseek' and token(usage.get('prompt_cache_hit_tokens')) is not None:
                details['prompt_tokens_details'] = {'cached_tokens': usage['prompt_cache_hit_tokens']}
        elif provider == 'anthropic':
            # Anthropic's input_tokens excludes both cache reads and cache writes.
            for field in ('cache_read_input_tokens', 'cache_creation_input_tokens'):
                if token(usage.get(field)) is not None:
                    details[field] = usage[field]
                    if a is not None:
                        a += usage[field]
            creation = usage.get('cache_creation')
            if isinstance(creation, dict):
                breakdown = {k: v for k, v in creation.items()
                    if k in {'ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'} and token(v) is not None}
                if breakdown and sum(breakdown.values()) == details.get('cache_creation_input_tokens', 0):
                    details['prompt_tokens_details'] = {'cached_tokens': details.get('cache_read_input_tokens', 0),
                        'cache_creation_tokens': details.get('cache_creation_input_tokens', 0),
                        'cache_creation_token_details': breakdown}
        elif provider == 'gemini':
            cached = token(usage.get('cachedContentTokenCount'))
            if cached is not None:
                details['prompt_tokens_details'] = {'cached_tokens': cached}
            thoughts = token(usage.get('thoughtsTokenCount'))
            if thoughts is not None and b is not None:
                b += thoughts
                details['completion_tokens_details'] = {'reasoning_tokens': thoughts}
        if total is None and a is not None and b is not None:
            total = a + b
        response_model = data.get('modelVersion') if provider == 'gemini' else data.get('model')
        tier = data.get('service_tier') or (usage.get('service_tier') if provider == 'anthropic' else None)
        return ProviderResult(text, a, b, total, str(rid)[:200] if rid else None,
                              str(finish)[:100] if finish else None, usage_details=details,
                              response_model=response_model[:200] if isinstance(response_model, str) else None,
                              service_tier=tier[:80] if isinstance(tier, str) else None)
