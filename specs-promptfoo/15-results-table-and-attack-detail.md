# Spec 15 — Results table and attack detail

**Status:** Not started
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
