# Member activity page

Implemented and verified locally on 2026-11-04.

Members can open **Observe → My activity** at `#my-activity`. The page adds daily submissions by outcome, an outcome breakdown, the five most-used models, token and estimated-cost totals, measured typical execution time and links to the latest five runs. Reporting periods are 7, 30 or 90 days in UTC. Empty activity, unavailable reports, retry, unknown usage and unknown/partial cost are explicit.

## Data and scope

Uses the existing `/analytics/summary`, `/analytics/series`, `/analytics/models` and `/prompt-workspace/runs` endpoints with identical `from`, `to` and current-member `user_id` values. The existing server permission checks enforce member ownership. No organization-wide selector is exposed. Old responses cannot replace a newer period or account; previous metrics disappear immediately during scope changes.

The page reuses existing analytics charts, tables, summary cells, status badges, shadcn buttons and aggregation helpers. Only five existing files changed for registration: navigation metadata, lazy page registry, a permission branch for this new route, the member sidebar item/icon and its loading skeleton. A 220-file pre-edit snapshot confirms no other existing frontend/backend source changed. The admin navigation is unchanged. No backend, authentication, API service, dependency or other page implementation changed.

## Validation

- Complete unit suite: 8 Node tests and 89 component tests across 7 component files passed. The 8 new member activity/route tests cover own-user scope, matching intervals, stale periods/accounts, retry, zero activity, unknown cost and prior permission decisions.
- After the final CSS correction, all 8 focused tests, lint and the production build passed again. Build emits a non-blocking plugin timing advisory.
- `UI_TEST_URL=http://127.0.0.1:5193 node tests/my-activity.browser.cjs` passed against production assets: explicit own-user scope, 7/30/90-day filters, stale-response isolation, chart/table alternatives, recent-run links, default/hover/focus primary action, unknown cost, errors/retry, empty activity and unchanged admin navigation.
- Layouts checked at 1920, 1440, 768, 390 and 320 CSS pixels. Seven axe scans reported zero detected violations; no browser JavaScript exceptions or unexpected API calls occurred.
- Detector output for the new page and styles: empty findings array.

All browser data is synthetic and intercepted; these checks make no live provider or customer requests and are not an accessibility certification. Screenshots are test evidence rather than shipping assets.

## Visual and design documentation review

The independent finish reviewer inspected seven production captures and identified one bounded issue: global link styling obscured the primary action text. A page-scoped foreground rule now uses the existing primary foreground token. After rebuilding and replacing all seven captures, the reviewer returned **ship** for the resolved foreground finding. This verdict covers that correction.

The documentation agent was unavailable, so the ordinary-extension documentation audit was completed locally using the documented fallback. Checked DESIGN.md, the surface contract, global tokens, shared Surface/AnalyticsChart/Button patterns and the final page CSS. No design-system files changed.

- Palette: existing light canvas, graphite navigation, violet accent and semantic outcome colors.
- Type: existing Inter stack, compact section/control text and tabular numerals.
- Spacing: existing 20–24px report surfaces and restrained bordered containers.
- Controls: existing shadcn primitives, keyboard focus and mobile 44px actions.
- Data: real scoped reports, local table overflow and readable count/table alternatives.

Pre-existing design-document format/path-root drift was not repaired or promoted into new rules, consistent with the request to change nothing else. No new raster assets or system tokens were introduced.

## Evidence and publication

Logs: `/tmp/averiq-my-activity-{all-unit,unit,lint,build,browser}.log`. Detector: `/tmp/averiq-my-activity-detector.json`. Baseline: `/tmp/averiq-member-activity-baseline.json`. Final screenshots and axe report: `Frontend/.impeccable/review/my-activity/`.

No data integration is missing. No commit, push or deployment was performed. Redeploy the frontend to make the page available on Netlify.

## Member landing page follow-up

Members now land on My activity after a successful sign-in. Opening the app with a restored member session and no valid route also uses My activity; explicit permitted links such as Prompt Studio remain intact. Admin and superadmin sign-ins still lead to Organization overview. Only the two member destination values in App.jsx changed; authentication requests and session handling are unchanged. Existing browser expectations for denied admin routes were updated to the new member fallback.

A synthetic production-browser check verified actual login form submission for all three roles, unchanged login payloads, restored member-root behavior, explicit Prompt Studio navigation and no JavaScript exceptions. Lint and production build passed. Evidence: /tmp/averiq-login-landing-{browser,lint,build}.log.

The existing user-insights browser regression also passed with the new member fallback, including admin-only navigation, no JavaScript exceptions and zero detected axe findings.
