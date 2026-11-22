# Spec 09 — Bridge server (worker side)

**Status:** Not started
**Depends on:** Spec 08
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/bridge_server.py`, `backend/tests/unit/test_bridge_server.py`, `specs-promptfoo/inventory/09-bridge-server.md`
**Reuses:** `backend/promptfoo_bridge/provider.py`, `backend/app/workers/red_team_worker.py`, `backend/app/services/integration_admission.py`

## Goal

A loopback HTTP server, started by the worker for one run, that receives each promptfoo attack from the bridge provider (spec 08), executes it for real against the test's target — raw through `ProviderService`, protected through `ProtectedPromptService.execute_protected` — records the execution, and returns the reply.

## Scope

- `BridgeServer(executor, recorder, is_cancelled, run_id)` with `start()` → `(url, token)` and `stop()`. Bind `127.0.0.1` port 0 only, threaded handler, fresh `secrets.token_urlsafe(32)` token per run, constant-time token comparison, request body cap 256 KB, only `POST /attack`.
- Request validation per ARCHITECTURE "Bridge contract": `run_id` must equal the server's, `test_idx`/`repeat_index` non-negative integers, prompt 1-24000 chars, key a UUID. 400 on invalid input, 401 on a bad token, 409 when `is_cancelled()` is true (checked before execution).
- Idempotency: before executing, look up the key via `recorder.find(key)`; a recorded completed execution is returned as-is without calling the target again (promptfoo retries, invariant 4). Concurrent duplicates of the same key are serialised with a per-key lock.
- Execution goes through the injected `executor(request)`; the worker (spec 17) supplies `make_executor(db, test, snapshot, subject, provider_service)` from this module:
  - raw: acquire `IntegrationAdmission` for the target integration (on `AdmissionUnavailable` wait `retry_after` and retry until 120 s total, then answer 429 "rate limit"), build the request like today's `red_team_worker._raw` (frozen temperature, max tokens and the frozen system instruction only — there is no scenario text in promptfoo runs), call `ProviderService.execute` with the admission tuple, release admission in `finally`, estimate cost with `cost_service.estimate_result_cost`.
  - protected: call `ProtectedPromptService(db, provider).execute_protected` like today's `_protected` with source `red_team`, the frozen snapshot, `scenario_system` empty, the request's idempotency key, and the subject context; catch `RunOutcome`. Map status `allowed` → output text; `blocked_input`/`blocked_output` → output `[Blocked by policy: <policy names>]` plus guardrails flags and `policy_evidence` (matched rule results whose field is not `system_prompt`); `validation_error`/`configuration_error`/`provider_error` → error text from the run's `error_message`.
- `recorder.record(request, result)` is called once per executed key with: test index, repeat index, plugin, strategy, prompt, reply, decision, prevention stage, policy evidence, latency, tokens, cost, protected run id. The recorder (spec 17) encrypts and upserts; this module stores nothing itself.
- `ProviderError` with code `rate_limited` → 429 "rate limit"; other provider errors → 200 with `error` set (promptfoo records an errored test). Unexpected exceptions → 500 with a generic message; never return stack traces, keys or the prompt.

## Explicit non-scope

- Starting the server per job, the Mongo recorder and lease handling → spec 17.
- Grading replies → spec 05 (promptfoo's grader) and spec 17 (applies verdicts).

## Reuse first

- Read `backend/app/workers/red_team_worker.py` `_raw`, `_protected`, `_keep_alive` for the exact service calls, admission handling and snapshot fields; reuse the services, do not reimplement provider calls or policy checks.
- `IntegrationAdmission` (`backend/app/services/integration_admission.py`), `ProtectedPromptService`/`RunOutcome` (`protected_prompt_service.py`), `ProviderService`/`ProviderError` (`provider_service.py`), `estimate_result_cost` (`cost_service.py`).

## Steps

1. Implement the server and `make_executor` with injected dependencies.
2. Test with the real spec 08 provider module calling the real server, and fake executor/recorder objects.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_bridge_server.py` passes: a bad token gets 401; a cancelled run gets 409 and the executor is not called; a raw success round-trips through `promptfoo_bridge.provider.call_api` with output and tokenUsage. [unit]
- [ ] Same file: a protected `blocked_input` fake result returns guardrails `flaggedInput` and policy evidence excluding `system_prompt` matches; a duplicate key returns the recorded reply and the executor ran once, also under two concurrent requests. [unit]
- [ ] Same file: raw admission busy past the window answers 429 and the provider sees "rate limit"; `ProviderError('rate_limited')` → 429; an unexpected exception → 500 without the prompt text. [unit]
- [ ] Same file: the server socket's address is 127.0.0.1 and `stop()` closes it. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]
