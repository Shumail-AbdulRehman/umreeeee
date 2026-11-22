# Spec 25 — Red Team verification pass

**Status:** Done
**Depends on:** 00-24
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `specs-red-team/INVENTORY.md`, `docs/planning/red-team/implementation-verification.md`
**Reuses:** `design/red-team/v3/report.html`, `DESIGN-SYSTEM.md#accessibility-floor`, `ARCHITECTURE.md#invariants`

## Goal

Prove the whole Red Team set from a clean install, re-check every earlier `Done when` against the real files, fold the inventory and record the real numbers and limits for the FYP report.

## Scope

- Clean install: `npm ci` in `Frontend/`; a fresh virtual environment from `backend/requirements-dev.txt`.
- Whole suites: backend unit suite; backend integration suite against a MongoDB replica set (record honestly if unavailable); `npm test`; `npm run test:red-team`; the existing Prompt Studio browser suite (`npm run test:studio`) to prove no regression.
- Re-check each spec's criteria; record any "spec NN claimed X, actually Y" in the Log.
- Invariant sweep from `ARCHITECTURE.md`: legacy tests unchanged; broker messages carry IDs only; no raw colours outside the design system; no feature component imports a service; MITRE ATLAS IDs shown only when verified; no real secrets or real people in the catalog.
- Files to re-check by name: backend unit tests `test_red_team_plugins.py`, `test_red_team_strategies.py`, `test_red_team_risk_scoring.py`, `test_red_team_frameworks.py`, `test_red_team_judge.py`, `test_red_team_manifest_v3.py`, `test_red_team_evidence.py`, `test_red_team_report_v3.py`, `test_red_team_queries_v3.py`, `test_red_team_schemas_v3.py`; integration tests `test_red_team_v3_queries.py`, `test_red_team_v3_api.py`, `test_red_team_v3_worker.py`, `test_red_team_v3_pipeline.py`; shared files `frameworks.json`, `red_team_worker.py`, `routes/red_team.py`, `schemas/red_team.py`, `indexes.py`, `docs/API_CONTRACTS.md`, both `Procfile`s, `backend/DEPLOYMENT.md`, `Frontend/package.json`, `tests/fixtures/red-team-api.js`, and the feature components `PluginTable.jsx`, `StrategyBreakdown.jsx`, `AttackDetailDialog.jsx`.
- Fold `specs-red-team/inventory/*.md` into `INVENTORY.md` and run the duplication sweep (second label maps, second formatters, second dialog primitives, copied grading logic).
- Write `docs/planning/red-team/implementation-verification.md`: counts, what ran, what could not (live provider, live RabbitMQ, physical devices), and the verified figures the FYP report may cite.
- Run `python3 .ai/plan-project/scripts/validate-specs.py specs-red-team` and record the result.

## Explicit non-scope

- Fixing failures → a new numbered fix spec, not this one.
- Deployment to Heroku or Netlify → none in this set.

## Steps

1. Clean install and run every suite; record counts.
2. Re-check criteria and invariants; fold the inventory; write the verification report.

## Done when

- [x] From clean installs, the backend unit suite, `npm test`, `npm run test:red-team` and `npm run test:studio` all pass; counts in the Log. [suite]
- [x] The backend integration suite passes against a MongoDB replica set, or the Log states it could not run and why. [requires: MongoDB replica set]
- [x] Every earlier criterion is re-checked, inventory fragments are folded into `INVENTORY.md`, the duplication sweep is recorded, and the validator reports 0 errors. [static]
- [x] `npm run lint` passes with 0 errors and 0 warnings, and `.venv/bin/python -m compileall -q app scripts` exits 0. [static]
- [x] `npm run build` passes. [static]

## Log

