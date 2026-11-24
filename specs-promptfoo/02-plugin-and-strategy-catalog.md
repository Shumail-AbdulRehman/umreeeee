# Spec 02 — Plugin and strategy catalog

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/scripts/extract_promptfoo_catalog.py`, `backend/app/red_team/promptfoo_catalog.json`, `backend/app/red_team/catalog.py`, `backend/tests/unit/test_promptfoo_catalog.py`, `specs-promptfoo/inventory/02-plugin-and-strategy-catalog.md`
**Reuses:** `backend/app/red_team/risk_scoring.py`, `INVENTORY.md#red-team-domain`

## Goal

Commit a curated promptfoo plugin and strategy catalog, extracted from the installed package, that drives the editor's choices, the server-side validation, the target-call estimate and the report labels.

## Scope

- Derive metadata from the pinned package's static constants, documented in `docs/research/promptfoo-redteam.md` §§3–4. Curate the entries listed in `docs/planning/promptfoo/splits.md` spec 02 (security & access, data & privacy, trust & safety including the `harmful:*` categories listed, brand/behaviour) that need no extra per-plugin config, and the strategies listed there including the hosted ones (`jailbreak:meta`, `jailbreak:composite`, `crescendo`, `goat`); verify every id exists in 0.126.0 and record removals in the Log. Store metadata only (no prompts).
- Persist IDs, names, descriptions, groups (Security & access, Data & privacy, Trust & safety, Brand/behaviour), default severity (`critical`, `high`, `medium`, `low`), remote-only (hosted generation) and multi-turn flags, and target calls per test for multi-turn strategies (research §4). Require `basic` in the strategy registry. Unknown historical IDs remain visible as labels in reports but are not selectable.
- `catalog.py` validates and freezes both registries, exposes groups and severities, and provides `estimated_target_calls(plugins, strategies, tests_per_plugin)`. Count `basic` once; sum independently selected variants and apply each fixture strategy's documented per-case multiplier. Spec 16 enforces the 200-call cap with this estimate.

## Explicit non-scope

- Framework mapping → spec 03.
- Editor selection and estimate presentation → spec 11.

## Reuse first

- Reuse the severity vocabulary in `backend/app/red_team/risk_scoring.py`; no runtime imports of the legacy catalog.
- Treat the installed artifact from spec 01 as the source of truth for present IDs and display metadata; do not infer a missing ID or import provider implementations.

## Steps

1. Locate the metadata in the installed package and record its verified provenance. Read data offline; never instantiate a plugin or strategy.
2. Emit deterministically ordered JSON; fail loudly for a missing selected ID or invalid metadata instead of silently dropping it.
3. Implement read-only registry access and document the estimate with a synthetic example. Keep the generated file small and reviewable.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_catalog.py` proves committed JSON validates, IDs are unique, severities are valid, `basic` exists, and a synthetic multi-turn multiplier increases calls but not case count; duplicate basic and unknown IDs are covered. [unit]
- [ ] Re-extraction from the pin produces the committed JSON byte-for-byte and never executes a provider or generator. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes; log the count. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/extract_promptfoo_catalog.py` pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Verified the root manifest, lockfile and installed `node_modules/promptfoo/package.json` agree on `0.126.0`. Copied the installed MIT license into the JSON artifact. Read the CLI's `dist/src/tables-DaSnT9dV.js` for plugin IDs, required-config IDs, harmful plugin classifications, remote-only plugin IDs, `riskCategories`, `riskCategorySeverityMap`, `Severity`, strategy IDs, `MULTI_TURN_STRATEGIES` and `DEFAULT_N_FAN_OUT_BY_STRATEGY`. Extracted the display names and descriptions from the `OV` and `DV` maps in `dist/src/app/assets/index-Cvjh7gqz.js`.
- Checked the selected IDs against the installed source and kept all 24 listed plugins. In `dist/src/main.js`, `system-prompt-override` uses the generic remote registration with no extra config validator. Included 15 registered strategies, covering all ten individual single-turn encodings. Left out the `other-encodings` collection since it expands to four individually listed encodings. Left out `multilingual` because `tables-DaSnT9dV.js` handles it as a deprecated migration to top-level `language` and `dist/src/strategies-BeuvBHPx.js` has no standalone registration for it.
- Checked the baseline and per-strategy case accounting in `dist/src/main.js`, the remote requirement for composite in `strategies-BeuvBHPx.js`, and the guards and defaults in `dist/src/iterativeMeta-B0iMSL8z.js`, `goat-BAnIH6jt.js` and `crescendo-CKMXB6Jw.js`. Composite adds five cases with one target call each. Meta budgets ten calls per case and remains single-turn. GOAT budgets five calls per case. Crescendo supports local generation and budgets twenty calls per case from the ten-turn and ten-backtrack defaults. The estimate budgets every selected variant against each seed, including seeds from strategy-exempt plugins, so it can overestimate their calls. In the synthetic example, two plugins with three seeds each and one four-call variant yield 12 cases and 30 calls.
- `cd backend && .venv/bin/python scripts/extract_promptfoo_catalog.py --check` matched `promptfoo_catalog.json` byte-for-byte. The extractor read static files with Python and did not invoke the CLI, providers or generators.
- `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_catalog.py` returned **23 passed**. `cd backend && .venv/bin/python -m pytest -q tests/unit` returned **565 passed, 8 dependency deprecation warnings**. Python and pytest caches for these checks were directed to `/tmp`.
- `cd backend && .venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/extract_promptfoo_catalog.py` both exited 0. `cd Frontend && npm run build -- --outDir /tmp/promptfoo-catalog-build.1S1GP3` exited 0 after transforming 2,941 modules in 5.84 seconds. Vite reported an unresolved `compareRedTeamTests` import in `src/pages/RedTeamPage.jsx` (Spec 18), an external output directory notice and a plugin timing warning.
- Wrote the reusable symbols and data shapes in `inventory/02-plugin-and-strategy-catalog.md`. This spec has no MongoDB integration criterion.
