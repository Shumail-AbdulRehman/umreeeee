---
version: 1
slug: "frontend-src-pages-myactivitypage-jsx"
primary_target: "Frontend/src/pages/MyActivityPage.jsx"
related_targets: ["Frontend/src/pages/my-activity.css"]
---

# Member activity extension

Mode: Operate. User request: add a member page for their own activities, with charts and graphs, and change nothing else. Existing backend analytics and run endpoints enforce member ownership. Reuse them; no endpoint, backend or dependency changes.

## Direction contract

THESIS: A personal activity report that answers what I used, what happened, and where to inspect a run; no organization directory or invented trends.

OWN-WORLD: Inherit Averiq’s existing light canvas, graphite navigation, Inter type, violet selection, semantic outcome colors, thin borders and shadcn controls. No design-system changes.

STORY: A member chooses 7, 30 or 90 days, reads actual prompt activity, outcomes and model usage, then opens an existing run or starts a conversation. Unknown usage/cost, empty results and retryable failures remain explicit.

FIRST VIEWPORT: Existing shell and page heading; compact period/action toolbar; four connected summary cells; a wide daily activity chart next to an outcome breakdown. Model comparison and recent runs follow.

FORM: Existing analytics composition extended to a precisely scoped member report. User pinned the existing application and no other changes; seed: none (unavailable). No comp or new visual-world workshop.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

QUALITY BAR: Accurate personal scope, readable useful charts with table alternatives, clear loading/empty/error states, keyboard operation, and no page overflow at desktop, tablet or mobile. Existing routes, admin navigation, services and backend remain unchanged.
