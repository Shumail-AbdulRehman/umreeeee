# Spec 15 — Running test view and cancel confirmation

**Status:** Done
**Depends on:** Spec 06
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/RunProgress.jsx`, `Frontend/src/features/red-team/RunProgress.test.jsx`, `specs-red-team/inventory/15-run-progress.md`
**Reuses:** `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `Frontend/src/components/ui/dialog.jsx`, `design/red-team/v3/running.html`

## Goal

The in-progress view from approved `running.html`: honest progress, state counts, pacing explanation, provisional figures with no final risk, latest results, and a cancel confirmation dialog that lists the consequences.

## Scope

- Props: `test` (with `progress`), `provisional` (attack success so far, decided so far), `latest` (recent results), `requestsPerMinute`, `updatedAgo` (seconds), `dispatchPending`, `busy`, `onCancel`.
- Progress bar with `role="progressbar"` and value/max; counts for finished, running, queued and waiting to retry; pacing note with the remaining-time estimate from queued count and pace; a polite live "Updated N s ago" line; a note when dispatch is pending ("waiting for the queue, not a result").
- Provisional KPIs labelled "Provisional"; overall risk shows "Not yet" with the explanation that partial runs never show a final score.
- Latest results table with verdict badges including "Judging".
- Cancel: "Cancel test" opens a Radix dialog titled "Cancel this test?" listing queued attacks that will not run, that the in-progress attack may still finish and cost money, and that finished results stay in a cancelled report. "Keep running" closes and returns focus; the confirm button calls `onCancel` once. Never `window.confirm`.

## Explicit non-scope

- Polling and the cancel API call → specs 08 and 21.
- The cancelled report banner → spec 19.

## Reuse first

- `ui/dialog.jsx` for the confirmation (focus trap and restore); `labels.js` for verdict and status labels.

## Steps

1. Build the view and dialog from the approved screen.
2. Test progress semantics, provisional gating and the dialog.

## Done when

- [x] `npm run test:components -- src/features/red-team/RunProgress.test.jsx` passes: the progress bar exposes 46 of 101; overall risk reads "Not yet"; provisional figures carry the "Provisional" label; the pacing note gives the minutes for 53 queued at 6 per minute; the updated line is in a polite live region. [unit]
- [x] Dialog tests: Cancel test opens the dialog with the three consequences; Keep running closes it without calling `onCancel` and returns focus to the trigger; confirming calls `onCancel` exactly once; the trigger is disabled while `busy`. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-11: Implemented `RunProgress.jsx` and 6 component tests (pass). `npm test`: 193 passed, 1 failed (`ResultsTable.test.jsx`, another spec's file, untouched); count taken while other sessions were mid-work. `npm run lint`: my two files clean; repo-wide errors are in other specs' files (`only-export-components`). Build criterion: `npx vite build --outDir <scratchpad>/build-15 --emptyOutDir` passed. Done-when boxes for `npm test`, lint and build left unticked pending the lead's full re-run; the unit boxes are ticked.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.
