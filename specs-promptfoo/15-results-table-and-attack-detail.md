# Spec 15 — Results table and attack detail

**Status:** Done
**Depends on:** Spec 07
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ResultsTable.jsx`, `Frontend/src/features/red-team/ResultsTable.test.jsx`, `Frontend/src/features/red-team/AttackDetailDialog.jsx`, `Frontend/src/features/red-team/AttackDetailDialog.test.jsx`, `Frontend/src/features/red-team/ReportStates.jsx`, `Frontend/src/features/red-team/ReportStates.test.jsx`, `specs-promptfoo/inventory/15-results-table-and-attack-detail.md`
**Reuses:** `design/red-team/v3/report.html`, `design/red-team/v3/states.html`, `DESIGN-SYSTEM.md#component-conventions`, `DESIGN-SYSTEM.md#accessibility-floor`, `Frontend/src/components/ui/dialog.jsx`, `Frontend/src/components/ui/table.jsx`, `Frontend/src/components/DataState.jsx`, `Frontend/src/features/red-team/labels.js`

## Goal

Let reviewers find a stored result, inspect why it was decided, and distinguish failure from missing evidence.

## Scope

- Rebuild results, detail and state views from `design/red-team/v3/report.html` and `states.html` in incumbent components. Controlled filters for plugin, strategy, verdict and source emit a single callback and reset pagination; clear filters restores all rows. Expose loading, empty, no matches and failed fetch separately.
- A keyboard-accessible action opens detail for that result. Show prompt and reply strictly as text, decision and policy evidence, grader reason labelled “promptfoo grader (<model>)” where applicable, and paired result if present. Use a specific placeholder for expired or unavailable content; do not render executable markup or offer replay from result text.
- Cancelled notice shows finished/total and keeps result access. Handle `no_tests_generated`, `interrupted`, `promptfoo_unavailable`, `promptfoo_api_key_missing`, `promptfoo_auth_failed` and unknown codes with plain, specific next steps (for example `no_tests_generated`: check the purpose and plugins, then clone and launch again; `promptfoo_api_key_missing`, `promptfoo_auth_failed`: set `PROMPTFOO_API_KEY` in `backend/.env`; `promptfoo_auth_failed`: the key was rejected — create a new one in promptfoo Cloud). Do not show raw errors or generic filler.
- Use only existing tokens; no raw colour values. Keep filters labelled, row actions focusable and visible, and tables keyboard-scrollable. Trap and restore focus in the dialog, support Escape, and remove dialog transforms under reduced motion.

## Explicit non-scope

- Fetch, polling and stale request handling → spec 18.
- Authorized detail, retained content and pairing lookup → spec 16.

## Reuse first

- Adapt current `ResultsTable`, `AttackDetailDialog` and `ReportStates`, shared dialog primitives and spec 07 labels. Apply `DESIGN-SYSTEM.md#colour-tokens`, `#layout-conventions`, `#states-and-motion` and `#accessibility-floor`.
- Use artifact evidence vocabulary recorded in `docs/research/promptfoo-integration.md` §3 and `docs/research/promptfoo-redteam.md` §6.

## Steps

1. Map controlled filters and status labels to props, without doing a fetch in a feature component.
2. Build the dialog's ordered evidence sections, pending/error states and safe plain-text content paths.
3. Add role-based tests, including focus restoration and result text containing inert markup-like characters. Remove only the `LegacyReport` case/import from this spec's `ReportStates.test.jsx`; spec 19 deletes the standalone legacy component.

## Done when

- [ ] `cd Frontend && npx vitest run src/features/red-team/ResultsTable.test.jsx src/features/red-team/AttackDetailDialog.test.jsx src/features/red-team/ReportStates.test.jsx` covers filter callbacks/reset, detail sections and absent evidence, escaped text, focus, cancellation summary and each failure code. [unit]
- [ ] Only existing tokens are used; focus, keyboard and reduced-motion states match the design system. [static]
- [ ] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [ ] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Updated `ResultsTable`, `AttackDetailDialog` and `ReportStates`, their three test files, and [the reuse fragment](inventory/15-results-table-and-attack-detail.md). The promptfoo table emits the four controlled filter keys once per change. The page applies them and resets the result page to 1 together. The table still recognizes the incumbent page’s `evidence` prop until spec 18 switches the page to `verdict_source`.
- Verified the installed promptfoo 0.126.0 manifest and `dist/src/index.d.ts` for zero-based `testIdx` and `repeatIndex`, `gradingResult.pass`/`reason` and explicit execution errors. Checked their normalized fields in `results_parser.py` and the policy rule shape in `enforcement_service.py`. Used the approved report and states layouts and the spec 07 labels. The components consume result data through props.
- Verified React and React DOM 19.2.5 text-node rendering in the installed client. Checked Radix UI 1.7.0, Dialog 1.2.0 and Focus Scope 1.2.0 for modal focus trapping, Tab looping and open/close autofocus callbacks. Checked Tailwind CSS 4.2.4 and tailwind-merge 3.7.0 through the generated CSS and computed Chromium styles for reduced motion, dialog positioning and the focusable scroll region.
- Verified installed Testing Library React 16.3.3 and DOM 10.4.2 render, event and wait helpers, Vitest 5.1.0 spy assertions and test CLI, jsdom 29.1.1 test environment, ESLint 10.2.1 and Vite 8.0.10 CLI entries, and Playwright 1.64.0 with axe-core Playwright 4.13.0 browser checks.
- `cd Frontend && npx vitest run src/features/red-team/ResultsTable.test.jsx src/features/red-team/AttackDetailDialog.test.jsx src/features/red-team/ReportStates.test.jsx` passed with 3 files and 41 tests. Initial assertions exposed missing accessible spacing in verdict counts and imprecise fallback wording. Both were fixed and the focused command was rerun.
- Static token check passed. A temporary Chromium harness with fake records passed the table and open-dialog axe checks with 0 violations at 1440px, 700px and 390px. It verified labelled keyboard scrolling at 700px, Enter to open, Tab and Shift+Tab wrapping, Escape and focus restoration, inert reply text, and computed transform, translation and animation set to `none` under reduced motion. An initial axe run found a duplicate landmark name, which was fixed before rerunning.
- `cd Frontend && npx vitest run` exited 1 with 21 files passed and 1 failed, 288 tests passed and 1 failed. The sole failure was `RedTeamPage.test.jsx` → “shows progress for a running test,” which expects “Not yet.” The pre-edit run had the same failure, with 271 passed and 1 failed. The page test belongs to spec 18.
- `cd Frontend && npm run lint` exited 0 with 0 errors and 0 warnings.
- `npm run build` from a temporary Frontend copy with the installed dependencies exited 0 and transformed 2,941 modules. It emitted the existing `IMPORT_IS_UNDEFINED` warning for the page’s legacy `compareRedTeamTests` reference and a `PLUGIN_TIMINGS` warning. The build output stayed in the temporary copy.
- `git diff --check` passed in both the root and Frontend repositories. This spec has no MongoDB gate. Automated verification used fake data and services. Spec 16 owns the authorized detail reads and spec 18 owns page fetch and filter wiring.
