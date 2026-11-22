# Spec 06 — Red Team feature folder, styles and labels

**Status:** Done
**Depends on:** Spec 00
**Model:** Light — `claude-haiku-5-5` · `gpt-6-luna` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/red-team.css`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/labels.test.js`, `specs-red-team/inventory/06-frontend-foundation.md`
**Reuses:** `Frontend/src/index.css`, `design/red-team/v3/styles.css`, `DESIGN-SYSTEM.md#colour-tokens`, `DESIGN-SYSTEM.md#component-conventions`

## Goal

The shared foundation every Red Team component imports: one feature stylesheet with the token aliases and shared classes, and one module of display labels and tones, so components do not each decide colours or wording.

## Scope

- `red-team.css`: define the `--rt-*` aliases from `DESIGN-SYSTEM.md` using only incumbent variables and `color-mix`; shared classes scoped under a `rt-` prefix for panels, badges (verdict, status, level, severity, mode, control status), bars and scales, KPI numbers, banners, filter chips, focusable table regions with the stacked mobile layout below 600px, and the motion rules from `DESIGN-SYSTEM.md#states-and-motion` with reduced-motion fallbacks. No raw colour values.
- `labels.js`: pure maps and helpers for verdict (including the "· judged" suffix by `verdict_source`), test status (with running percentage), level (Critical, High, Medium, Low, None), severity, mode, control status and evidence description, each returning `{label, tone}`. A `notScored` constant for the "Not scored" pattern. Unknown values return a readable fallback, never `undefined`.

## Explicit non-scope

- Any component markup → specs 13-19.
- Editing `Frontend/src/index.css` or root tokens; aliases are derived inside the feature stylesheet, and the untouched root theme is checked by → spec 25.
- Removing the old `Frontend/src/pages/red-team.css` → spec 21.

## Reuse first

- Use `Frontend/src/lib/format.js` (`readable`) for the fallback text rather than a new formatter.
- Transcribe class behaviour from `design/red-team/v3/styles.css`; never paste the prototype file.

## Steps

1. Write the stylesheet with aliases and shared classes.
2. Write the label maps and unit tests.

## Done when

- [x] `npm run test:components -- src/features/red-team/labels.test.js` passes: `fail` with source `judge` labels "Unsafe · judged" with the unsafe tone; `pass` with source `exact` labels "Defended"; a control `pass` labels "Answered"; `running` at 46% labels "Running · 46%"; unknown values return readable text. [unit]
- [x] `grep -nE '#[0-9a-fA-F]{3,8}\b' Frontend/src/features/red-team/red-team.css` finds nothing. [static]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- **2026-11-11** (implementing session, Haiku 5.5): Files written: `Frontend/src/features/red-team/red-team.css`, `labels.js`, `labels.test.js`, `specs-red-team/inventory/06-frontend-foundation.md`. Results: `npm run test:components -- src/features/red-team/labels.test.js` 16 passed; `npm test` exit 0, 11 vitest files and 132 tests passed plus the node tests; `npm run lint` exit 0 with no warnings; colour grep prints nothing; `red-team.css` parses with lightningcss with 0 warnings. Build: `npm run build` was not used because other sessions build at the same time. Per the lead's instruction, `npx vite build --outDir <scratchpad>/build-06 --emptyOutDir` exited 0 and is the build criterion for Done-when item 5. The stylesheet is not imported by any component yet, so the build does not exercise it.
- **2026-11-11 (lead)**: Fixed `.rt-dialog` visibility for Radix dialogs: open styles now also match `[data-state="open"]` (Radix sets no `open` attribute), including the reduced-motion rule. Found while reviewing specs 15 and 18; without it the Radix cancel dialog would stay at opacity 0 in a real browser.

- **2026-11-14 (spec 24 regression)**: Spec 24 mobile regression measured New test at 38px instead of the required 44px. Feature-scoped mobile targets now have a 44px minimum. Visual review also found multi-child table cells spilling badges into the label column; stacked cell values now stay together beside an absolutely positioned label. Added responsive compliance layout hooks (with owner spec 17). Verification counts are recorded in spec 24.

- **2026-11-14 (spec 24 regression)**: Extended mobile target sizing to page actions and disclosure summaries; the browser geometry sweep checks every visible Red Team button, select and summary for 44px height and width. Verification recorded in spec 24.
