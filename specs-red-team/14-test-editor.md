# Spec 14 — Test editor component

**Status:** Done
**Depends on:** Spec 06, Spec 07
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/TestEditor.jsx`, `Frontend/src/features/red-team/TestEditor.test.jsx`, `specs-red-team/inventory/14-test-editor.md`
**Reuses:** `Frontend/src/features/red-team/editorSummary.js`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `design/red-team/v3/new-test.html`, `INVENTORY.md#shared-components`

## Goal

The full-page test editor from approved `new-test.html`: target, plugins, strategies, grading with an optional judge, run settings with a closed Advanced section, and a sticky summary that blocks launch until the configuration is valid.

## Scope

- Controlled component. Props: `initial` (draft values or defaults), `capabilities`, `integrations`, `users`, `fieldErrors`, `message`, `busy`, `onSaveDraft(values)`, `onLaunch(values)`, `onCancel`.
- Sections and fields: Target (name, integration, model filtered by integration, mode segmented control Raw/With policies, "Run as" shown only in protected mode); What to attack (plugins grouped by `group` with severity and one framework tag, Select all, Clear); How attacks are disguised (Encodings and Framing groups; plain is described, not a checkbox); Grading (the three-step explanation, judge toggle, judge integration and model disabled when off); Run settings (attacks per plugin and strategy 1-10, pass threshold 50-100% as a number with a % suffix; Advanced `<details>` closed by default with seed and temperature 0-2).
- Summary from `editorSummary.js`: attacks, control questions, model calls, judge calls, estimated time, framework coverage, explanation of control questions, Save draft, Save and launch, Cancel. The blocking message renders in `role="status"` and is linked to the launch button with `aria-describedby`; launch is disabled while blocked or busy.
- Values submitted match the v3 test config contract (threshold as a 0-1 fraction, plugins, strategies without `basic`, tests per plugin, judge or null). Server `fieldErrors` render next to their fields with `FieldErrors`.

## Explicit non-scope

- Calling create, update or launch APIs and idempotency keys → spec 21.
- Server-side validation → spec 22.

## Reuse first

- `editorSummary.js` for every number; `labels.js` for severity badges; `FieldErrors`; existing `ui/button` and `ui/input`.

## Steps

1. Build the form and summary from the approved screen.
2. Test field behaviour, blocking and submitted values.

## Done when

- [x] `npm run test:components -- src/features/red-team/TestEditor.test.jsx` passes: choosing Raw hides "Run as"; Clear disables launch and announces "Choose at least one plugin" in a status region linked to the button; 10 attacks per plugin with all strategies announces the over-100 count; turning the judge off disables its selects and shows judge calls "None". [unit]
- [x] Submission tests: Save and launch calls `onLaunch` with threshold 0.8, the selected plugins and strategies (no `basic`), tests per plugin and the judge object; Save draft calls `onSaveDraft` with the same shape; a server field error for `plugins` renders beside the plugin section; Advanced is closed initially. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-11: Implemented `TestEditor.jsx` and `TestEditor.test.jsx` (10 tests passing). `npm test`: node 8/8 pass, vitest 194 passed across 18 files, 0 failures. `npm run lint` clean (earlier run showed other sessions' errors in unrelated files that later cleared). Build criterion run as `npx vite build --outDir <scratchpad>/build-14 --emptyOutDir` (succeeded) rather than `npm run build`, to avoid touching `dist`.
- Local blocking checks added beyond `editorSummary` (name, target, threshold range, judge selection). Component styling uses Tailwind utilities plus `rt-` classes; no CSS was added. Not verified in a browser.

- **2026-11-14**: Lead verification recorded as requested: backend unit 421 passed; frontend Vitest 194 passed; lint 0 problems; build passed.

- **2026-11-14**: Independent review restored earlier-format draft/clone editing: category selection, original attack count, category payload and 0–100% legacy threshold survive save and launch, with no v3-only fields. Also corrected the judge summary from a false up-to ceiling to an explicitly disclosed estimate (the spec 07 quarter estimate is unchanged; every undecided attack may take two attempts). Component and page regressions added. Frontend unit 214 Vitest + 8 Node, lint 0 errors/warnings, build, and 19 Red Team browser tests passed, including a real-browser legacy clone/save/launch regression.
