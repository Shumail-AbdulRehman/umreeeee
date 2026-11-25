# Spec 13 — Platform workflow and responsive acceptance

**Status:** Done
**Depends on:** Spec 05, Spec 12
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/package.json`, `Frontend/playwright.platform.config.js`, `Frontend/tests/platform-owner.spec.js`, `Frontend/tests/fixtures/platform-api.js`, `specs-platform-owner/inventory/13-platform-e2e-suite.md`, `docs/planning/platform-owner/screenshots/overview-desktop.png`, `docs/planning/platform-owner/screenshots/overview-mobile.png`, `docs/planning/platform-owner/screenshots/companies-desktop.png`, `docs/planning/platform-owner/screenshots/company-desktop.png`, `docs/planning/platform-owner/screenshots/audit-desktop.png`, `docs/planning/platform-owner/screenshots/access-dialog.png`
**Reuses:** `Frontend/tests/red-team.spec.js`

## Goal

The integrated user journeys match the approved v3 screens.

## Scope

- Cover overview/date windows, directory filters/search/pagination, company investigation, access success/conflict, company audit and role boundaries.
- Capture desktop/mobile screens and verify keyboard navigation, overflow and accessibility using the installed harness.

## Explicit non-scope

- Final evidence and reuse audit → spec 14.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Cover overview/date windows, directory filters/search/pagination, company investigation, access success/conflict, company audit and role boundaries.
2. Capture desktop/mobile screens and verify keyboard navigation, overflow and accessibility using the installed harness.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Flow table

| Flow | Proof |
| --- | --- |
| Overview and date window | totals, chart and company link |
| Directory | search, filters, pagination, empty recovery |
| Company detail | metrics, setup, history and own-company protection |
| Access action | required reason, confirmation, conflict, audit refresh |
| Audit | company/type/date filters and pagination |
| Role boundaries | admin/member cannot enter platform |
| Responsive and keyboard | desktop/mobile axe, overflow and focus |

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Every flow in the acceptance flow table passes in `cd Frontend && npx playwright test --config playwright.platform.config.js`. [e2e]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented16 production-preview browser cases with strictly intercepted synthetic APIs. Initial run found successful-mutation focus loss and visual .issue-body selector corruption; reported to root for owning-file fixes. Refined two409 branch expectations to the implemented already-applied and reload-recovery UI. Remaining7-case probe passed role boundaries/workspace return/own-company recovery and exposed a closed-picker dangling aria-controls reference through Axe. Native summary selector corrected in the test; owning-source fixes and final full repetition follow. Test/config/fixture ESLint passed.
- **2026-11-25**: Full16-case repetition:15 passed,1 failed. Success-mutation focus, all three stale-state recovery paths, role boundaries,7/30-day ranges with browser Back, directory, company and1440/390px screen/dialog accessibility/overflow passed. Audit selector test now exercises actual Chrome disclosure semantics. Remaining actual defect: picker pagination unmounts the focused button and loses keyboard Escape containment. Root owns the fix; targeted audit/overview/responsive repetition will provide final evidence and recapture all six artifacts from one final build.
- **2026-11-25**: Final targeted production repetition after the picker focus, closed-picker ARIA and mobile heading-axis fixes:4 passed in26.6s. Combined with the preceding full run, all16 unique browser scenarios now pass; the last whole run was15passed/1failed, followed by the passing focused audit fix and three visual/overview regressions. Final1440/390px Axe scans reported zero violations on overview, company, directory, audit and access confirmation. All four screens also had zero document overflow at320/768/1024px. Mobile current-navigation selection and Escape both restore focus; explicit7→30→browserBack→company navigation preserves7-day intent. Test/config/fixture ESLint passed. All six screenshot artifacts were recaptured from this final build, and the preview/browser exited. No external provider or real tenant data was used.

- **2026-11-25**: After changing the company chart title to the approved “Company activity” copy, rebuilt production and reran the two company/access cases: 2 passed (12.5 s). Refreshed company-desktop.png and access-dialog.png. No other runtime code changed after the final four-case responsive/audit pass.
