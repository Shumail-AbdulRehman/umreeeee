# Spec 12 — Test list and run progress

**Status:** Not started
**Depends on:** Spec 07
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/TestList.jsx`, `Frontend/src/features/red-team/TestList.test.jsx`, `Frontend/src/features/red-team/RunProgress.jsx`, `Frontend/src/features/red-team/RunProgress.test.jsx`, `specs-promptfoo/inventory/12-test-list-and-run-progress.md`
**Reuses:** `design/red-team/v3/tests.html`, `design/red-team/v3/running.html`, `DESIGN-SYSTEM.md#states-and-motion`, `DESIGN-SYSTEM.md#accessibility-floor`, `Frontend/src/components/ui/dialog.jsx`, `Frontend/src/components/StatusBadge.jsx`, `Frontend/src/features/red-team/labels.js`

## Goal

Show runtime readiness on the test list and honest live progress while a promptfoo run executes.

## Scope

- Rebuild list and in-progress layouts from `tests.html` and `running.html` using incumbent components; preserve loading, empty, retry and draft entry points. Readiness shows promptfoo version, "promptfoo Cloud key configured", broker and worker status; launch readiness requires all of them. Never reveal the key.
- Render phase-specific text: "Generating attacks (promptfoo hosted)" while generating, “Running attacks n/N” from counts, “Grading and importing results” when importing. No invented percentages: unplanned or unknown totals are indeterminate; executed counts must not exceed the visible interval. Show latest recorded results and provisional success only, not final risk.
- Keep the existing confirm dialog: “Cancel this test?” explains completed results are kept and that cancellation may not be immediate. Dismiss and Escape do not invoke the callback; confirm invokes once, guarded while busy. Terminal records have no cancel action.
- Use existing tokens only, no raw colour values, and plain status copy without generic filler. Keyboard can reach list actions and the dialog, focus is visible, dialog traps/restores focus, a polite live region announces meaningful phase changes; reduced motion removes progress transforms.

## Explicit non-scope

- Report summary → spec 13.
- Polling and mutations → spec 18.

## Reuse first

- Adapt current `TestList`, `RunProgress`, Radix dialog and spec 07 labels. Follow `DESIGN-SYSTEM.md#layout-conventions`, `#component-conventions`, `#states-and-motion` and `#accessibility-floor`.
- Keep readiness distinct from account verification as observed in `docs/research/promptfoo-local-probe.md` § Behaviour observed.

## Steps

1. Extend readiness presentation and test the runtime-present-but-unavailable state.
2. Render the phase from props, with accessible elapsed/latest updates and indeterminate fallback.
3. Confirm cancellation semantics under keyboard, busy and terminal conditions.

## Done when

- [ ] `cd Frontend && npx vitest run src/features/red-team/TestList.test.jsx src/features/red-team/RunProgress.test.jsx` covers readiness/version/key masking, all phases, count fallback, provisional figures, and dialog confirm/dismiss/focus restoration. [unit]
- [ ] No raw colours or new tokens; reduced motion and specific status copy are present. [static]
- [ ] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [ ] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [ ] `cd Frontend && npm run build` passes. [static]
