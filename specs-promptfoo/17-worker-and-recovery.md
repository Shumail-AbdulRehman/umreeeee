# Spec 17 — Worker and recovery (port of callback_func)

**Status:** Done
**Depends on:** Spec 05, Spec 09, Spec 10, Spec 16
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/workers/red_team_worker.py`, `backend/app/queue/recovery.py`, `backend/tests/unit/test_red_team_worker_promptfoo.py`, `backend/tests/integration/test_red_team_promptfoo_worker.py`, `specs-promptfoo/inventory/17-worker-and-recovery.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `backend/app/queue/dispatcher.py`, `backend/app/services/content_service.py`, `backend/app/red_team/config_builder.py`, `backend/app/red_team/results_parser.py`, `backend/app/red_team/bridge_server.py`, `backend/app/red_team/runner.py`, `backend/app/services/red_team_service.py`, `backend/tests/fixtures/fake_promptfoo.py`

## Goal

The red-team worker executes one live promptfoo run per test launch, following the scheduler's `callback_func`:
1. load the test;
2. mark it in progress;
3. decrypt the accounts;
4. build the config;
5. run promptfoo;
6. parse the results JSON;
7. save the results;
8. finalize.

It runs inside the app's own queue, lease, recovery and encryption. Recovery handles interrupted runs without replaying them.

## Scope

- **Message handling** stays as today: validate `{v, job_id, test_id, generation}`, dead-letter malformed messages, prefetch 1, ack after durable state. `process_job` handles `kind: "run"` only.
- **Claim and authority**: reuse `_claim`, `_keep_alive` (renew every 10 s for the whole run, also heartbeating) and `_authority`. Cancellation or revoked authority before start → cancelled.
- **Prepare** (scheduler: fetch request, set "In Progress", decrypt the account):
  - set the test to `generating` (`running` when `suite_id` exists) and the job phase;
  - load the frozen snapshot;
  - decrypt the target key (raw) and the grader key through `llm_integration_repository` with credentials;
  - read `PROMPTFOO_API_KEY` and `PROMPTFOO_CLOUD_HOST` from settings;
  - protected only: start `BridgeServer` (spec 09) with `make_executor(...)`;
  - build the config with spec 04, as a clone config when `suite_id` is set (load the suite document);
  - create `PromptfooRun` (spec 10).
  - A missing or undecryptable key finalizes `failed` with `target_key_unavailable` or `grader_key_unavailable`.
- **Events**:
  - `suite_ready`: insert one `red_team_suites` document (sanitized suite, count, `by_plugin`, `by_strategy`, `config_hash`). Set `suite_id` on the test and on any draft clone in the same comparison group without a suite. Set `counts.planned`. Record per-plugin generated counts so a plugin that produced zero tests is visible.
  - `phase("evaluating")` → status `running`.
  - `progress(n)` → `counts.executed = n`, throttled to one write per 2 s.
  - `finished(completed)` → read `results.json` (cap 100 MB; larger → `failed`/`results_too_large`) and import it with spec 05 `parse_results_json`:
    - for each row, `decide(row, bridge.issued_run_ids())` (empty set for raw);
    - upsert `red_team_attacks` by (company, test, test_idx, repeat_index), encrypting prompt and response with `content_service.encrypt` and honouring retention;
    - store verdict, source, reason, severity, decision, evidence, protected run id, assertion type/metric, latency, tokens and cost;
    - store promptfoo `stats` and `total_latency_ms` on the test; set `counts.graded`;
    - log skipped rows by reason without failing the run.
- **Cancellation**: a watcher checks `cancel_requested_at` every 2 s and calls `run.cancel()`. The bridge answers 409 to in-flight protected calls.
- **Finalize** in one transaction like today's `_finalize`:
  - cancelled → `cancelled`;
  - runner failed → `failed` with `failure_reason` (`no_tests_generated`, `promptfoo_auth_failed`, `promptfoo_failed`, `promptfoo_unavailable`, `promptfoo_api_key_missing`, `suite_contains_secret`, `timeout`, `results_too_large`, key errors);
  - completed with any error verdicts → `partially_failed`; otherwise `completed`.
  - Set `finished_at` and close the job (state finished, phase finished, exit code, error code; the redacted output tail goes to the job, never to the API).
  - Threshold notification uses spec 06's report exactly like today's `_below_threshold`.
  - Always stop the bridge and release resources in `finally`.
- **Recovery** (`recover`):
  - stale outbox publishing as today;
  - a `run` job with an expired lease in phase `claimed`/`generating` and no `suite_id` → requeue with a new dispatch generation (no target calls were made);
  - in `evaluating`/`importing` → finalize the test `failed`/`interrupted`, keeping imported results (invariant 4);
  - stuck parents reconciled as today. Keep the `main()` loop resilience added on 2026-11-20.

## Explicit non-scope

- Removing the old per-case helpers (`_raw`, judge path) and old tests → spec 19.
- UI → spec 18.

## Reuse first

- Follow `callback_func` in `scheduler_umr/job_scheduler.py` for the order of steps. Do not port its RabbitMQ class, Teams alerts, `next_scan` scheduling or ticket update.
- Keep `_claim`, `_keep_alive`, `_authority`, `_finalize`, `heartbeat`, the `main()` consumer loop and `recovery.recover` lease discipline; `dispatcher.dispatch_once` stays unchanged.

## Steps

1. Restructure `process_job` around the run job; keep message validation and the consumer loop.
2. Implement preparation, the event loop, the import, the cancellation watcher and finalize.
3. Update recovery for run-job phases.
4. Unit tests with a fake runner and bridge; an integration test with `fake_promptfoo.py`, the real bridge and a fake protected service through Mongo.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_worker_promptfoo.py` passes: status moves generating → running → completed; imported rows get `grader` and `policy` sources; a policy verdict is refused for an unissued run id; zero tests → `failed/no_tests_generated`; a missing grader key → `grader_key_unavailable`; a cancel request stops the runner and ends `cancelled`; the bridge is stopped in every path and never started for raw. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/integration/test_red_team_promptfoo_worker.py` passes: a raw test and its protected clone run end to end with the fake promptfoo (the clone through the real bridge); case results are graded and their prompts and replies are stored encrypted; the suite is stored once without keys and reused by the clone without generation; recovery requeues a generating job and fails an evaluating one as `interrupted`. [unit][requires: MongoDB replica set]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-23:** One-run worker, encrypted import and interrupted-run recovery implemented. Focused unit: 4 passed; backend unit: 481 passed; compile passed. Replica-set worker acceptance skipped because isolated test Mongo variables were absent.
- **2026-11-23:** Replaced the replica-set guard with real raw/protected-clone and recovery acceptance. Isolated Mongo worker acceptance: 2 passed; it observed one sanitized suite, `run` then `eval`, encrypted content, grader/policy sources, lease fencing, and interrupted recovery.
