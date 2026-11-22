# Spec 14 — Compliance tabs

**Status:** Done
**Depends on:** Spec 07
**Model:** Light — `claude-haiku-5-5` · `gpt-6.2-sol` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `Frontend/src/features/red-team/ComplianceTabs.jsx`, `Frontend/src/features/red-team/ComplianceTabs.test.jsx`, `specs-promptfoo/inventory/14-compliance-tabs.md`
**Reuses:** `design/red-team/v3/report.html`, `DESIGN-SYSTEM.md#component-conventions`, `DESIGN-SYSTEM.md#accessibility-floor`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/red-team.css`, `Frontend/src/components/ui/badge.jsx`

## Goal

Show which framework controls were tested and why untested controls have no decision.

## Scope

- Rebuild the tabs section in `design/red-team/v3/report.html` with the existing `ComplianceTabs`, project badges, and spec 07 mocked report DTO. Use OWASP LLM Top 10, NIST AI RMF, MITRE ATLAS and EU AI Act order. Retain control IDs and display names; status text accompanies every tone.
- Render passed, failed and not tested. Show the backend reason for not tested (“Plugin not offered”, unselected, or no decided results); on missing data show a specific fallback, not “Failed.” Provisional report shows “Control results are available after the run finishes.” Do not imply legal certification.
- Use only existing tokens and no raw colour values. Use one tab stop in the tablist, arrows with wrap, Home/End, labelled tab/panel associations, visible focus and no panel motion under reduced motion. If the active framework disappears, select the first remaining tab and preserve focus if it was in the tablist. Copy is plain, not generic filler.

## Explicit non-scope

- Mapping, compliance status and reason calculation → spec 03.
- Report composition → spec 18.

## Reuse first

- Preserve the incumbent tab keyboard pattern and spec 07 status labels. Apply `DESIGN-SYSTEM.md#colour-tokens`, `#states-and-motion` and `#accessibility-floor`.
- See `docs/research/promptfoo-redteam.md` §5 for framework naming and coverage interpretation; do not ship a second mapping in frontend code.

## Steps

1. Render tabs and active panel from the DTO, matching the approved layout and mobile scroll rules.
2. Render reasons adjacent to status rather than hiding them in tooltips.
3. Test keyboard behavior using actual focus assertions and exercise all status cases independently of the API.

## Done when

- [ ] `cd Frontend && npx vitest run src/features/red-team/ComplianceTabs.test.jsx` covers ArrowLeft/Right, wrap, Home/End, active tab loss, selected panel, status/reason text and provisional fallback. [unit]
- [ ] The component uses existing tokens, focus visibility and no reduced-motion transforms or raw colour values. [static]
- [ ] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [ ] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Updated `ComplianceTabs.jsx` with the approved ordered, horizontally scrollable framework tabs and responsive control rows. The component presents stored statuses, counts and backend reasons with the shared badge and label registry, distinguishes missing data from provisional coverage, and retains selection by framework ID. If the focused tab is removed, focus moves to the first remaining tab; outside focus is left alone. Added mocked-DTO tests and the spec 14 inventory fragment. No mapping, report composition, or live runtime behavior changed.
- Verified the spec 07 `RedTeamReport.compliance` array/null contract in `redTeamService.js`, incumbent `framework`/`totals` and flattened page shapes, and framework IDs, fields, statuses, and reason strings in `framework_compliance.py` and `promptfoo_frameworks.json`. No promptfoo package API is used by this component.
- Verified installed React/React DOM 19.2.5 hooks, callback-ref cleanup, and ref detachment before host removal in their local `cjs` sources. Checked installed Testing Library React 16.3.3/DOM 10.4.2 exports, `render`/`rerender`, `reactStrictMode`, and `fireEvent`, and the local Vitest 5.1.0/jsdom 29.1.1 configuration and package manifests. Inspected `badge.jsx` and the installed Radix 1.7.0/CVA 0.7.1 manifests; checked Tailwind 4.2.4/Vite 8.0.10 manifests and the built CSS for the grid, overflow, selected border, transition and focus rules. Checked Playwright 1.64.0's installed manifest and launch/reduced-motion declarations for the offline layout inspection.
- `cd Frontend && npx vitest run src/features/red-team/ComplianceTabs.test.jsx`: 1 file passed, 12 tests passed in 3.24 s.
- Static style inspection: existing `--rt-*` tokens and no raw colors or transforms. Offline synthetic HTML/CSS inspection with cached Chromium at 1440 px and 390 px showed 4/2 row columns, 56 px tab height, immediate 2 px keyboard outline, and no panel transform, animation, or transition under reduced motion. At 390 px the strip scrolled locally (356 px viewport / 795 px content), with no document overflow. No app routes, providers, or services ran.
- `cd Frontend && npx vitest run`: exit 1, 20 files passed and 1 failed; 271 tests passed, 1 failed, no skips, 15.31 s. The existing `src/pages/RedTeamPage.test.jsx:64` running-test assertion expects `Not yet`; that branch does not mount `ComplianceTabs`. Spec 13 recorded the same baseline failure. Report composition is owned by spec 18, so it was left unchanged.
- `cd Frontend && npm run lint`: exit 0, 0 errors and 0 warnings. `cd Frontend && npm run build`: exit 0, 2,941 modules transformed in 15.43 s; one existing `IMPORT_IS_UNDEFINED` warning for `compareRedTeamTests` in `RedTeamPage.jsx`. No MongoDB integration check applies to spec 14.
