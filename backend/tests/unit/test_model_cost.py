from decimal import Decimal

import litellm
import pytest

from app.services.cost_service import estimate_cost
from app.services.provider_service import ProviderService


@pytest.fixture
def pricing(monkeypatch):
    monkeypatch.setitem(litellm.model_cost, 'gpt-cost-test', {
        'litellm_provider': 'openai', 'mode': 'chat',
        'input_cost_per_token': 0.000002, 'output_cost_per_token': 0.000006,
        'cache_read_input_token_cost': 0.000001,
        'max_tokens': 4096, 'max_input_tokens': 4096, 'max_output_tokens': 4096})
    return 'gpt-cost-test'


def test_automatic_response_cost_and_cached_input(pricing):
    result = estimate_cost(pricing, [], 1000, 100, provider='openai')
    assert Decimal(result['estimated_cost_usd']) == Decimal('0.0026')
    assert result['cost_status'] == 'known' and result['cost_source'] == 'litellm'
    assert result['pricing_snapshot']['rates']['input_cost_per_token'] == 0.000002
    cached = estimate_cost(pricing, [], 1000, 100, provider='openai',
                           usage_details={'prompt_tokens_details': {'cached_tokens': 500}})
    assert Decimal(cached['estimated_cost_usd']) == Decimal('0.0021')


def test_configured_price_wins_and_zero_is_valid(pricing):
    custom = [{'model': pricing, 'input_usd_per_million': '0', 'output_usd_per_million': '0'}]
    result = estimate_cost(pricing, custom, 1000, 100, provider='openai')
    assert result['estimated_cost_usd'] == '0' and result['cost_source'] == 'configured'
    assert estimate_cost(pricing, custom, 1000, None)['cost_status'] == 'partial'


@pytest.mark.parametrize('provider,model,prompt,output', [
    ('openai', 'not-a-real-model-123456789', 10, 5),
    ('openai', 'gpt-4o-mini', None, 5),
    ('openai', 'gpt-4o-mini', 10, None),
    ('ollama', 'gpt-4o-mini', 10, 5),
])
def test_unknown_is_not_reported_as_free(provider, model, prompt, output):
    result = estimate_cost(model, [], prompt, output, provider=provider)
    assert result['estimated_cost_usd'] is None and result['cost_status'] == 'unknown'


def test_pricing_failure_does_not_break_generation(pricing, monkeypatch):
    def fail(**kwargs):
        raise RuntimeError('pricing unavailable')
    monkeypatch.setattr(litellm, 'completion_cost', fail)
    assert estimate_cost(pricing, [], 10, 5, provider='openai')['cost_status'] == 'unknown'
    assert estimate_cost(pricing, [], None, None, called=False)['cost_status'] == 'not_incurred'


@pytest.mark.parametrize('provider,model', [
    ('openai', 'gpt-4o-mini'), ('anthropic', 'claude-sonnet-4-20250514'),
    ('gemini', 'gemini-2.5-flash'), ('groq', 'llama-3.3-70b-versatile'),
    ('deepseek', 'deepseek-chat'),
])
def test_supported_provider_catalogs(provider, model):
    result = estimate_cost(model, [], 1000, 100, provider=provider)
    assert result['cost_status'] == 'known'
    assert Decimal(result['estimated_cost_usd']) > 0


def test_normalization_includes_anthropic_cache_and_gemini_thinking():
    anthropic = ProviderService.normalize('anthropic', {'id': 'a', 'model': 'claude-test',
        'content': [{'type': 'text', 'text': 'answer'}],
        'usage': {'input_tokens': 10, 'output_tokens': 5,
                  'cache_read_input_tokens': 20, 'cache_creation_input_tokens': 30}})
    assert (anthropic.prompt_tokens, anthropic.completion_tokens, anthropic.total_tokens) == (60, 5, 65)
    assert anthropic.usage_details['cache_read_input_tokens'] == 20
    gemini = ProviderService.normalize('gemini', {'modelVersion': 'gemini-test',
        'candidates': [{'content': {'parts': [{'text': 'answer'}]}}],
        'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 5,
                          'thoughtsTokenCount': 20, 'totalTokenCount': 35, 'cachedContentTokenCount': 2}})
    assert (gemini.prompt_tokens, gemini.completion_tokens, gemini.total_tokens) == (10, 25, 35)
    assert gemini.usage_details['prompt_tokens_details']['cached_tokens'] == 2


def test_response_model_lookup_falls_back_to_requested_model(pricing):
    result = estimate_cost(pricing, [], 10, 5, provider='openai', response_model='unknown-revision')
    assert result['cost_status'] == 'known'
    assert result['pricing_snapshot']['model'] == pricing


def test_anthropic_cache_write_duration_changes_estimate():
    from app.services.cost_service import estimate_result_cost
    def calculate(duration):
        response = ProviderService.normalize('anthropic', {
            'content': [{'type': 'text', 'text': 'answer'}],
            'usage': {'input_tokens': 500, 'output_tokens': 100, 'cache_creation_input_tokens': 500,
                      'cache_creation': {f'ephemeral_{duration}_input_tokens': 500}}})
        return estimate_result_cost('claude-sonnet-4-20250514', [], 'anthropic', response)
    short, long = calculate('5m'), calculate('1h')
    assert short['cost_status'] == long['cost_status'] == 'known'
    assert Decimal(long['estimated_cost_usd']) > Decimal(short['estimated_cost_usd'])


@pytest.mark.parametrize('breakdown', [{}, {'ephemeral_5m_input_tokens': 0}])
def test_incomplete_cache_breakdown_keeps_total_write_tokens(breakdown):
    from app.services.cost_service import estimate_result_cost
    response = ProviderService.normalize('anthropic', {
        'content': [{'type': 'text', 'text': 'answer'}],
        'usage': {'input_tokens': 500, 'output_tokens': 100, 'cache_creation_input_tokens': 500,
                  'cache_creation': breakdown}})
    result = estimate_result_cost('claude-sonnet-4-20250514', [], 'anthropic', response)
    uncached = estimate_cost('claude-sonnet-4-20250514', [], 1000, 100, provider='anthropic')
    assert result['cost_status'] == 'known'
    assert Decimal(result['estimated_cost_usd']) > Decimal(uncached['estimated_cost_usd'])
