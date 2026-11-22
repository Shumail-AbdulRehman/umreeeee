# Spec 14 — Compliance tabs

**Status:** Not started
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
