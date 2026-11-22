# Spec 16 — Service, schemas, routes and indexes

**Status:** Not started
**Depends on:** Spec 01, Spec 02, Spec 03, Spec 04, Spec 06
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_service.py`, `backend/app/schemas/red_team.py`, `backend/app/api/routes/red_team.py`, `backend/app/db/indexes.py`, `docs/API_CONTRACTS.md`, `backend/tests/unit/test_red_team_schemas.py`, `backend/tests/integration/test_red_team_promptfoo_api.py`, `specs-promptfoo/inventory/16-service-schemas-routes-indexes.md`
**Reuses:** `backend/app/services/content_service.py`, `backend/app/services/red_team_queries_v3.py`, `backend/app/red_team/catalog.py`, `backend/app/red_team/framework_compliance.py`, `backend/app/red_team/config_builder.py`, `backend/app/services/red_team_report.py`, `backend/scripts/check_promptfoo_runtime.py`, `backend/tests/integration/conftest.py`

## Goal

Rewrite the Red Team service and API for promptfoo tests: drafts, launch into the job outbox, clone with suite reuse, cancel, live progress, results, report, export and capabilities. Old v2/v3 branches disappear from these files.

## Scope

- **Schemas** (`schemas/red_team.py`): `TestConfig` {name 2-120, purpose 20-2000, integration_id, model, mode raw|protected, subject_user_id optional, plugins 1-20 distinct catalog ids, strategies 0-8 distinct catalog ids (basic implied), tests_per_plugin 1-10, grader {integration_id, model} required, threshold_score 0-1 default .8}; `TestEdit` adds `version`; `LaunchRequest` {version}; `CloneRequest` {mode optional}. Extra keys forbidden. Attack cap: `catalog.estimated_target_calls(...)` ≤ 200 else a field error on `tests_per_plugin`.
- **create/edit**: tenant-scoped validation as today (`_validate_config` pattern): target and grader integrations active in the organization with the model enabled, grader provider supported by spec 04 (422 `unsupported_grader_provider`), subject active and verified; store `engine: "promptfoo"`, `promptfoo_version` from the catalog, `suite_id` null, status draft; edit only drafts with matching version.
- **launch** (Idempotency-Key UUID required, fingerprint as today): one transaction that re-checks actor, company, target, grader and subject; for protected mode resolves policies exactly as today (`resolve_policies`, `require_active_policy`, validator readiness); freezes `config_snapshot` {integration name/provider/id, model, system instruction, temperature, max_tokens, price snapshot, subject and group ids, policy snapshots, require_active_policy, grader {integration_id, provider, model}, catalog severities, config_hash from spec 04}; sets status `queued`; inserts exactly **one** `red_team_jobs` row {kind `run`, state pending, dispatch_state pending, dispatch_generation 1, next_attempt_at now, phase claimed}; audits `red_team.launched`. Launch refuses with 409 `promptfoo_unavailable` when the spec 01 checker reports a missing binary or account email (checked before the transaction).
- **clone**: new draft in the same `comparison_group_id`, optional mode switch, copies config and `suite_id` (so the clone evaluates the identical generated attacks; ARCHITECTURE invariant 8).
- **cancel**: queued → cancelled (job cancelled); generating/running → `cancelling` with `cancel_requested_at` (the worker stops the run, spec 17); terminal → no-op.
- **reads**: list/detail with `progress` {planned, executed, graded, phase} from test counts; `results` from `red_team_attacks` with equality filters plugin/strategy/verdict/verdict_source and `counts`; result detail decrypts prompt/reply honouring retention and adds the paired attack (same suite, same `test_idx`/`repeat_index`, other mode, terminal); `report` = spec 06 `build_report` with paired and previous tests (scoped queries adapted from `red_team_queries_v3.py`: read, do not import); export JSON/CSV with CSV-injection escaping (`csv_safe` pattern).
- **capabilities**: catalog plugins/strategies with groups, severities, hosted/multi-turn badges and call estimates, frameworks (spec 03), limits (max calls 200, tests per plugin 10), supported grader providers, promptfoo runtime {version, available, account_email_configured} (spec 01 checker logic, email masked), broker reachability and worker/dispatcher heartbeats as today.
- **routes** keep the current paths under `/api/red-team`; remove `/comparisons` (pairing lives in the report).
- **indexes**: `red_team_attacks` unique (company_id, test_id, test_idx, repeat_index) plus (company_id, test_id, verdict); `red_team_suites` (company_id, _id); keep existing job indexes.
- `docs/API_CONTRACTS.md`: replace the Red Team section with the new request/response shapes and error codes.

## Explicit non-scope

- Executing runs → spec 17.
- Deleting old modules and their tests → spec 19.
- UI → specs 11-15, 18.

## Reuse first

- Keep `RedTeamService._tenant`, `_find`, `_transaction`, `test_read` patterns, `audit`, `serialize`, `content_service.decrypt`, `resolve_policies`, `registry.capabilities`, `catalog_ready` exactly as the current service uses them.

## Steps

1. Rewrite schemas and service; keep method names used by routes where possible.
2. Update routes, indexes and the API contract doc.
3. Write schema unit tests and the Mongo integration test (local seed; do not depend on legacy tests).

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_schemas.py` passes: limits, distinct ids, grader required, cap 200, extra keys rejected. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/integration/test_red_team_promptfoo_api.py` passes: create → edit → launch writes exactly one run job and a snapshot with grader and config hash; repeated launch with the same key is idempotent; clone shares `suite_id`; cancel queued vs running; other-company access is 404; launch with missing runtime is 409 `promptfoo_unavailable`. [unit][requires: MongoDB replica set]
- [ ] `grep -n "categories\|manifest_v3\|evaluators" backend/app/services/red_team_service.py backend/app/api/routes/red_team.py` returns nothing. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]
