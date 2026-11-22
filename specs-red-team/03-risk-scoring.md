# Spec 03 — Risk scoring model

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/risk_scoring.py`, `backend/tests/unit/test_red_team_risk_scoring.py`, `specs-red-team/inventory/03-risk-scoring.md`
**Reuses:** `docs/research/red-team-frameworks.md`, `INVENTORY.md#permitted-risk-scoring-source`

## Goal

A pure Python module that scores each plugin and the whole test on promptfoo's 0-10 risk model, adapted per spec 00 so fully defended plugins score 0.

## Scope

- Start from the permitted `scheduler_umr/utils/risk_scoring.py` (read with `unzip -p ~/Downloads/scheduler_umr.zip scheduler_umr/utils/risk_scoring.py`; never extract logs). Keep its attribution comment and add one line naming the code owner's permission and promptfoo's MIT license.
- Keep: impact base by severity, exploitability modifier, human-factor modifier, complexity penalty, the 10 cap, level thresholds, system aggregation with +0.5 per additional Critical and +0.25 per additional High, and the strategy metadata table.
- Add metadata for this project's strategy ids (`basic`, `base64`, `rot13`, `leetspeak`, `hex`, `roleplay`, `hypothetical`, `authority`) consistent with spec 00's effort column; unknown ids fall back to the upstream default.
- Inputs use this project's terms: per plugin, per strategy, counts of decided attacks and attacks that worked (unsafe). Hide the upstream inverted "passed means attack succeeded" convention inside the module; the public functions never expose it.
- Return a plugin score of 0 with level `none` when no decided attack worked or nothing was decided; never the upstream non-zero baseline.
- Remove helpers this project does not use (ASR-only score, colours, enable/disable extension toggles) rather than carrying dead code.

## Explicit non-scope

- Aggregating jobs into per-plugin counts → spec 12.
- Displaying levels and colours → spec 16.

## Reuse first

- The permitted company port is the implementation basis; do not re-derive the formula from scratch.
- Severity vocabulary (critical, high, medium, low) is fixed in spec 00, so this spec does not wait for the catalog.

## Steps

1. Port, rename to this project's terms, add the zero-success rule and the strategy metadata.
2. Write table-driven unit tests from the research doc's formula.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_risk_scoring.py` passes: a high-severity plugin where 2 of 3 `authority` attacks worked scores 7.93 (to two decimals) and level High; any plugin with zero worked attacks scores 0 and level `none`; scores never exceed 10; the worst strategy is reported. [unit]
- [x] System tests: one High plugin at 8.6 plus three more High plugins gives 9.35 and level Critical; two Critical plugins add exactly 0.5; an empty plugin list gives 0 and `none`. [unit]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-11**: Implemented `risk_scoring.py` (pure, public API in inventory fragment) and 176 unit-test cases in `test_red_team_risk_scoring.py`, all passing. `tests/unit`: 354 passed, 0 failed. `compileall -q app scripts` exit 0. Zero-success rule yields score 0 / level `none` (also for system when empty). Upstream ASR-only score, colours, formatters, extension toggles and raw-stat converters removed.

- **2026-11-14**: Independent review corrected the original Log date markup so the validator recognizes the existing dated evidence; historical results are unchanged.
