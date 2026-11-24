# Spec 08 — Bridge provider (protected mode, promptfoo side)

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/promptfoo_bridge/__init__.py`, `backend/promptfoo_bridge/provider.py`, `backend/tests/unit/test_promptfoo_bridge_provider.py`, `specs-promptfoo/inventory/08-bridge-provider.md`
**Reuses:** `backend/app/services/provider_service.py`, `docs/research/promptfoo-integration.md`

## Goal

The Python file promptfoo loads as the target in **protected** mode. It forwards each test prompt to the worker's loopback bridge (spec 09) and returns the bridge's answer in promptfoo's provider response shape, so the policy pipeline evaluates each test prompt. Raw mode does not use this file; it uses promptfoo's built-in provider, as the scheduler does.

## Scope

- Replace the committed canned-response table entirely; the demo prompts and fixed answers must not survive.
- `call_api(prompt, options, context)`. Signature confirmed in 0.126.0 `dist/src/python/persistent_wrapper.py`. It reads `options["config"]` {url, token, run_id, timeout_seconds} and, from `context["vars"]`, `sessionId` (set by the config's `transformVars`, spec 04). It reads `pluginId`/`strategyId` from the test metadata promptfoo passes in `context` (default `basic`). Record in the Log which context keys 0.126.0 actually sends.
- It POSTs JSON to `<url>/attack` per ARCHITECTURE "Bridge contract" with `Authorization: Bearer <token>`, using only the standard library (`urllib.request`, `json`, `hashlib`, `uuid`). It must not import `app` or any third-party package.
- `idempotency_key` = uuid5 over run id, session id and the SHA-256 of the prompt. When `sessionId` is absent, use run id and prompt hash only, and note that degradation in the Log.
- Response mapping: `output` → `output`; `token_usage` → `tokenUsage` {prompt, completion, total}; `cost`; `latency_ms` → `latencyMs`; `guardrails` → {flagged, flaggedInput, flaggedOutput, reason} when present; `metadata` {decision, protected_run_id, policy_evidence} passed through unchanged. promptfoo copies it into the result row for spec 05.
- Errors:
  - 429 → `{"error": "Bridge rate limit: <detail>"}`;
  - 409 → `{"error": "Run cancelled"}`; 401 → `{"error": "Bridge authentication failed"}`;
  - 400 → `{"error": "Bridge rejected the request"}`;
  - connection error or timeout → `{"error": "Bridge unavailable"}`;
  - bad JSON → `{"error": "Bridge returned an invalid response"}`.
  - Never include the token or prompt in an error.

## Explicit non-scope

- The server that evaluates test prompts → spec 09.
- Building the target entry that points here → spec 04.

## Reuse first

- Mirror the result vocabulary of `ProviderService` (`provider_service.py`) and the response keys in `docs/research/promptfoo-integration.md` §1a; do not import them.

## Steps

1. Confirm the `call_api` context keys against the installed package.
2. Implement the module; keep `__init__.py` free of side effects.
3. Test against a stub `http.server` started on 127.0.0.1:0 inside the test.

## Done when

- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_bridge_provider.py` passes: success maps output, tokenUsage, cost, latencyMs and metadata; a blocked reply maps `guardrails`; the stub received the bearer token and every contract field including `session_id`. [unit]
- [x] Same file: 429 yields an error containing "rate limit"; 409, 401, 400 and invalid JSON map as specified; a refused connection yields "Bridge unavailable" within the timeout. [unit]
- [x] Same file: the idempotency key is identical for two calls with the same prompt and session and different when either changes. [unit]
- [x] Same file: importing `promptfoo_bridge.provider` in a subprocess with `-I` and only the backend folder on `sys.path` loads no `app` module. [unit]
- [x] `grep -n "demo\|DEMO_ONLY\|fixture" backend/promptfoo_bridge/provider.py` returns nothing. [static]
- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `cd backend && .venv/bin/python -m compileall -q app promptfoo_bridge` passes. [static]

## Log

- **2026-11-22**: A canned-response provider was committed (`11d6ff8`); it does not meet this spec and is replaced. `call_api(prompt, options, context)` was confirmed in `persistent_wrapper.py`.
- **2026-11-22**: Planner rewrite: protected mode only; session id from the scheduler's `transformVars`; decision metadata travels through promptfoo's result rows.
- **2026-11-23**: Replaced the canned provider with the authenticated loopback client in `backend/promptfoo_bridge/provider.py` and replaced the old provider tests with loopback HTTP stub tests. The package initializer remains a docstring and the spec inventory records the provider entry point.
- **2026-11-23**: Verified the installed promptfoo 0.126.0 package. `dist/src/evaluator-5tUcjTs8.js` applies `transformVars` with `context.uuid` and builds the target context with `vars`, `prompt`, `test`, `repeatIndex` and `testIdx`. It may add `bustCache`, `evaluationId`, `traceparent` and `testCaseId`. `dist/src/providers-BROlDdDc.js` strips `getCache`, `logger`, `filters` and `originalProvider` and sends `[prompt, options, context]` to `dist/src/python/persistent_wrapper.py`. The provider reads `context.vars.sessionId` and `context.test.metadata`. The evaluator stores the provider response and merges its metadata into the result row.
- **2026-11-23**: Missing `sessionId` sends an empty `session_id` and derives UUID5 from the run ID and the prompt's SHA-256 alone. Identical prompts in the same run with no session ID therefore share a key. Missing strategy metadata uses `basic` and missing plugin metadata sends an empty string.
- **2026-11-23**: `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_bridge_provider.py` passed with **21 tests**. `cd backend && .venv/bin/python -m pytest -q tests/unit` passed with **633 tests**, zero failures and eight pre-existing deprecation warnings. `cd backend && .venv/bin/python -m compileall -q app promptfoo_bridge` passed. The specified `grep` returned no matches. The tests used a loopback stub and covered all spec 08 checks. Runtime integration uses the config builder and server owned by specs 04 and 09.
- **2026-11-23** (lead review, Claude): the protected-mode provider is implemented in the working tree (canned table gone). Verified: stdlib only (`hashlib`, `json`, `uuid`, `urllib`, `http.client`); importing it under `-I` with only the backend on `sys.path` loads no `app` module; it POSTs to `127.0.0.1` only, maps output/tokenUsage/cost/latencyMs/metadata/guardrails, maps 429/409/401/400/connection/bad-JSON errors and redacts token and prompt; idempotency key is uuid5 over run id, session id and prompt hash. 21 tests pass; compileall exit 0.
