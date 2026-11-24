# Spec 09 — Bridge server (protected mode, worker side)

**Status:** Done
**Depends on:** Spec 08
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/bridge_server.py`, `backend/tests/unit/test_bridge_server.py`, `specs-promptfoo/inventory/09-bridge-server.md`
**Reuses:** `backend/promptfoo_bridge/provider.py`, `backend/app/workers/red_team_worker.py`, `backend/app/services/protected_prompt_service.py`

## Goal

A loopback HTTP server, started by the worker only for a protected run, that receives each promptfoo test prompt from the bridge provider (spec 08), executes it for real through `ProtectedPromptService.execute_protected` with the frozen policy snapshot, and returns the reply with the policy decision.

## Scope

- `BridgeServer(executor, is_cancelled, run_id)` with `start()` → `(url, token)`, `stop()` and `issued_run_ids()`.
  - Bind 127.0.0.1 port 0 only, threaded handler, fresh `secrets.token_urlsafe(32)` token, constant-time token comparison.
  - Body cap 256 KB; only `POST /attack`.
- Request validation per ARCHITECTURE "Bridge contract":
  - `run_id` must equal the server's; prompt 1–24000 chars; key a UUID; `session_id`, `plugin_id`, `strategy_id` strings ≤ 200 chars.
  - 400 on invalid input; 401 on a bad token; 409 when `is_cancelled()` is true (checked before execution).
- Idempotency (invariant 4): a completed result is cached in memory by key and returned without calling the executor again. Concurrent duplicates are serialised with a per-key lock. `ProtectedPromptService` also receives the key.
- `make_executor(db, test, snapshot, subject, provider_service)` builds the protected executor:
  - Call `ProtectedPromptService(db, provider_service).execute_protected` exactly like today's `red_team_worker._protected`: source `red_team`, frozen snapshot, empty `scenario_system`, the request's idempotency key, the subject context. Catch `RunOutcome`.
  - Status mapping:
    - `allowed` → output text;
    - `blocked_input`/`blocked_output` → output `[Blocked by policy: <policy names>]`, guardrails flags (`flagged_input` or `flagged_output`), and `policy_evidence`: a list of matched rule results whose field is not `system_prompt`, each `{field, outcome: "match", rule_id, policy_name}` (the shape spec 05 `decide` reads from `response.metadata`);
    - `validation_error`/`configuration_error`/`provider_error` → `error` from the run's `error_message`.
  - Always return `metadata` {decision, protected_run_id, policy_evidence}, token usage, latency and cost (`cost_service.estimate_result_cost`).
  - Every `protected_run_id` it returns is added to `issued_run_ids()`. Spec 05 trusts a policy verdict only for these.
- A rate-limited provider error → 429 "rate limit"; other provider errors → 200 with `error` set. Unexpected exceptions → 500 with a generic message, never a stack trace, key or prompt.

## Explicit non-scope

- Starting the server per job and passing `issued_run_ids` to the importer → spec 17.
- Raw-mode execution: promptfoo calls the model directly (spec 04).
- Grading → promptfoo's grader on the organization integration (spec 04).

## Reuse first

- Read `red_team_worker.py` `_protected` for the exact service call, snapshot fields and subject context; reuse `ProtectedPromptService`/`RunOutcome`, `ProviderError` and `estimate_result_cost`. Do not reimplement policy checks.

## Steps

1. Implement the server and `make_executor` with injected dependencies.
2. Test with the real spec 08 provider module calling the real server, with a fake protected service.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_bridge_server.py` passes: a bad token gets 401; a cancelled run gets 409 and the executor is not called; an allowed reply round-trips through `promptfoo_bridge.provider.call_api` with output, tokenUsage and metadata. [unit]
- [ ] Same file: a `blocked_input` fake run returns guardrails `flaggedInput`, policy evidence excluding `system_prompt` matches, and its run id appears in `issued_run_ids()`; a duplicate key returns the cached reply and the executor ran once, also under two concurrent requests. [unit]
- [ ] Same file: a rate-limited provider error → 429 and the provider sees "rate limit"; an unexpected exception → 500 without the prompt; the socket address is 127.0.0.1 and `stop()` closes it. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-23:** Implemented the authenticated loopback bridge and verified it through the real file provider. Focused bridge/runner suite: 8 passed; full backend unit: 481 passed; compile passed.
