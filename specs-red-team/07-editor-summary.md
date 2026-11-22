# Spec 07 — Editor summary calculations

**Status:** Done
**Depends on:** Spec 00
**Model:** Light — `claude-haiku-5-5` · `gpt-6-luna` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/editorSummary.js`, `Frontend/src/features/red-team/editorSummary.test.js`, `specs-red-team/inventory/07-editor-summary.md`
**Reuses:** `design/red-team/v3/prototype.js`, `ARCHITECTURE.md#data-model`

## Goal

One pure function that turns the editor's current choices and the capabilities response into the live summary: attack count, model calls, estimated judge calls, estimated minutes, framework coverage and the blocking validation message.

## Scope

- Input: selected plugin ids, selected strategy ids (without `basic`), tests per plugin, judge on/off, and the capabilities object (`plugins[].frameworks`, `frameworks[].total`, `max_attacks`, `max_tests_per_plugin`, `requests_per_minute`, `control_count`).
- Output: `attacks` (plugins × (strategies + 1) × tests), `controls`, `modelCalls`, `judgeCalls` (an estimate of a quarter of attacks rounded up, or 0 without a judge; each undecided attack can actually take up to two judge attempts), `minutes` (calls ÷ requests per minute, rounded up), `coverage` per framework (distinct mapped controls covered by the selected plugins and the framework total), and `blocking` (null, or one message: no plugin selected; over the attack maximum with the actual count; tests per plugin outside 1-max).
- Pure and deterministic; tolerant of missing capability fields (falls back to the documented defaults of 100, 10, 6 and 5).

## Explicit non-scope

- Rendering the summary or disabling the launch button → spec 14.
- Server-side validation of the same limits → spec 22.

## Reuse first

- Match the behaviour of the approved prototype's summary (`design/red-team/v3/prototype.js`), but compute coverage from capabilities, not the prototype's hard-coded map.

## Steps

1. Implement the function.
2. Unit-test the documented cases.

## Done when

- [x] `npm run test:components -- src/features/red-team/editorSummary.test.js` passes: 8 plugins, 3 strategies, 3 tests and a judge give 96 attacks, 101 model calls, judge estimate 24 and 21 minutes at 6 per minute; no plugins gives 0 coverage and the "choose at least one plugin" block; 8 plugins, 7 strategies, 10 tests gives 640 and the over-maximum block; coverage counts distinct controls, not plugin-control pairs. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- **2026-11-11**: Implemented `editorSummary.js` and `editorSummary.test.js`, plus the inventory fragment. Pure function, no React or fetch. Coverage is taken from capabilities; the prototype's hard-coded map is not used.
- **2026-11-11**: `npm run test:components -- src/features/red-team/editorSummary.test.js`: 10 passed, 0 failed. Covers 96 attacks, 101 model calls, judge "up to 24", 21 minutes; no plugins gives coverage 0 and the choose-a-plugin block; 640 attacks gives the over-maximum block naming 640; distinct-control coverage; capability fallbacks.
- **2026-11-11**: `npm test` from `Frontend/`: exit 0. Vitest 8 files, 99 tests passed, 0 failed. Node `tests/*.test.mjs` also passed.
- **2026-11-11**: `npm run lint`: exit 0, 0 errors, 0 warnings.
- **2026-11-11**: Build criterion: `npx vite build --outDir /tmp/claude-1000/-home-shumail-umer-FYP-FYP-Part-1/0b901e85-ca2c-4b3b-b884-1e80899ba04b/scratchpad/build-07 --emptyOutDir` instead of `npm run build`, because other sessions build concurrently. Exit 0, built in 14.30s.
- **2026-11-11**: Not verified here: browser behaviour of the editor (spec 14). Spec 14 should consume `coverage` as an array of `{id, name, covered, total}`.

- **2026-11-14**: Independent review corrected the plan's misleading "ceiling" wording: the quarter-of-attacks calculation is an estimate, while spec 23 permits two attempts for every undecided attack. Spec 14 now labels it "about" and discloses the actual retry bound. The calculation and historical Log results are unchanged.
