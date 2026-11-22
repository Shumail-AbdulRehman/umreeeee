# Spec 20 — Report, results and export queries v3

**Status:** Done
**Depends on:** Spec 02, Spec 12
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_queries_v3.py`, `backend/tests/integration/test_red_team_v3_queries.py`, `backend/tests/unit/test_red_team_queries_v3.py`, `specs-red-team/inventory/20-report-queries.md`
**Reuses:** `backend/app/services/red_team_report_v3.py`, `backend/app/red_team/strategies.py`, `backend/app/services/red_team_service.py`, `backend/app/services/content_service.py`, `INVENTORY.md#red-team-integration-fixture`, `ARCHITECTURE.md#data-model`

## Goal

The read side of v3 as plain functions over the database: results with filters and counts, result detail with decoded reply, decision steps and the paired result, the full report with paired and previous tests, and export rows. Spec 22 wires them into the existing service and routes.

## Scope

- `results(db, test, page, page_size, filters)`: filters `plugin`, `strategy`, `verdict`, `verdict_source`, `case_kind`, `state`; sorted by attack index; returns items, page, page_size, total, and `counts` for the whole test (all, unsafe, defended, inconclusive, errors, controls). Unknown filter values return an empty page, never an error.
- `result_detail(db, test, job)`: the legacy detail fields plus `plugin_id`, `strategy_id`, `severity`, `original_prompt`, `verdict_source`, `evidence_steps`, `judge` (verdict, reason, model, latency, cost, error code), `decoded_response` (from `strategies.decoded_variants`, only when the reply is retained, not withheld and not expired, and a decoding differs from the raw reply), and `paired` (verdict, source, prevention stage of the same attack index in the paired test).
- `report(db, test)`: find the paired test (same company, same `comparison_group_id`, other mode, same `manifest_hash`, newest terminal) and the previous test (same company, integration, model, mode, plugin set and strategy set, finished before this one, newest terminal); load jobs; call `build_report`; add the existing reproducibility metadata and limitations.
- `export_rows(db, test)`: legacy columns plus plugin, strategy, severity, verdict source and judge reason; the existing CSV formula-neutralisation and withheld/expired rules still apply.
- All queries are tenant-scoped by the test's `company_id`; no cross-tenant pairing.

## Explicit non-scope

- Routes, schemas, indexes and calling these from `RedTeamService` → spec 22.
- Writing judge results or evidence steps onto jobs → spec 23.

## Reuse first

- Reuse `job_read`, `serialize`, the expiry rules and `decrypt` exactly as `red_team_service.py` uses them; import, do not copy.

## Steps

1. Implement the four functions with tenant-scoped queries.
2. Unit-test the pure parts (filter building, decoded-response rules) and integration-test the queries with the existing fixture.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_queries_v3.py` passes: filter dictionaries map to the expected query; `decoded_response` is omitted for withheld, expired or undecodable replies and present for a base64 reply. [unit]
- [x] `TEST_MONGODB_URL=… .venv/bin/python -m pytest -q tests/integration/test_red_team_v3_queries.py` passes: counts match seeded jobs; the paired test is found only with the same group and manifest hash; a test from another company is never paired; export rows contain the new columns and neutralise a leading `=`. [requires: MongoDB replica set]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-14**: Read queries verified: targeted unit 13, MongoDB integration 1, full backend unit 434, frontend component 195 + Node 8 passed; compile, lint (0 problems), build passed. No test_* databases remain. CSV-safe rows are opt-in (csv=True) so JSON preserves original text; ROT13/leet decoding requires evidence to avoid transforming ordinary prose.
