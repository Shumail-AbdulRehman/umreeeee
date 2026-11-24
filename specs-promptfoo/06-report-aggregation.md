# Spec 06 — Report aggregation (port of the scheduler's aggregation)

**Status:** Done
**Depends on:** Spec 02, Spec 03
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/services/red_team_report.py`, `backend/tests/unit/test_red_team_report.py`, `specs-promptfoo/inventory/06-report-aggregation.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `backend/app/red_team/risk_scoring.py`, `backend/app/red_team/catalog.py`, `backend/app/red_team/framework_compliance.py`, `backend/app/red_team/scheduler_frameworks.json`

## Goal

Build the report from a test and its stored case results by porting the owner's scheduler aggregation (`parse_redteam_json`: per-plugin, per-strategy and per-category tallies, test case failure rate, risk, frameworks, trend). Keep the report payload the finished UI (specs 13–15, client from spec 07) already renders.

## Scope

- Keep `build_report(test, attacks, paired=None, previous=None)` and every current top-level key: `risk`, `attack_success`, `decided`, `threshold`, `plugins`, `strategies`, `compliance`, `paired`, `trend`, `provisional`, `engine`. Existing field names inside them stay, so specs 07 and 13–15 need no change.
- Tallies follow the scheduler. A case result counts as `passed` (verdict `pass`), `failed` (`fail`) or `errors` (`error`) per plugin, per strategy, per plugin×strategy and per category (catalog `group`, the scheduler's "parent").
- Calculate the test case failure rate consistently as failed ÷ (passed + failed). This is a deliberate fix of the scheduler's inconsistency (it counted errors in the per-plugin denominator but not overall; `docs/research/scheduler-reuse.md` defect 4). An empty denominator gives no rate, not zero.
- Risk follows the scheduler. Per plugin, only strategies with at least one failed test case feed the score, given to `risk_scoring.score_plugin` with the case verdict counts (`StrategyCounts(strategy, decided, failed)`). A plugin with none scores 0 with no level. System risk = `score_system` over scored plugins; category risk = `score_system` over that category's plugins. Severity comes from the stored row, else the catalog. Do not change `risk_scoring.py`.
- Add `categories`: per group, the totals, rate, risk {score, level}, and per-strategy cells.
- Add `severity_counts`: failed test cases by severity (`critical`, `high`, `medium`, `low`, `informational`), counting unknown severities as `medium` (scheduler `stats`, without its `KeyError`).
- `compliance`: feed spec 03 `compliance()` with per-plugin `passed`, `failed`, `errors` (stop using the legacy `decided`/`worked` input), and update the report tests that look up pre-port framework ids (`owasp` → `owasp:llm`, etc.); spec 03 leaves those as a known temporary failure. Pass its `coverage` through per framework and keep the existing `framework`/`name`/`totals`/`controls` list shape.
- `trend`: keep the current fields and add `risk_delta` and `framework_deltas`. Both use the scheduler's `delta(curr, prev)` → {pct (0–100, two decimals), direction up|down|neutral}, against the previous report's system risk score and each framework's passed-control count.
- Keep threshold, provisional nulls, paired deltas (same suite, same `test_idx`/`repeat_index`, raw before protected) and the engine block. Add `engine.duration_ms` and `engine.token_usage` from the test's stored promptfoo `stats` when present.

## Explicit non-scope

- Mongo reads, paired and previous lookup, export → spec 16.
- Presentation of the new `categories` and `severity_counts` keys → spec 13 may use them later; this spec only produces them.

## Reuse first

- Port the aggregation half of `parse_redteam_json` (`scheduler_umr/utils/runner.py`) as summarized in `docs/research/scheduler-reuse.md`; do not port its Mongo reads or writes.
- Keep the current module's half-up rounding, `_Tally` style and paired logic where they already match; change only what differs from the scheduler.

## Steps

1. List each difference between the current module and the scheduler rules (risk input filter, error handling, categories, severity counts, delta) in the Log before editing.
2. Implement the differences and the new keys; keep the module pure.
3. Update the tests with small sets of synthetic test cases, then run both suites (frontend unchanged).

## Done when

- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_red_team_report.py` passes: rates exclude errors; a plugin with only passing test cases scores 0; risk equals `score_plugin` fed only failing strategies; category totals and risk; severity counts with an unknown severity; compliance coverage; `delta` cases (0/0 neutral, 0→x up 100, x→0 down 100, capped); existing threshold, provisional, paired and trend cases still hold. [unit]
- [x] Every top-level key and field the client in `Frontend/src/services/redTeam/redTeamService.js` reads is still produced (checked against that file, listed in the Log). [static]
- [x] No Mongo, provider or legacy import exists in the aggregator. [static]
- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `cd Frontend && npx vitest run` passes (no UI change expected); count in the Log. [unit]
- [x] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-22**: First implemented (Codex) from scratch; backend 591.
- **2026-11-22**: Reopened by the planner: port the scheduler aggregation, keep the payload (spec 00 revision).

- **2026-11-23** (before edits): The previous aggregator already excludes errors from rates, but sends only decided and worked counts to compliance and scores defended strategies alongside failing ones. The scheduler tallies per category and category strategy, counts failed severities, rolls up scored plugins and calculates changes in system risk and passed controls. The port uses the report's decided-only rate and rounding, supplies separate error counts to compliance, adds category outcomes and severity counts, and preserves the prior-run metadata while adding the scheduler deltas.
- **2026-11-23**: Ported the scheduler's aggregation in `red_team_report.py` and updated `test_red_team_report.py` and the inventory fragment. Verified the installed 0.126.0 declaration `EvaluateStats` in `dist/src/index.d.ts` and `getStats()` in `dist/src/eval-trIOsZxv.js` for `durationMs` and `tokenUsage`. Risk comes from the repository's existing scorer and framework data from spec 03.
- Checked `Frontend/src/services/redTeam/redTeamService.js` against the report. It declares `engine` (name, version, suite_id, generated_tests), `risk` (score, level), `attack_success` (rate, worked, decided), `decided`, `threshold`, `plugins`, `strategies`, `compliance`, `paired` (including test_id), `trend` and `provisional`. All remain available. Framework coverage is in `totals.coverage`. Category rows include observed catalog groups. Import inspection found only standard-library and pure Red Team helpers.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit/test_red_team_report.py` returned 36 passed. `.venv/bin/python -m pytest -q tests/unit` returned 620 passed and 8 warnings, including the now-green report cases from spec 03. `.venv/bin/python -m compileall -q app` exited 0.
- From `Frontend/`, `npx vitest run` returned 304 passed and 1 failure across 22 files. The failed case was the known progress-copy assertion in `RedTeamPage.test.jsx:64` owned by spec 18. The frontend gate remains open. No integration checks were required.
- **2026-11-23** (lead review, Claude): re-ran from `backend/`: parser+report+compliance 89 passed; whole unit suite 620 passed, 0 failures; compileall exit 0. Frontend 304 passed + the known spec-18 `RedTeamPage.test.jsx` failure only. Spot-checked: report keeps every prior key and adds `categories`, `severity_counts`; nine frameworks in compliance; rate excludes errors. Marked Done.
