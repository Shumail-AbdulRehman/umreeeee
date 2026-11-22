# Spec 13 — Test list component

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/TestList.jsx`, `Frontend/src/features/red-team/TestList.test.jsx`, `specs-red-team/inventory/13-test-list.md`
**Reuses:** `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `design/red-team/v3/tests.html`, `design/red-team/v3/states.html`, `INVENTORY.md#shared-components`

## Goal

The Red Team landing view from approved `tests.html`: readiness strip, search and filters, and the tests table with each protected run grouped under the raw run it was cloned from, plus the empty and not-ready states.

## Scope

- Controlled component. Props: `items`, `total`, `page`, `pageSize`, `onPageChange`, `query`, `status`, `mode`, `onFilterChange`, `readiness` (`ready` | `waiting`, last-seen seconds, queue connected, requests per minute), `onNew`, `onOpen(testId)`.
- Grouping: tests sharing `comparison_group_id` render as one group, raw first, the other mode as an indented "With policies" row; ungrouped tests render alone. Groups preserve the incoming order.
- Columns: Test, Overall risk (score + level badge, "Not scored" when absent, "Earlier format · compliance N%" for legacy tests), Attack success, Status (badge with running percentage), Mode, Target model (model + provider), Created. Filters: search, status (including Cancelled), mode ("All modes").
- States: empty list (title, explanation, New test), not-ready strip (`role="status"`, runner last seen, tests will wait), and filtered-to-nothing (message plus clear filters).
- Rows open by link/button with an accessible name containing the test name; the table is a focusable labelled region and stacks below 600px via the shared classes.

## Explicit non-scope

- Fetching tests, readiness or debouncing search → spec 21.
- The editor opened by New test → spec 14.

## Reuse first

- Use `labels.js` for every badge and the "Not scored" pattern; `Pagination` and `SearchInput` from `components/Surface.jsx`; `formatDate`/`formatPercent` from `lib/format.js`.

## Steps

1. Build the component from the approved screen using the shared classes.
2. Test grouping, states and callbacks from props.

## Done when

- [x] `npm run test:components -- src/features/red-team/TestList.test.jsx` passes: a raw and protected test with one `comparison_group_id` render as one group with the protected row labelled "With policies"; a legacy test shows its earlier-format compliance; a running test shows "Running · 46%"; missing risk is announced as "Not scored". [unit]
- [x] State tests: no items shows "No Red Team tests yet" with a New test button calling `onNew`; `waiting` readiness renders a status region; changing status, mode and search calls `onFilterChange`; activating a row calls `onOpen` with its id. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

### 2026-11-11
- Files: `TestList.jsx`, `TestList.test.jsx`, `inventory/13-test-list.md`. Fields read are listed in the inventory fragment.
- Component tests: 7 passed. `npm test`: 193 passed, 1 failed (`ResultsTable.test.jsx`, another session's spec; not touched). Lint: no findings in my files; remaining errors are `react-refresh/only-export-components` in `RunProgress.jsx` and `StrategyBreakdown.jsx` (other sessions).
- Build criterion: `npx vite build --outDir <scratchpad>/build-13 --emptyOutDir` passed.
- Needs from other specs: no rt-classes exist for selects, toolbar or link-buttons, so those use small inline styles; spec 06 could add `rt-select`, `rt-link-button`.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.
