# Model-call cost estimates

Every successful provider call records the provider request ID (when available), prompt,
completion and total token counts, and an estimated USD cost. Output blocked by a policy
still incurs and records cost. Input rejected before dispatch remains `not_incurred` with
zero cost. An uncertain provider failure remains `unknown`, since it may have been billed.

Pricing precedence:

1. An integration's explicit `model_prices` entry overrides automatic pricing, including
   an intentionally configured zero rate. Rates are USD per million tokens.
2. Otherwise, `litellm.completion_cost` uses the provider's reported usage and model plus
   LiteLLM's pricing catalog. OpenAI, Anthropic, Gemini, Groq and DeepSeek are supported.
   The returned model revision is tried first, then the requested model.
3. Unsupported models, missing usage and pricing errors retain a null estimate and
   `unknown` status. Ollama requires custom prices to represent local infrastructure cost.

The existing bounded provider transport is retained. Cost calculation never issues another
completion, submits prompt/output text to LiteLLM, or changes DLP/Guardrail decisions.
No async event loop or global client shutdown is needed for this local calculation.

Cache reads/writes are included for Anthropic; cached input is included for compatible
providers and Gemini. Gemini thinking tokens are included in completion usage. Provider
service-tier metadata is forwarded when available. These are estimates, not invoices:
provider discounts, negotiated rates and billing adjustments may differ. Custom prices
are flat input/output rates and do not apply separate cache discounts.

Run metadata adds `cost_source` (`configured`, `litellm`, or null) and `pricing_snapshot`
(custom rates, or LiteLLM version, resolved model, provider, service tier and catalog rates).
Historical amounts are saved rather than recalculated on reads. Protected and raw red-team
runs both use their launch snapshot for custom prices. Automatic rates use the catalog
available at execution time; upgrading/refreshing LiteLLM can change estimates for future
runs. Existing history is not backfilled.

Spend aggregates workspace runs; red-team costs remain in red-team reports. The integration
editor explains automatic pricing and overrides. Prompt Studio displays the cost source.

Reference: https://docs.litellm.ai/docs/completion/token_usage
