# Spec 21 — Red Team page integration

**Status:** Done
**Depends on:** Spec 08, Spec 13, Spec 14, Spec 15, Spec 16, Spec 17, Spec 18, Spec 19
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `Frontend/src/pages/RedTeamPage.jsx`, `Frontend/src/pages/red-team.css`, `Frontend/src/pages/RedTeamPage.test.jsx`, `specs-red-team/inventory/21-page-integration.md`
**Reuses:** `Frontend/src/features/red-team/TestList.jsx`, `Frontend/src/features/red-team/TestEditor.jsx`, `Frontend/src/features/red-team/RunProgress.jsx`, `Frontend/src/features/red-team/ReportSummary.jsx`, `Frontend/src/features/red-team/ComplianceTabs.jsx`, `Frontend/src/features/red-team/ResultsTable.jsx`, `Frontend/src/features/red-team/ReportStates.jsx`, `Frontend/src/features/red-team/LegacyReport.jsx`, `Frontend/src/hooks/useRedTeamTest.js`, `design/red-team/v3/report.html`

## Goal

Replace the single-file page with a thin orchestrator that loads data, performs mutations and chooses which feature view to show, matching the approved screens and keeping every existing capability (launch idempotency, cancel, clone, export JSON/CSV, print, legacy reports).

## Scope

- Routing inside the page per `ARCHITECTURE.md#state-ownership`: list, `?new=1` editor, `?test=<id>` (draft → editor prefilled; queued/running/cancelling → `RunProgress`; terminal v3 → report; legacy format → `LegacyReport`).
- Data: capabilities, integrations and users once; list with filters and pagination; the test via `useRedTeamTest`; for a report, the v3 report, results (query object), counts, and detail on View; readiness from capabilities (`worker_observed`, `dispatcher_observed`, broker reachability, observed timestamps).
- Mutations: create/update draft and launch with one stable `Idempotency-Key` per test version (existing `launchKey` behaviour kept); cancel via `RunProgress`'s confirmation; clone as the other mode; export JSON/CSV; print. Errors show in one alert region; field errors pass to the editor.
- Report layout from the approved screen: heading and meta (mode, integration and model, completion time, model and judge call counts), actions (Open paired run or Clone as other mode, Export), `ReportSummary`, `PluginTable` beside `StrategyBreakdown` (both from `ReportSummary.jsx`'s spec), `ComplianceTabs`, `ResultsTable` with `AttackDetailDialog`, `MethodDisclosure`, `Limitations`, and the cancelled/failed/no-judge states where they apply.
- `pages/red-team.css` keeps only page layout (grid placement); all component styling lives in the feature stylesheet. Remove `ScoreSummary`, `AttackDetail` and the modal editor from the page.

## Explicit non-scope

- New backend fields or endpoints → spec 22.
- Browser-level proof of the integrated flows → spec 24.
- Navigation, `pageRegistry` and the app shell stay unchanged; confirmed by → spec 25.

## Reuse first

- Every view comes from `features/red-team/`; the page renders no badge, table or dialog markup of its own.

## Steps

1. Rewrite the page as an orchestrator over the feature components.
2. Test routing branches and mutations with `redTeamService.js` mocked.

## Done when

- [x] `npm run test:components -- src/pages/RedTeamPage.test.jsx` passes: `#red-team` shows the list; `?new=1` shows the editor; a draft opens the prefilled editor; a running test shows `RunProgress`; a completed v3 test shows the report sections; a legacy test shows `LegacyReport`. [unit]
- [x] Mutation tests: launching twice for one version reuses the same `Idempotency-Key`; confirming cancel calls the cancel service once; after launch the hook polls (the queued status is fetched again); export calls the download with `json` and `csv`; a 422 maps field errors into the editor. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]


## Log

- **2026-11-14**: Finished interrupted composition; running attack numbers are one-based and legacy comparison requires a group. Targeted page tests 15 passed; backend unit 434 passed; frontend component 210 + Node 8 passed; compile, lint (0 errors/warnings), build passed. Mechanical design detector: no findings. Browser visuals/axe follow in spec 24. No live providers/broker used.

- **2026-11-14 (spec 24 regression)**: Extended mobile target sizing to page actions and disclosure summaries; the browser geometry sweep checks every visible Red Team button, select and summary for 44px height and width. Verification recorded in spec 24.

- **2026-11-14**: Independent review now passes the current test mode into AttackDetailDialog for correct paired-run wording. Added an integration component test proving a legacy clone updates with a category payload then launches its saved version. Full frontend unit 214 Vitest + 8 Node, lint/build and Red Team browser 19 pass; the browser suite also checks the category clone end to end.
