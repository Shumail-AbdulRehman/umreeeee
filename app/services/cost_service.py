"""Best-effort USD estimates. Pricing failure must never fail a model call."""
from decimal import Decimal
from importlib.metadata import version


def estimate_cost(model, prices, prompt_tokens, completion_tokens, called=True, *,
                  provider=None, usage_details=None, response_model=None, service_tier=None):
    if not called:
        return {'estimated_cost_usd': '0', 'cost_status': 'not_incurred',
                'pricing_snapshot': None, 'cost_source': None}
    unknown = {'estimated_cost_usd': None, 'cost_status': 'unknown',
               'pricing_snapshot': None, 'cost_source': None}
    price = next((p for p in prices if p['model'] == model), None)
    if price:
        parts = [(prompt_tokens, price.get('input_usd_per_million')),
                 (completion_tokens, price.get('output_usd_per_million'))]
        known = [Decimal(tokens) * Decimal(rate) / Decimal(1000000)
                 for tokens, rate in parts if tokens is not None and rate is not None]
        return {'estimated_cost_usd': str(sum(known, Decimal(0))) if known else None,
                'cost_status': 'known' if len(known) == 2 else 'partial' if known else 'unknown',
                'pricing_snapshot': price, 'cost_source': 'configured'}
    # Local inference has no provider token bill; infrastructure costs require an override.
    # Never let LiteLLM guess missing usage from text or default it to zero.
    if provider not in {'openai', 'anthropic', 'gemini', 'groq', 'deepseek'} or any(
            not isinstance(n, int) or isinstance(n, bool) or n < 0
            for n in (prompt_tokens, completion_tokens)):
        return unknown
    try:
        import litellm
        usage = {**(usage_details or {}), 'prompt_tokens': prompt_tokens,
                 'completion_tokens': completion_tokens, 'total_tokens': prompt_tokens + completion_tokens}
        # Only metadata is passed to the calculator: no prompt, output, or credentials.
        for priced_model in dict.fromkeys((response_model, model)):
            if not priced_model:
                continue
            priced_model = priced_model.removeprefix('models/') if provider == 'gemini' else priced_model
            try:
                info = litellm.get_model_info(model=priced_model, custom_llm_provider=provider)
                amount = litellm.completion_cost(
                    completion_response={'model': priced_model, 'usage': usage},
                    model=priced_model, custom_llm_provider=provider, service_tier=service_tier)
                amount = Decimal(format(amount, '.12g'))
                if not amount.is_finite() or amount < 0:
                    continue
                snapshot = {'source': 'litellm', 'version': version('litellm'),
                            'model': priced_model, 'provider': provider, 'service_tier': service_tier,
                            'rates': {key: value for key, value in info.items()
                                      if 'cost' in key and isinstance(value, (int, float))}}
                return {'estimated_cost_usd': format(amount, 'f'), 'cost_status': 'known',
                        'pricing_snapshot': snapshot, 'cost_source': 'litellm'}
            except Exception:
                continue
    except Exception:
        pass
    return unknown


def estimate_result_cost(model, prices, provider, result):
    return estimate_cost(model, prices, result.prompt_tokens, result.completion_tokens,
                         provider=provider, usage_details=result.usage_details,
                         response_model=result.response_model, service_tier=result.service_tier)