- **2026-11-14**: Clean verification started after specs 21–24 passed. `npm ci` installed 439 packages; a separate `/tmp/red-team-verification-venv` is being installed from requirements-dev.txt, preserving the existing backend environment. Initial invariant sweep: no feature service/fetch imports, no feature CSS raw colors, no native feature dialogs, four framework totals 10/16/21/14, and all ATLAS tactic IDs null. Preliminary validator's missing-Log error is resolved by this entry; historical no-issue/date-format warnings are recorded, not repaired outside this spec's scope.
- **2026-11-14 (restart, partial evidence)**: Restarted clean verification independently of the interrupted run. `npm ci`: 439 installed; a new `/tmp/red-team-final-verification-20261114` installed requirements-dev.txt (131 distributions; pip check clean). Fresh and existing-environment backend unit runs each passed the same 452 cases (8 dependency warnings); frontend unit 210 Vitest + 8 Node passed; Red Team browser 17 and Prompt Studio browser 15 passed; lint 0 errors/warnings, both compile checks, fresh recovery import and explicit production build passed. Mongo replica set available; initial filtered list contained no test_* databases. Entire 114-case integration suite is still running; no completion is claimed here. All 111 earlier criteria read; all 22 inventory fragments verified verbatim and consolidated clarifications added. Draft report records historical exceptions, test-environment boundaries, the judge estimate limitation and dependency audit findings. Validator currently 0 errors/31 warnings. Spec stays In progress until integration, cleanup and the final validator finish.
- **2026-11-14 (integration interruption)**: The complete single-process integration attempt finished with **107 passed, 1 failed, 7 errors, 8 warnings in 1452.41 s**. The v3 API CSV assertion received zero parsed rows while the application logged Database unavailable (`_OperationCancelled`); its teardown failed resolving replica-set hosts. The six later v3 cases failed setup with DNS SRV SERVFAIL. The API case contributes both a failed call and a teardown error, so these are 114 unique cases, not 115. A fresh DNS probe subsequently succeeded. Filtered cleanup found and dropped the one test_* database left by this attempt; a second listing confirmed zero. No other database was touched. All 114 cases are being rerun in four disjoint pytest processes (43 core, 42 enforcement, 22 catalog/legacy, 7 v3), with separate UUID test databases and no altered tests or application files. This rerun is required before claiming a passing integration suite.
- **2026-11-14 (final verification, Done)**: The complete integration retry passed **114/114**, with **0 failures/errors/skips**: core 43 (535.41 s), enforcement 42 (401.79 s), catalog/legacy 22 (258.47 s), v3 API/pipeline/queries/worker 7 (203.50 s). Every integration file ran in one of four isolated pytest processes with fake providers/publishers; each emitted 8 dependency warnings. The original single-process DNS failure above remains recorded, not counted as a pass. Final totals: backend unit **452** (fresh and existing environments, same cases), frontend unit **210 Vitest + 8 Node**, browser e2e **17 Red Team + 15 Prompt Studio**; backend pipeline **1**, included in integration 114. Lint **0 errors/0 warnings**, existing/fresh compile, fresh recovery import and production build passed. All **111** earlier criteria reviewed; **22/22** inventory fragments folded verbatim, duplication/invariant sweep and named-file review recorded in `docs/planning/red-team/implementation-verification.md`. Final source hash check: **304 unchanged** source/test/config files, no additions. Final database listing empty and count **0 test_***; no leftover verification processes, unrelated port 5199 untouched. Validator: **26 specs, 0 errors, 31 nonblocking warnings**, justified in the report. No application/test changes, git mutations, deploys, live provider/judge/RabbitMQ calls or physical-device verification. Historical direct-fix exceptions, unavailable pre-spec Procfile byte baseline, fresh-unit/existing-integration environment boundary, judge-estimate limitation and 12 npm audit findings are explicitly documented. All five acceptance gates are satisfied.

- **2026-11-14**: Independent review found and fixed a recovery race, leetspeak marker grading, legacy draft/clone editing, paired-mode labels, misleading judge-call ceiling text, an explicit tenant predicate omission, and Log/owner documentation defects in their owning specs. Current verification: backend unit 464 (existing and fresh environments), integration 116 unique cases covered by complete original groups plus affected v3/legacy reruns, frontend 214 Vitest + 8 Node, Red Team browser 19 and Studio browser 15; compile, recovery import, pip check, lint/build pass. Original recovery regressions failed twice as intended; a MongoDB setup timeout and a foreign-organization probe fixture mistake are retained in final-review.md with successful retries. Validator 0 errors/28 warnings; test_ cleanup and process checks passed. Latest evidence and complete snapshot ownership/secret audit: docs/planning/red-team/final-review.md. No Git mutations, deploys, live providers/judges/broker calls.
