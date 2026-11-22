# Spec 23 — Worker grading and judge phase

**Status:** Done
**Depends on:** Spec 05, Spec 11, Spec 22
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/workers/red_team_worker.py`, `backend/app/queue/recovery.py`, `backend/tests/integration/test_red_team_v3_worker.py`, `specs-red-team/inventory/23-worker-judge-phase.md`
**Reuses:** `backend/app/red_team/evidence.py`, `backend/app/red_team/judge.py`, `backend/app/services/provider_service.py`, `backend/app/services/integration_admission.py`, `backend/app/services/cost_service.py`, `INVENTORY.md#worker-pipeline`

## Goal

v3 jobs are graded with the strategy-aware grader, undecided adversarial results go through a durable, crash-safe judge phase when the test has a judge, and recovery handles the new phase without ever replaying an uncertain target call.

## Scope

- Dispatch by test format: legacy jobs keep `evaluate()` exactly as today; v3 jobs use `evidence.grade()`. Persist `verdict_source`, reason, explanation and `evidence_steps` on finalize.
- Judge phase for v3 when `needs_judge` and the snapshot has a judge and the reply is retained: set `execution_phase='judging'` under the job lease, acquire admission on the judge integration (not the target), call `ProviderService.execute` with the spec 05 request, parse with spec 05, record `judge` {verdict, reason, model, latency, cost via `estimate_result_cost`, error code, attempts, rubric version}, then finalize with `verdict_source='judge'` or `inconclusive` with the judge error code. Judge rate limiting reschedules like the target path; other judge errors finalize as inconclusive.
- Lease and heartbeats cover the judge call; cancellation requested during judging finalizes as cancelled; authority loss of the judge integration finalizes the job inconclusive with `judge_unavailable` instead of cancelling the whole test.
- Recovery: an expired lease in `judging` with `judge.attempts` below 2 is requeued to judge again (the target reply is already persisted, so the target is not called); at 2 attempts it is finalized inconclusive with `judge_attempts_exhausted`. Existing phases keep their behaviour; `calling_provider` is still never replayed.
- Threshold notification uses the v3 threshold verdict for v3 tests.

## Explicit non-scope

- Deployment of the recovery process → spec 09.
- Report math → spec 12; API → spec 22.

## Reuse first

- Extend `_prepared`, `_finalize`, `_retry` and `process_job` in place; reuse `_keep_alive` for the judge call's lease; reuse `IntegrationAdmission` for the judge integration.

## Steps

1. Branch grading by format and persist the new fields.
2. Add the judging phase with lease, admission, call, parse and finalize.
3. Extend recovery for `judging`.
4. Integration-test with fake target and judge providers and a fake publisher.

## Done when

- [x] `TEST_MONGODB_URL=… .venv/bin/python -m pytest -q tests/integration/test_red_team_v3_worker.py` passes: a leaked marker in a base64 reply finalizes `fail` source `exact` with no judge call; an undecided reply with a judge calls the fake judge once and finalizes with source `judge`; an invalid judge reply finalizes `inconclusive` with the parser's code; without a judge it stays `inconclusive` source `none`. [requires: MongoDB replica set]
- [x] Recovery tests in the same file: an expired `judging` lease is judged again without a second target call; a second expiry finalizes `judge_attempts_exhausted`; an expired `calling_provider` lease is still finalized as unknown outcome, not replayed; a legacy v2 job is graded exactly as before. [requires: MongoDB replica set]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures (existing unit tests unaffected); count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]


## Log

- **2026-11-14**: Worker/judge integration 4 passed (198.44 s), covering raw/protected base64 evidence, both judge verdicts, invalid JSON/unsure, no judge, controls, crash resume and exhaustion, unknown target outcome, admission contention, rate limit retry, cancellation, revocation, heartbeat and legacy grading. Backend unit 452, frontend component 210 + Node 8 passed; compile, lint (0 errors/warnings), build passed. No test_* databases remain. Completed judge metadata is persisted to avoid an extra call after a post-parse crash. V3 threshold notification selection is shared with recovery. No live providers, judge or broker used. Found cancelled-risk/copy mismatch in existing spec 12; deferred to spec 24 pipeline regression per user fix authorization.

- **2026-11-14**: Independent review reproduced two stale-cursor recovery races (2 failed regressions before the fix): recovery reset a job after its phase advanced to calling_provider, or after its lease was renewed. Recovery now atomically claims only a still-expired execution lease with a new token and reads the current job phase; the old worker is fenced out. The provider-dispatch race finalizes execution_outcome_unknown without replay. Worker/recovery tests 6 passed, plus queries and pipeline (8 passing cases in the expanded v3 run); full backend unit 464 and compile pass. The unrelated API probe setup correction and final complete counts are recorded in final-review.md.
