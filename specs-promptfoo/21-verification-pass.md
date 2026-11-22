# Spec 21 — Verification pass

**Status:** Not started
**Depends on:** 00-20
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `specs-promptfoo/INVENTORY.md`, `specs-promptfoo/inventory/21-verification-pass.md`
**Reuses:** `backend/requirements.txt`, `Frontend/package-lock.json`, `Frontend/playwright.redteam.config.js`, `backend/tests/fixtures/fake_promptfoo.py`, `backend/tests/integration/conftest.py`

## Goal

Verify the whole promptfoo Red Team from a clean checkout: both automated suites, every earlier `Done when`, inventory consolidation, and one real live run (hosted generation, real target calls through the app, real grading) for a raw test and its protected clone. Change no product code; failures go back to their owning spec.

## Scope

- Fresh installs: `npm ci` from root and `Frontend/`, clean `backend/.venv` with the requirements, test keys and the replica-set fixture; run `backend/scripts/check_promptfoo_runtime.py` and record its output (version, node, email configured).
- Recheck each `Done when` from 00–20 against the artifacts, with checkboxes for only observed results and a reason for anything not run. Run both unit suites, focused Mongo service/worker tests, and both pieces of 20. Fold unique inventory fragments into `INVENTORY.md`, remove stale/deleted entries, and sweep for duplicate exports, clients, styling primitives and raw color values.
- Live smoke (the owner's acceptance test): with the API, worker, dispatcher, recovery and RabbitMQ running locally and `PROMPTFOO_API_KEY` set in `backend/.env`, launch through the API a raw test on the organization's Groq integration (target `openai/gpt-oss-20b`, grader `openai/gpt-oss-120b`) with 2 plugins (`prompt-extraction`, `pii:direct`), strategies `base64`, 1 test per plugin; wait until terminal; clone it as protected and launch; wait until terminal. Record: generated test count, attacks executed and graded per run, verdict sources, statuses, durations, promptfoo exit codes, and that the clone did not regenerate (same `suite_id`, no generate step in the worker log). Launch requests and polling use the app API with an admin token, never direct database writes.
- Record exact commands, counts, duration and skips in the Log. Leave any unavailable requirement unticked; report failures by owning spec, not as passing or fixed.

## Explicit non-scope

- Correcting product behaviour found broken (API, worker, bridge, runner, UI) → the owning spec 16, 17, 09, 10 or 18, via a new fix spec.
- Correcting test harness and fixtures → spec 20.
- Executing the legacy archive against application data → spec 19 (implementation only; any actual execution is a separate operator decision).

## Reuse first

- Use spec 01's runtime checker and deployment notes, the fake and fixtures from specs 10 and 20 for the automated suites, the existing Playwright configuration and `test_database` fixture (`AGENT-GUIDE.md` test database isolation). The live smoke uses the app's own API only.

## Steps

1. Install in a fresh worktree, run the earlier static checks and map files, acceptance items and test commands to their owner.
2. Run unit, Mongo and e2e gates; then run the live paired smoke and collect observed counts and timings.
3. Fold fragments and do the duplication/ownership sweep; report gaps without making code changes.

### Verification inventory

| Boundary | Inspect or re-run |
| --- | --- |
| Environment | `.node-version`, `DEPLOYMENT.md`, `backend/DEPLOYMENT.md`, `test_check_promptfoo_runtime.py`; verify no deployment/activation step was performed. |
| Metadata and reports | Run the read-only reproducibility checks in `extract_promptfoo_catalog.py` and `extract_promptfoo_frameworks.py`; verify collection of `test_promptfoo_catalog.py`, `test_framework_compliance.py`, `test_red_team_report.py` and `test_results_parser.py`. |
| Runtime path | `backend/promptfoo_bridge/__init__.py` has no import side effects; `test_promptfoo_bridge_provider.py`, `test_bridge_server.py`, `test_promptfoo_runner.py` and `test_red_team_worker_promptfoo.py` run; the live smoke's worker log shows generate → eval → finished. |
| API and browser | Read `docs/API_CONTRACTS.md` against actual response fixtures; rerun `test_red_team_schemas.py`, `test_red_team_promptfoo_api.py`, `test_red_team_promptfoo_worker.py` and `test_red_team_promptfoo_pipeline.py`; inspect `red-team-api.js` for no unhandled external routes. |
| Archive | Probe `archive_legacy_red_team.py` with `test_archive_legacy_red_team.py`; confirm `test_red_team_risk_scoring.py` retains direct scorer coverage and that no archived or live data was touched. |

## Done when

- [ ] Clean installs and both unit suites (`.venv/bin/python -m pytest -q tests/unit` in `backend/`, `npx vitest run` in `Frontend/`), the Mongo API/worker tests and both 20 suites pass; record counts and timings. [suite] [requires: MongoDB replica set, Playwright Chromium]
- [ ] Live smoke: the raw test and its protected clone both reach a terminal status with ≥ 1 graded attack each, share one `suite_id`, and the clone ran no generation; counts, verdict sources and durations recorded in the Log. [suite] [requires: promptfoo hosted generation with verified PROMPTFOO_API_KEY, Groq integration key, RabbitMQ, MongoDB replica set]
- [ ] Each earlier criterion is checked or logged with a specific unmet prerequisite; inventory links resolve, and no duplicate implementation or new raw colour values remain. [static]
- [ ] From `backend/`, `.venv/bin/python -m compileall -q app`, and from `Frontend/`, `npm run lint`, pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]
