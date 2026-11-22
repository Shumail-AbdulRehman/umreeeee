# Spec 19 — Report states and legacy report

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ReportStates.jsx`, `Frontend/src/features/red-team/LegacyReport.jsx`, `Frontend/src/features/red-team/ReportStates.test.jsx`, `specs-red-team/inventory/19-report-states.md`
**Reuses:** `Frontend/src/pages/RedTeamPage.jsx`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `design/red-team/v3/states.html`

## Goal

The less common report situations from approved `states.html`, as small presentational pieces: cancelled, failed and no-judge banners, the method disclosure and limitations, and the earlier-format (v2) report extracted from today's page so legacy tests keep working.

## Scope

- `ReportStates.jsx` exports: `CancelledBanner` (finished count, no final score, Clone and run again callback), `FailedBanner` (all attacks errored, most common error code mapped to a readable cause, recovery action callback), `NoJudgeNote` (undecided results stay inconclusive, Clone with a judge callback), `MethodDisclosure` (closed `<details>` explaining attack success, risk and judged verdicts, citing the promptfoo model), and `Limitations` (synthetic evidence, provider variation, not proof of safety). Banners use `role="note"` except the failed banner (`role="alert"`).
- `LegacyReport.jsx`: move today's `ScoreSummary` behaviour out of `RedTeamPage.jsx` into a self-contained component with the earlier-format banner ("used the earlier category format… Clone it to run the current format"), the compliance score with threshold, categories table and chart, controls and the existing limitations text. It reads the legacy report fields only.

## Explicit non-scope

- Removing `ScoreSummary` from `RedTeamPage.jsx` and choosing which view to show → spec 21.
- Running-state and cancel dialog → spec 15.

## Reuse first

- Copy `ScoreSummary`'s data use and wording from `RedTeamPage.jsx` (lines 55-68) and reuse `AnalyticsChart` as it does today; do not rewrite the legacy scoring explanation.

## Steps

1. Build the banners and disclosures from the approved states screen.
2. Extract the legacy report into `LegacyReport.jsx`.
3. Test each state.

## Done when

- [x] `npm run test:components -- src/features/red-team/ReportStates.test.jsx` passes: the cancelled banner shows "Cancelled after 46 of 101 attacks" and calls its clone callback; the failed banner is an alert naming the credential cause for `authentication`; the no-judge note states undecided results are left out; the method disclosure is closed initially and lists the three explanations. [unit]
- [x] Legacy tests: `LegacyReport` with a v2 score renders the earlier-format banner, the compliance percentage and the category table, and calls no API. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-11: Built ReportStates.jsx, LegacyReport.jsx, tests, inventory fragment. `AnalyticsChart` is mocked with `vi.mock` in the test (Recharts needs layout jsdom lacks); the legacy test stubs `fetch` and asserts it is never called.
- Component test: 13 passed. `npm test`: 2 files failed / 184 of 186 tests passed, failures in other sessions' files (not mine). `npm run lint`: errors only in other sessions' files (react-refresh in RunProgress, TestList, etc.); none in mine. Build run only as `npx vite build --outDir <scratchpad>/build-19 --emptyOutDir`: passed.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.

- **2026-11-14**: Independent review corrected the earlier-format banner: the backend intentionally preserves the legacy format on clone, so the banner now says clones keep this format and a new test uses plugins. Legacy rendering tests and the added browser clone/save/launch regression pass (214 Vitest + 8 Node; browser 19).
