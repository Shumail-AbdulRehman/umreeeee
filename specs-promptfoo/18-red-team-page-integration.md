# Spec 18 — Red Team page integration

**Status:** Not started
**Depends on:** Spec 07, Spec 11, Spec 12, Spec 13, Spec 14, Spec 15
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `Frontend/src/pages/RedTeamPage.jsx`, `Frontend/src/pages/RedTeamPage.test.jsx`, `Frontend/src/pages/red-team.css`, `Frontend/src/hooks/useRedTeamTest.js`, `Frontend/src/hooks/useRedTeamTest.test.jsx`, `specs-promptfoo/inventory/18-red-team-page-integration.md`
**Reuses:** `design/red-team/v3/tests.html`, `design/red-team/v3/new-test.html`, `design/red-team/v3/running.html`, `design/red-team/v3/report.html`, `design/red-team/v3/states.html`, `DESIGN-SYSTEM.md#layout-conventions`, `DESIGN-SYSTEM.md#states-and-motion`, `DESIGN-SYSTEM.md#accessibility-floor`, `Frontend/src/components/LoadingSurface.jsx`, `Frontend/src/services/redTeam/redTeamService.js`

## Goal

Compose the editor, live run and report views in the existing Red Team route, holding loading and focus behavior steady.

## Scope

- Compose the list, editor, progress, summary, plugin/strategy breakdown, compliance, results, detail and state views from specs 11–15; rebuild from incumbent components, not the reviewed prototypes. Preserve current hash navigation, browser back behavior, edit/draft, cancel, clone and export callbacks; wire Launch from the editor (save the draft if changed, then `launchRedTeamTest` with one stable `Idempotency-Key` per draft id and version, as the current page does) and remove the legacy-report branch.
- Poll queued, generating, running and cancelling; stop at terminal/unmount and discard stale results when the test ID or filters change. Reset result filters and detail state on navigation; do not request a report while editing an unsaved draft. Use the latest request for report and row detail, including after a previous response fails.
- Retain the existing `InlineLoadingBar` behavior (page change of 2026-11-20): hide report/results until the corresponding test's report and result reads resolve; a known failure gets a specific retry/state view, not stale rows or a perpetual spinner. Keep report loading, row detail loading and empty results separate.
- Use existing tokens only, no raw colour values; honor reduced motion for loading and transitions. Preserve keyboard order and visible focus, restore focus on dialog close, and land on a meaningful heading after intentional navigation without shifting focus on poll ticks. Copy is plain and tied to the actual state, e.g. “Could not load results.” No generic filler.

## Explicit non-scope

- Feature component internals → spec 11–15.
- API and report contracts on the server → spec 16.
- Deleting legacy modules → spec 19.

## Reuse first

- Reuse `useRedTeamTest`, `InlineLoadingBar` from `LoadingSurface.jsx`, spec 07 transport and previous hash navigation pattern. Preserve the app shell; follow `DESIGN-SYSTEM.md#colour-tokens`, `#layout-conventions`, `#component-conventions`, `#states-and-motion` and `#accessibility-floor` across the five approved screens.
- Compose `TestEditor.jsx`, `TestList.jsx`, `RunProgress.jsx`, `ReportSummary.jsx`, `PluginTable.jsx`, `StrategyBreakdown.jsx`, `ComplianceTabs.jsx`, `ResultsTable.jsx`, `AttackDetailDialog.jsx` and `ReportStates.jsx`; don't reimplement `attackEstimate.js` or duplicate labels in the page. The old `LegacyReport.jsx` branch must have no caller after composition.

## Steps

1. Compose page states and callbacks with spec 07 fixture DTOs, and remove `LegacyReport` and manual legacy comparison markup.
2. Extend existing polling with `generating` and implement loading/request identity bounds for report/results/detail.
3. Mock all transport in page/hook tests; test fast and slow out-of-order responses and ensure launch sends one request with a stable Idempotency-Key per draft version and is disabled when capabilities report promptfoo unavailable.

## Done when

- [ ] `cd Frontend && npx vitest run src/pages/RedTeamPage.test.jsx src/hooks/useRedTeamTest.test.jsx` covers list, editor, queued/generating/running, report/failed, loading before payload, stale response, terminal/unmount polling cleanup, focus, and disabled launch. [unit]
- [ ] No legacy report branch or raw color values; token, focus and reduced-motion rules hold. [static]
- [ ] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [ ] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [ ] `cd Frontend && npm run build` passes. [static]
