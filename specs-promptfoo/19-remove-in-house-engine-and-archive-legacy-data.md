# Spec 19 — Remove the in-house engine and archive legacy data

**Status:** Done
**Depends on:** Spec 16, Spec 17, Spec 18
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/scripts/archive_legacy_red_team.py`, `backend/tests/unit/test_archive_legacy_red_team.py`, `backend/app/red_team/catalog.json`, `backend/app/red_team/catalog_schema.py`, `backend/app/red_team/evaluators.py`, `backend/app/red_team/catalog_v3.json`, `backend/app/red_team/plugins.py`, `backend/app/red_team/strategies.py`, `backend/app/red_team/evidence.py`, `backend/app/red_team/judge.py`, `backend/app/red_team/manifest_v3.py`, `backend/app/red_team/frameworks.py`, `backend/app/red_team/frameworks.json`, `backend/app/services/red_team_report_v3.py`, `backend/app/services/red_team_queries_v3.py`, `backend/app/services/red_team_report_service.py`, `backend/tests/unit/test_red_team_evaluators.py`, `backend/tests/unit/test_red_team_evidence.py`, `backend/tests/unit/test_red_team_frameworks.py`, `backend/tests/unit/test_red_team_judge.py`, `backend/tests/unit/test_red_team_manifest_v3.py`, `backend/tests/unit/test_red_team_plugins.py`, `backend/tests/unit/test_red_team_queries_v3.py`, `backend/tests/unit/test_red_team_report_v3.py`, `backend/tests/unit/test_red_team_risk_scoring.py`, `backend/tests/unit/test_red_team_schemas_v3.py`, `backend/tests/unit/test_red_team_scores.py`, `backend/tests/unit/test_red_team_strategies.py`, `backend/tests/integration/test_red_team_flow.py`, `backend/tests/integration/test_red_team_v3_api.py`, `backend/tests/integration/test_red_team_v3_pipeline.py`, `backend/tests/integration/test_red_team_v3_queries.py`, `backend/tests/integration/test_red_team_v3_worker.py`, `Frontend/src/features/red-team/LegacyReport.jsx`, `Frontend/src/features/red-team/editorSummary.js`, `Frontend/src/features/red-team/editorSummary.test.js`, `specs-promptfoo/inventory/19-remove-in-house-engine-and-archive-legacy-data.md`
**Reuses:** `backend/app/red_team/risk_scoring.py`, `backend/app/db/mongo.py`, `backend/scripts/check_database.py`, `backend/app/services/red_team_service.py`

## Goal

Remove no-longer-referenced legacy engine code and provide a safe operator-controlled archive, not a data migration that runs on deploy.

## Scope

- Remove the legacy CPU/worker/report modules and dedicated legacy tests named in `Owns` only after replacement callers from 16–18 land. Check any shared test fixture users before deletion. The exception in `Owns` is `test_red_team_risk_scoring.py`: replace its dependency on old catalog constants while retaining direct scoring coverage. Do not alter `risk_scoring.py` itself.
- Archive script default is dry-run: list counts of legacy tests/jobs per company, no paths containing secrets, writes or deletes. Select legacy by documented historic schema/engine discriminator, exclude promptfoo and unknown/malformed records, scope related jobs with both company and test IDs. Never touch new suites or case results.
- `--apply` requires an explicit output path. Serialize selected tests and jobs preserving IDs and ciphertext where present (never decrypt), write an exclusive owner-only archive, and only then remove exactly the archived IDs. Refuse overwrite, failed writes, changed data and active legacy jobs. Use transaction semantics for deletes and a maintenance window for operator use; a failed delete must leave the archive intact. Re-running safely reports zero/pending rows without truncating the previous archive.
- Prove only on controlled fakes; do not run `--apply` on the configured application database. Log counts and sanitized reasons only.

## Explicit non-scope

- New schema/endpoint implementation → spec 16.
- Editing worker or recovery logic → spec 17.
- End-to-end tests → spec 20.

## Reuse first

- Read `backend/app/db/mongo.py` and `RedTeamService._transaction` for the existing Mongo/session approach. Use `check_database.py`'s quiet handling of secrets, not an unconditional connection on import.
- Keep the pure scorer and rebase tests on independent synthetic inputs and the new metadata contract where needed.

## Steps

1. Enumerate legacy-only imports and fixtures. Delete inventoried files only after verifying no unowned consumer remains; do not silently delete mixed tests.
2. Implement a dry-run first classifier, archive writer and guarded transactional apply with clear recovery output.
3. Test safe failure cases with custom fakes, and inspect for deleted imports using `rg` including test collection and frontend modules.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_archive_legacy_red_team.py tests/unit/test_red_team_risk_scoring.py` passes: dry-run, per-company scope, unknown/current exclusion, apply archive-before-delete, failed write or changed rows, repeat and unchanged scorer behavior; no `mongomock`. [unit]
- [ ] `rg` finds no imports of the deleted modules; no apply has been run against real data. [static]
- [ ] From `backend/`, `.venv/bin/python -m pytest -q tests/unit`, and from `Frontend/`, `npx vitest run`, pass; log both counts. [unit]
- [ ] From `backend/`, `.venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/archive_legacy_red_team.py`, and from `Frontend/`, `npm run lint`, pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-23:** Removed only the inventoried legacy engine/report files and added the dry-run-first guarded archive. Archive/scorer suite: 183 passed; backend unit: 481 passed; frontend: 298 passed. No archive apply was run.
