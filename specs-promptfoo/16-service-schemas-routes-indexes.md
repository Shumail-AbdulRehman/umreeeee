# Spec 16 — Service, schemas, routes and indexes

**Status:** Done
**Depends on:** Spec 01, Spec 02, Spec 03, Spec 04, Spec 06
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_service.py`, `backend/app/schemas/red_team.py`, `backend/app/api/routes/red_team.py`, `backend/app/db/indexes.py`, `docs/API_CONTRACTS.md`, `backend/tests/unit/test_red_team_schemas.py`, `backend/tests/integration/test_red_team_promptfoo_api.py`, `specs-promptfoo/inventory/16-service-schemas-routes-indexes.md`
**Reuses:** `backend/app/services/content_service.py`, `backend/app/red_team/catalog.py`, `backend/app/red_team/framework_compliance.py`, `backend/app/red_team/config_builder.py`, `backend/app/services/red_team_report.py`, `backend/scripts/check_promptfoo_runtime.py`, `backend/tests/integration/conftest.py`

## Goal

Rewrite the Red Team service and API for the supervisor's flow:
- the UI builds a promptfoo test and previews the promptfoo config it generates;
- launch queues one run job;
- reads return progress, results, the report and exports;
- clones reuse the generated suite.

Old v2/v3 branches disappear from these files.

## Scope

- **Schemas**:
  - `TestConfig`: name 2–120; purpose 20–2000; integration_id; model; mode raw|protected; subject_user_id (required for protected); plugins 1–20 distinct catalog ids; strategies 0–8 distinct catalog ids (`basic` implied); tests_per_plugin 1–10; grader {integration_id, model} required; threshold_score 0–1, default .8.
  - `TestEdit` adds `version`; `LaunchRequest` {version}; `CloneRequest` {mode optional}. Extra keys are forbidden.
  - Cap: `catalog.estimated_target_calls(...)` ≤ 200, else a field error on `tests_per_plugin`.
- **create/edit**: tenant-scoped validation (current `_validate_config` pattern):
  - Target and grader integrations must be active in the organization with the model enabled.
  - Raw targets and graders must map through spec 04 `provider_id`; otherwise 422 `unsupported_provider`.
  - A protected subject must be active and verified.
  - Store `engine: "promptfoo"`, `promptfoo_version` from the catalog, `suite_id` null, status draft. Edits apply only to drafts with a matching version.
- **config preview** (the "config generated from our UI" the supervisor asked for):
  - `POST /api/red-team/config-preview` with a `TestConfig` body runs the same validation without saving.
  - `GET /api/red-team/tests/{id}/config-preview` previews a stored test.
  - Both return {`yaml`, `estimated_target_calls`, `generated_tests_estimate`} from spec 04 `config_preview`. No key, token or path is ever included.
- **launch** (Idempotency-Key UUID required, fingerprint as today):
  - Refuse with 409 `promptfoo_unavailable` when the spec 01 checker reports a missing binary or Cloud key; check this before the transaction.
  - One transaction that:
    - re-checks actor, company, target, grader and subject;
    - in protected mode resolves policies exactly as today (`resolve_policies`, `require_active_policy`, validator readiness);
    - freezes `config_snapshot`: integration {id, name, provider, base_url}, model, system instruction, temperature, max_tokens, price snapshot, subject and group ids, policy snapshots, grader {integration_id, provider, model}, catalog severities, spec 04 `config_hash`, the preview YAML. No keys: the worker decrypts at run time;
    - sets status `queued`;
    - inserts exactly one `red_team_jobs` row {kind `run`, state pending, dispatch_state pending, dispatch_generation 1, next_attempt_at now, phase claimed};
    - audits `red_team.launched`.
- **clone**: a new draft in the same `comparison_group_id`, with an optional mode switch, copying config and `suite_id` (invariant 8).
- **cancel**: queued → cancelled (job cancelled); generating/running → `cancelling` with `cancel_requested_at`; terminal → no-op.
- **reads**:
  - list/detail with `progress` {planned, executed, graded, phase};
  - `results` from `red_team_attacks` with equality filters plugin/strategy/verdict/verdict_source and `counts`;
  - result detail decrypts prompt/reply (honouring retention) and adds the paired case result (same suite, same `test_idx`/`repeat_index`, other mode, terminal);
  - `report` = spec 06 `build_report` with tenant-scoped paired and previous-test queries;
  - export JSON/CSV with CSV-injection escaping (`csv_safe` pattern).
- **capabilities**: catalog plugins/strategies with groups, severities, hosted/multi-turn badges and call estimates; the nine frameworks from spec 03; limits (max calls 200, tests per plugin 10); supported providers; promptfoo runtime {version, available, cloud_key_configured} from the spec 01 checker; broker and worker/dispatcher heartbeats as today.
- **routes**: keep the current paths under `/api/red-team`, add the two preview routes, and remove `/comparisons`.
- **indexes**: `red_team_attacks` unique (company_id, test_id, test_idx, repeat_index) plus (company_id, test_id, verdict); `red_team_suites` (company_id, _id). Keep the existing job indexes.
- `docs/API_CONTRACTS.md`: replace the Red Team section with the new shapes, preview routes and error codes.

## Explicit non-scope

- Executing runs and importing results → spec 17.
- Deleting old modules and their tests → spec 19.
- UI, including the preview panel → specs 11–15 and 18.

## Reuse first

- Keep `RedTeamService._tenant`, `_find`, `_transaction`, `test_read`, `audit`, `serialize`, `content_service.decrypt`, `resolve_policies` and `catalog_ready` as the current service uses them.

## Steps

1. Rewrite schemas and service; keep method names used by routes where possible.
2. Update routes, indexes and the API contract doc.
3. Write schema unit tests and the Mongo integration test (local seed only).

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_schemas.py` passes: limits, distinct ids, grader required, protected subject required, cap 200, extra keys rejected. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/integration/test_red_team_promptfoo_api.py` passes: create → preview (YAML with `redteam.plugins`, no key text) → edit → launch writes exactly one run job and a key-free snapshot with grader and config hash; repeated launch with the same key is idempotent; unsupported provider is 422; clone shares `suite_id`; cancel queued vs running; other-company access is 404; missing runtime is 409 `promptfoo_unavailable`. [unit][requires: MongoDB replica set]
- [ ] `grep -n "manifest_v3\|red_team_report_v3\|evaluators\|/comparisons" backend/app/services/red_team_service.py backend/app/api/routes/red_team.py` returns nothing. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-23:** Promptfoo-only schemas/service/routes/indexes implemented. Schema tests: 14 passed; backend unit: 481 passed; compile passed. Replica-set API acceptance skipped because isolated `TEST_MONGODB_URL`/`test_*` variables were absent.
- **2026-11-23:** Ran the isolated transaction-backed API acceptance against a temporary `test_*` database: 2 passed. The broader focused Promptfoo backend selection passed 26 tests; compile passed.
