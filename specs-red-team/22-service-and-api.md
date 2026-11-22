# Spec 22 — Red Team service and API v3

**Status:** Done
**Depends on:** Spec 04, Spec 10, Spec 20
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_service.py`, `backend/app/schemas/red_team.py`, `backend/app/api/routes/red_team.py`, `backend/app/db/indexes.py`, `docs/API_CONTRACTS.md`, `backend/tests/integration/test_red_team_v3_api.py`, `backend/tests/unit/test_red_team_schemas_v3.py`, `specs-red-team/inventory/22-service-and-api.md`
**Reuses:** `backend/app/red_team/manifest_v3.py`, `backend/app/services/red_team_queries_v3.py`, `backend/app/red_team/frameworks.py`, `backend/app/red_team/plugins.py`, `INVENTORY.md#red-team-service`, `ARCHITECTURE.md#data-model`

## Goal

The API speaks v3 end to end while legacy tests keep working: v3 configuration validation, draft create/edit, launch with the judge snapshot, clone, capabilities, and the read endpoints delegating to spec 20 for v3 tests.

## Scope

- Schemas: a v3 config with `plugins`, `strategies`, `tests_per_plugin`, `judge` {integration_id, model} or null, plus the existing fields; reject unknown plugin or strategy ids, duplicates, and totals over 100 with field-specific errors. The legacy `attack_categories` config stays accepted for legacy clones. `TestEdit` mirrors both.
- Service create/edit (draft only, version-checked): v3 configs build the manifest with spec 10, store `format='plugins'`, catalog and evaluator versions and the derived `num_attacks`; validate the judge integration (active, same company, model enabled). Legacy configs keep the current path.
- Launch (same transaction, idempotency and authority checks as today): snapshot adds plugin severities, strategy metadata and `judge` {integration_id, model, provider, price_snapshot}; the judge integration is re-checked at launch; jobs carry the v3 row fields with `verdict_source=None`. Clone copies the v3 config and keeps `comparison_group_id`.
- Read endpoints: for v3 tests `results`, `result_detail`, `report` and `export` delegate to spec 20; legacy tests use today's code paths unchanged. `results` route accepts the new query parameters.
- Capabilities: add `plugins` (with per-framework mapped controls read from `frameworks.json` through spec 04's module), `strategies`, `frameworks`, `max_attacks`, `max_tests_per_plugin`, `judge_supported`, keeping current fields.
- Indexes: jobs by (company, test, plugin), (company, test, strategy), (company, test, verdict_source); keep existing ones.
- `docs/API_CONTRACTS.md` Red Team section: document the v3 request and response additions.

## Explicit non-scope

- Worker execution, judge calls and grading at run time → spec 23.
- Frontend use of the new fields → spec 21.

## Reuse first

- Extend `RedTeamService` methods in place (`_validate_config`, `create`, `edit`, `launch`, `clone`); reuse `_transaction`, `audit` and the existing launch fingerprinting.

## Steps

1. Add v3 schemas and validation.
2. Branch create/edit/launch/clone and the read endpoints on `format`.
3. Extend capabilities, indexes and the API contract doc.
4. Unit-test schemas; integration-test the API with the existing fixture and fake publisher.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_schemas_v3.py` passes: valid v3 config accepted; unknown plugin, duplicate strategy, 11 tests per plugin and a 101-attack total rejected with field paths; a legacy config still validates. [unit]
- [x] `TEST_MONGODB_URL=… .venv/bin/python -m pytest -q tests/integration/test_red_team_v3_api.py` passes: create → edit → launch stores 96 + 5 v3 jobs and a judge snapshot; a judge integration from another company is rejected; the same `Idempotency-Key` launches once; capabilities lists 8 plugins and 4 frameworks; v3 report and results return the spec 20 shapes; a legacy test's report is unchanged. [requires: MongoDB replica set]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]


## Log

- **2026-11-14**: V3 create/edit/launch/clone, capabilities, read delegation, scoped indexes and contract documented. Schema tests 18, Mongo API integration 1, full backend unit 452, frontend component 210 + Node 8 passed. Compile, lint (0 errors/warnings), build passed. No test_* databases remain. No provider, judge or broker calls. Exact 101 derived attacks is impossible with the factor limits; tested 120 derived attacks and a supplied num_attacks=101 rejection, plus the valid 100 boundary. Model/judge call metadata is derived from provider_called_at and judge.attempts.

- **2026-11-14 (spec 24 regression)**: A real dispatcher/worker pipeline with one target rate-limit retry made 8 provider dispatches, while detail showed 7 model calls. Changed model_calls to sum the persisted attempt_number rather than count jobs with a dispatch timestamp. Pipeline and suite counts are in spec 24.

- **2026-11-14**: Independent review added an explicit company_id predicate to the post-edit response lookup (the prior trusted _id came from a scoped read, so no cross-tenant exploit was reproduced). Expanded the real-Mongo API case to probe all ten object read/write/comparison endpoints plus list as an administrator of a real second organization and as a member: 20 object requests denied, foreign list empty, member list forbidden, owner jobs/status unchanged. API case passed. The first expanded run used a nonexistent foreign organization and incorrectly expected 404 instead of the correct transaction guard 403; corrected the test setup, not the application permission behavior. Full backend unit 464 and compile pass.
