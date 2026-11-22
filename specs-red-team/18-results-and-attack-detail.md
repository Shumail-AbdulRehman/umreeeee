# Spec 18 — Results table and attack detail dialog

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ResultsTable.jsx`, `Frontend/src/features/red-team/AttackDetailDialog.jsx`, `Frontend/src/features/red-team/ResultsTable.test.jsx`, `specs-red-team/inventory/18-results-and-attack-detail.md`
**Reuses:** `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `Frontend/src/components/ui/dialog.jsx`, `design/red-team/v3/report.html`

## Goal

"What broke" at attack level: the results table with verdict chips and filters, and the attack detail dialog that shows the decision steps, the attack as written and as sent, the reply (raw and decoded), the judge's reasoning when used, and the same attack's result with policies.

## Scope

- `ResultsTable` props: `items`, `counts`, `filters` {verdict, plugin, strategy, evidence}, `plugins`, `strategies`, `page`, `pageSize`, `total`, `onFilterChange`, `onPageChange`, `onView(id)`. Verdict chips (All, Unsafe, Defended, Inconclusive, Errors, Controls) with counts and `aria-pressed`; selects for plugin, strategy and evidence. Columns: #, plugin, verdict badge (judged variants dashed), strategy, evidence text, View (accessible name "View attack N").
- `AttackDetailDialog` props: `result` (detail payload) or null, `loading`, `error`, `onClose`. Title from the verdict ("Unsafe: the hidden marker leaked", "Unsafe, judged", "Defended: the model refused"); kicker with attack number, plugin, strategy, severity. Ordered decision steps with the decisive step highlighted in the verdict's tone. Blocks: original attack; sent to the model (when different); reply as received; reply decoded (when present); judge reasoning, labelled as a judgement; withheld or expired notices instead of text; "Same attack with policies" from `result.paired`; latency, tokens and cost. Long text scrolls inside its block.
- Dialog opened by pointer animates per the design system; keyboard-opened opens without motion; focus returns to the View button.

## Explicit non-scope

- Loading results, detail and paired data → spec 21.
- Grading logic and evidence steps → spec 11.

## Reuse first

- `ui/dialog.jsx`; `labels.js` for verdict and evidence labels; `Pagination` from `components/Surface.jsx`.

## Steps

1. Build the table, chips and dialog from the approved screen.
2. Test filters, labels and dialog content branches.

## Done when

- [x] `npm run test:components -- src/features/red-team/ResultsTable.test.jsx` passes: chips show counts and pressing Unsafe calls `onFilterChange` with `verdict=fail`; a judged unsafe row shows "Unsafe · judged"; View calls `onView` with the result id. [unit]
- [x] Dialog tests: an exact base64 leak shows original, sent, raw and decoded blocks with the exact-evidence step decisive; a judged result shows the judge reasoning labelled as a judgement; a withheld result shows the withheld notice and no reply text; `paired` renders "Same attack with policies"; closing returns focus to the opener. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-11: Built `ResultsTable.jsx`, `AttackDetailDialog.jsx` and tests. `npm run test:components -- src/features/red-team/ResultsTable.test.jsx`: 9 passed. `npm test`: 18 files, 194 tests passed (vitest part), 0 failures. `npm run lint`: 0 errors, 0 warnings. Build verified with `npx vite build --outDir <scratchpad>/build-18 --emptyOutDir` (passed), not `npm run build`, to avoid writing `dist/`.
- Dialog uses native `<dialog class="rt-dialog">` rather than `ui/dialog.jsx` (radix) because `rt-dialog` styles depend on `[open]`. Dialog internals use inline `var(--rt-*)` styles since `red-team.css` has no dialog-body classes; spec 06 owns any CSS follow-up.
- Not verified here: real browser focus restore and entry animation (jsdom has no `showModal`).

- **2026-11-14**: Radix dialog and View-button/ Escape focus restoration verified: targeted 10, backend unit 421, frontend component 195 + Node 8 passed; compile, lint (0 problems), build passed. Browser verification follows in spec 24.

- **2026-11-14 (spec 24 regression)**: Desktop and 390px axe scans exposed 3.68:1 contrast on skipped decision steps because of opacity 0.7. Removed the opacity reduction in the owning dialog; skipped text retains its label and full token contrast. Browser/whole-suite verification recorded in spec 24.

- **2026-11-14**: Independent review added an optional current-run mode prop to the attack dialog, passed by spec 21, so protected reports describe their paired result as Same attack without policies. Added a component regression and protected-report browser regression. Frontend unit 214 Vitest + 8 Node, lint/build and Red Team browser 19 pass.
