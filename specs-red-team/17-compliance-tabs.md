# Spec 17 — Compliance coverage tabs

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ComplianceTabs.jsx`, `Frontend/src/features/red-team/ComplianceTabs.test.jsx`, `specs-red-team/inventory/17-compliance-tabs.md`
**Reuses:** `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `design/red-team/v3/report.html`

## Goal

The compliance section from the approved report: one accessible tab per framework with totals in the tab, and a list of controls (failed first) with status and evidence, stating the rule and that this is synthetic coverage, not certification.

## Scope

- Props: `compliance` (array of frameworks with totals and controls), `provisional`.
- Heading "Compliance coverage" with the rule note. Tabs follow the WAI-ARIA tabs pattern: `role="tablist"`, roving `tabIndex`, Left/Right/Home/End, `aria-controls`, panels with `role="tabpanel"` and `tabIndex=0`. Tab text: framework name and "N failed · N passed · N not tested".
- Control rows: id (or nothing when null, for unverified ATLAS tactics), name, status badge (Failed, Passed, Not tested) and evidence text ("13 of 43 mapped attacks worked", or the not-tested reason). The order supplied by the API is preserved.
- When `provisional` is true or `compliance` is null, render a single note ("Compliance is calculated when the test finishes") instead of tabs.

## Explicit non-scope

- Computing statuses → spec 04 (rules) and spec 12 (counts).
- Framework coverage in the editor → spec 14.

## Reuse first

- `labels.js` for control status labels and tones; shared list classes from `red-team.css`.

## Steps

1. Build the tabs and list.
2. Test keyboard behaviour, null IDs and the provisional note.

## Done when

- [x] `npm run test:components -- src/features/red-team/ComplianceTabs.test.jsx` passes: four tabs render with their totals; ArrowRight, ArrowLeft, Home and End move selection and focus and show the matching panel only; a control with a null id renders its name without an id cell text. [unit]
- [x] Content tests: failed controls show the worked-of-decided evidence; not-tested controls show their reason; a provisional report shows the "calculated when the test finishes" note and no tablist. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

2026-11-11: Built `ComplianceTabs.jsx` and tests (7 passing; `fireEvent`, no jest-dom matchers as none is set up). `npm test`: 164 passed, 1 failed in `TestList.test.jsx` (another session's spec, untouched). `npm run lint` shows errors only in other sessions' files (e.g. `TestList.jsx`); my two files lint clean. Build run as `npx vite build --outDir <scratchpad>/build-17 --emptyOutDir`: passed.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.

- **2026-11-14 (spec 24 regression)**: Spec 24 mobile visual review found long control names colliding with verdict badges. Added semantic row hooks and the shared feature stylesheet now stacks name, verdict and evidence in the value column at 390px. Browser regression checks text bounds for overlap. Verification counts are recorded in spec 24.
