# Spec 08 — Bridge provider (promptfoo side)

**Status:** In progress
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/promptfoo_bridge/__init__.py`, `backend/promptfoo_bridge/provider.py`, `backend/tests/unit/test_promptfoo_bridge_provider.py`, `specs-promptfoo/inventory/08-bridge-provider.md`
**Reuses:** `backend/app/services/provider_service.py`, `INVENTORY.md#provider-and-guardrail-services`

## Goal

The Python file promptfoo loads as its red-team target. For every attack promptfoo sends, it forwards the prompt to the worker's loopback bridge (spec 09) and returns the bridge's answer in promptfoo's provider response shape, so each real attack is executed by the app.

## Scope

- `call_api(prompt, options, context)` is the function promptfoo calls (research `promptfoo-integration.md` §1a). It reads `options["config"]` {url, token, run_id, timeout_seconds} and from `context`: `test.metadata.pluginId`, `test.metadata.strategyId` (default `basic`), `testIdx`/`test_idx`, `repeatIndex` (default 0) — handle both the documented and the observed key spellings and record which ones 0.126.0 sends in the Log.
- It POSTs JSON to `<url>/attack` per ARCHITECTURE "Bridge contract" with `Authorization: Bearer <token>`, using only the standard library (`urllib.request`, `json`, `hashlib`, `uuid`). It must not import `app` or any third-party package; the module is loaded by promptfoo's own Python process.
- `idempotency_key` = uuid5 over run id, test index, repeat index and the SHA-256 of the prompt, so promptfoo retries of the same call reuse the key and every turn of a multi-turn strategy (different prompt) gets a new one.
- Response mapping: bridge `output` → `output`; `token_usage` → `tokenUsage` {prompt, completion, total}; `cost`; `latency_ms` → `latencyMs`; `guardrails` → `guardrails` {flagged, flaggedInput, flaggedOutput, reason} when present (research §1a: guardrails is the documented place for a block); `metadata` passed through.
- Errors: HTTP 429 → `{"error": "Bridge rate limit: <detail>"}` (the words "rate limit" make promptfoo retry, research §1); 409 → `{"error": "Run cancelled"}`; 401 → `{"error": "Bridge authentication failed"}`; connection error or timeout → `{"error": "Bridge unavailable"}`; bad JSON → `{"error": "Bridge returned an invalid response"}`. Never include the token or prompt in an error.

## Explicit non-scope

- The server that executes attacks → spec 09.
- Building the promptfoo target entry that points here → spec 04.

## Reuse first

- Mirror the response vocabulary of `ProviderService` results (`backend/app/services/provider_service.py`) so spec 09 can pass values through unchanged; do not import it.

## Steps

1. Confirm the `call_api` signature and context keys against `docs/research/promptfoo-integration.md` §1a and the installed package's Python wrapper under `node_modules/promptfoo` if spec 01 has run.
2. Implement the module; keep `__init__.py` empty of side effects.
3. Test against a stub `http.server` started on 127.0.0.1:0 inside the test.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_bridge_provider.py` passes: success maps output, tokenUsage, cost, latencyMs and metadata; a blocked reply maps `guardrails`; the stub received the bearer token and all contract fields. [unit]
- [ ] Same file: 429 yields an error containing "rate limit"; 409 "Run cancelled"; 401 and invalid JSON map as specified; a refused connection yields "Bridge unavailable" within the timeout. [unit]
- [ ] Same file: the idempotency key is identical for two calls with the same prompt and indices and different when the prompt or repeat index changes. [unit]
- [ ] Same file: importing `promptfoo_bridge.provider` in a subprocess with `-I` and only the backend folder on `sys.path` imports no `app` module (checked via `sys.modules`). [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app promptfoo_bridge` passes. [static]

## Log

### 2026-11-22 — Local fixture scope

- Implemented the local Promptfoo Python provider as a fixed response table. The same support case succeeds in both modes. The banner case returns a synthetic marker in raw mode and the expected private-banner response in protected mode. Unknown modes and prompts fail with fixed error messages. There is no HTTP transport, arbitrary target input, or app import. Live bridge acceptance remains open.
- Confirmed `call_api(prompt, options, context)` in the installed 0.126.0 `dist/src/python/persistent_wrapper.py` and verified the provider worker selects that callable by default, passes the provider options, and validates the `output`/`error` response in `dist/src/providers-BROlDdDc.js`.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit/test_promptfoo_bridge_provider.py` returned **8 passed**. `.venv/bin/python -m pytest -q tests/unit` returned **606 passed, 8 warnings**. `.venv/bin/python -m compileall -q app promptfoo_bridge` exited **0**. No MongoDB criterion in this spec.
