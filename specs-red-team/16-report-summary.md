# Spec 16 — Report summary, plugin table and strategy breakdown

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ReportSummary.jsx`, `Frontend/src/features/red-team/PluginTable.jsx`, `Frontend/src/features/red-team/StrategyBreakdown.jsx`, `Frontend/src/features/red-team/ReportSummary.test.jsx`, `specs-red-team/inventory/16-report-summary.md`
**Reuses:** `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `design/red-team/v3/report.html`, `ARCHITECTURE.md#data-model`

## Goal

The top of the approved report: the risk card that compares raw and with-policies risk, the attack-success card with proven/judged split and threshold, the quieter decided card, the "What broke, by plugin" table with a with-policies column, and the by-strategy bars.

## Scope

- `ReportSummary` props: `report` (v3 payload), `mode`. Risk card: this run's score, level and scale; the paired run's score and level when `report.paired` exists, otherwise a "Clone as protected/raw to compare" prompt; reduction in points and the trend sentence when `report.trend` exists. Attack-success card: rate, the paired rate, worked/decided with proven and judged counts, threshold line in the warning tone when below. Decided card: decided of adversarial, exact/judge split, inconclusive and errors left out of the score.
- `PluginTable` props: `plugins`, `paired` per-plugin rates. Columns: plugin with severity, risk score and level, attacks that worked (bar, rate, worked of decided), with policies (rate or "Not scored"), worst strategy or "No attack worked". Focusable labelled region; stacks below 600px.
- `StrategyBreakdown` props: `strategies`. One bar per strategy with rate and worked of decided; one summary sentence naming the two highest.
- Bars are decorative (`aria-hidden`); every number is also text. Nothing animates.

## Explicit non-scope

- Compliance tabs → spec 17. Results and attack dialog → spec 18. Cancelled, failed and no-judge banners → spec 19.
- Fetching the report or the paired test → spec 21.

## Reuse first

- `labels.js` for level and severity; `formatPercent`/`formatNumber` from `lib/format.js`.

## Steps

1. Build the three components from the approved screen.
2. Test with a fixture matching the approved sample numbers.

## Done when

- [x] `npm run test:components -- src/features/red-team/ReportSummary.test.jsx` passes: the risk card shows 9.4 Critical and 4.1 Medium with "lowered risk by 5.3 points"; without `paired` it shows the clone prompt; the attack-success card shows 21.6%, "15 proven", "4 judged" and the below-threshold line. [unit]
- [x] Table tests: rows render sorted as given with level badges; a fully defended plugin shows 0.0, None and "No attack worked"; a missing paired rate shows "Not scored"; the strategy summary names Authority and Role-play for the sample data. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-11: Built `ReportSummary`, `PluginTable`, `StrategyBreakdown` (default exports) and `ReportSummary.test.jsx`. Component test: 10 passed. `npm test`: 193 passed, 1 failed (`ResultsTable.test.jsx`, another session's spec). `npm run lint`: no problems reported at last run. Build run only as `npx vite build --outDir <scratchpad>/build-16 --emptyOutDir`: built OK. Fixture plugin rows are abridged from the approved sample. Not verified: visual match in a browser.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.

- **2026-11-14 (spec 24 regression)**: Spec 24 API-shaped fixture exposed the strategy ID authority instead of its supplied label Authority. PluginTable now prefers worst_strategy_name, retaining the existing fallback, and its unit fixture uses real ID/name fields. Verification counts are recorded in spec 24.

- **2026-11-14**: Independent review corrected paired plugin column labels: a protected report now labels the paired raw model rates Raw model, including stacked-cell labels. Raw reports keep With policies. Added a component regression; 214 Vitest + 8 Node and the 19-case browser suite pass, including protected pairing.
