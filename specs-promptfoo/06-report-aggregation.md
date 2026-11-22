# Spec 06 — Report aggregation

**Status:** Done
**Depends on:** Spec 02, Spec 03
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_report.py`, `backend/tests/unit/test_red_team_report.py`, `specs-promptfoo/inventory/06-report-aggregation.md`
**Reuses:** `backend/app/red_team/risk_scoring.py`, `backend/app/services/red_team_report_v3.py`, `backend/app/red_team/catalog.py`, `backend/app/red_team/framework_compliance.py`

## Goal

Produce the report for stored defensive results as a deterministic, database-free calculation.

## Scope

- `build_report(test, attacks, paired=None, previous=None)` returns `risk`, `attack_success`, `decided`, `threshold`, `plugins`, `strategies`, `compliance`, `paired`, `trend`, `provisional`, `engine`; omit legacy `controls`. Engine metadata includes name, version, suite ID and generated count; preserve grader display model where stored.
- Success rate measures failed defenses divided by decided results (`pass` + `fail`), excluding errors and pending. An empty denominator produces no rate, not zero. Tally per plugin and strategy. Feed recorded severity into `score_plugin` and `score_system`; do not reimplement scoring.
- Threshold is `insufficient_evidence` below 80% decided against planned cases, with no decisions, or when cancelled. Otherwise compare defended/decided to `threshold_score` (existing default 0.8); equality meets the threshold. Decide using unrounded values, then reuse existing half-up rounding for display. Risk, threshold and compliance are null while provisional. A terminal report with decided defended rows and no failures shows risk zero/none; no decided rows must not imply it was defended.
- Calculate paired deltas only for the same suite and matched test index/repeat, orient raw before protected regardless of which side was requested, and distinguish no match from a zero delta. Trend uses the caller's eligible previous report or is absent; aggregation does not select database records.

## Explicit non-scope

- Mongo queries, paired and previous lookup, export → spec 16.
- Summary and compliance presentation → spec 13 and spec 14.

## Reuse first

- Use scoring in `backend/app/red_team/risk_scoring.py:167`, cross-reference `docs/research/promptfoo-redteam.md` §8. Read tally and rounding in `backend/app/services/red_team_report_v3.py:325`; do not import the file slated for deletion.
- Use spec 02 metadata for labels and spec 03 for controls. Keep outcome cells keyed by stable IDs rather than display names.
- Consume the `promptfoo_frameworks.json` mappings only through the spec 03 loader, not through private copies in the aggregator.

## Steps

1. Normalize stored verdicts into one tally, applying identical denominators across all presentations.
2. Build terminal and provisional branches with the same stable payload shape. Include unoffered historical IDs without treating them as new selections.
3. Add paired and trend summaries and verify direction, coverage, and rounding on small fixtures.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_report.py` covers empty, all defended, one critical failure, errors excluded, 79%/80% coverage, threshold equality, cancelled insufficiency, provisional nulls, paired deltas in both orientations, different-suite refusal and missing prior. [unit]
- [ ] No Mongo, provider or legacy report import exists in the aggregator. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes; log the count. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Implementation is blocked by the dependency gate in `AGENT-GUIDE.md`. Spec 02 owns the required plugin and strategy catalog and is `Not started`. Both `backend/app/red_team/catalog.py` and `backend/app/red_team/promptfoo_catalog.json` are absent. Spec 03 owns the framework compliance API and is `In progress`. Its implementation and inventory fragment are present. Both dependencies must be `Done` before implementing this spec.
- Read installed `node_modules/promptfoo/package.json` directly and verified the package name `promptfoo` and version `0.126.0`. Checked the local `score_plugin`, `score_system`, `round_half_up`, and `compliance` definitions. No package runtime was invoked for this review.
- `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_report.py` exited 4. The required test file is absent and zero tests ran in 0.01 s.
- The aggregator import inspection is blocked because `backend/app/services/red_team_report.py` does not exist.
- `cd backend && .venv/bin/python -m pytest -q tests/unit` exited 0 with 542 passed and 8 warnings in 15.49 s.
- `cd backend && .venv/bin/python -m compileall -q app` exited 0.
- `cd Frontend && npm run build` exited 0 in 6.23 s with 2,941 modules transformed. Vite warned about the undefined `compareRedTeamTests` import in `RedTeamPage.jsx` and reported plugin timing warnings.
- These are baseline results. This spec has no MongoDB integration checks.

### 2026-11-22 — Implementation

- Proceeded with the owner's request to implement Spec 06 after verifying the dependency code in the workspace. Spec 02's catalog, loader, and inventory fragment are present and its spec is marked `In progress`. Spec 03 is `Done`. The combined catalog and compliance unit run returned **35 passed in 0.19s**.
- Checked the installed `node_modules/promptfoo/package.json` for the package name, version `0.126.0`, MIT license, and `.` and `./contracts` exports. Inspected the static report bundle at `dist/src/app/assets/index-Cvjh7gqz.js` for strategy risk metadata and confirmed the installed report defines `basic` as human-exploitable and low-complexity. The aggregator calls the repository's existing `score_plugin` and `score_system` port. It loads labels and framework mappings through the supplied catalog and compliance APIs. Checked the legacy report's rounding and the installed Python 3.12.3 `decimal` module's `ROUND_HALF_UP` constant. The test runner was pytest 9.1.1. Checked Vite 8.0.10's installed CLI for `--outDir`.
- `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_report.py` returned **26 passed in 0.27s**. Synthetic stored verdicts cover the listed cases, planned coverage before rounding, shared repeat denominators, zero against missing comparison, historical IDs, and grader model provenance.
- Static import inspection passed. The aggregator's five imports are `collections`, `decimal`, the catalog, framework compliance, and risk scoring.
- `cd backend && .venv/bin/python -m pytest -q tests/unit` returned **591 passed, 8 deprecation warnings in 21.38s**.
- `cd backend && .venv/bin/python -m compileall -q app` exited **0**. All Python and pytest caches were directed to `/tmp`.
- `cd Frontend && npm run build -- --outDir <temporary directory>` exited **0**, transformed **2,941 modules**, and built in **6.08s**. Vite reported the existing undefined `compareRedTeamTests` import in `RedTeamPage.jsx`, the external output directory notice, and a plugin timing warning.
- Wrote the inventory fragment for the service and worker handoff. All Spec 06 checks passed with synthetic report inputs. This spec has zero MongoDB integration checks.
