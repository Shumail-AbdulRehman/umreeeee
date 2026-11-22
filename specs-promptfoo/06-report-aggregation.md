# Spec 06 — Report aggregation

**Status:** Not started
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
