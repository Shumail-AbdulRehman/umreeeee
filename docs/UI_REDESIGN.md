# Averiq interface redesign

## Scope and design

The displayed product name is Averiq, including navigation, authentication, Prompt Studio, the browser title and a matching vector favicon. Session restoration uses a compact branded loading surface with an indeterminate status indicator, screen-reader status text and reduced-motion support. Existing storage keys and session events are retained for compatibility. The Ollama origin field is explicitly labeled optional; its backend default is unchanged.

The existing React 19 / Vite / Tailwind application retains its hash routing, role checks, session management, API contracts, and backend. Its presentation now uses a shared graphite navigation shell, light workspace canvas, restrained violet accent, tabular numeric typography, and reusable local shadcn/ui components. The design decisions and tokens are described in `../DESIGN.md` and `Frontend/src/index.css`.

Services and permission helpers are unchanged from the snapshot taken immediately before this redesign. Changes already present in this working tree, including backend changes, were preserved.

## Page coverage

| Route | Presentation and interaction improvements |
| --- | --- |
| Overview | Seven-day recorded activity, outcome distribution, incident breakdowns, people, daily estimated spend, model usage and recent runs |
| Integrations | Six provider cards with locally bundled brand marks; preset connection dialog; live model loading; searchable individual and bulk selection; optional pricing/instructions; provider/model table, sorting, optional columns and pagination |
| Groups | Search/filter tools, sortable membership and assignment table, pagination, preserved group editors |
| Policies | Legacy catalog selection and assignment workflows with consistent styling |
| DLP policy | Named policy library, actual configuration counts, search, check selection, reusable group assignments, viewport-safe editors |
| Guardrail policy | Same reusable library/editor patterns, with category-specific content and preserved checks |
| User insights | Searchable people directory, account status filtering, person-specific and organization reports, 7/30/90-day periods, activity/outcome/model/latency charts, coverage and cost table |
| Users | Search and existing status/role/group filters, sortable columns, account badges, invitations, own policy groups |
| Activity | Outcome filter, sortable run table, pagination, safe prompt/response detail and retained expiry/withholding states |
| Violations | Incident severity/resolution badges, filter, sortable table, immediate detail dialog with loading/error/retry states, keyboard focus return, safe evidence and existing admin-only resolution actions |
| Models | Configured model counts, observed usage, local directory search and sortable table |
| Latency | Actual p50/p95/p99 stage comparison and measurement coverage table |
| Spend | Known estimates, unknown cost/usage coverage, per-model cost comparison and sortable cost table |
| Settings | Organization identity and retention controls, administrative history table, superadmin organization management |
| Red Team | Filterable evaluation table, job progress, actual category verdict chart, evidence table, preserved draft/launch/clone/compare/export operations |
| Prompt Studio | Responsive history/transcript/composer layout, policy context, permitted-response presentation, accessible action icons |
| Login, signup, verification, password recovery, invitation acceptance | Shared responsive split layout, consistent labeled inputs, focus states and success/error messages |

Ordinary users retain their existing six permitted routes: Prompt Studio, Activity, Violations, Models, Latency and Spend. Administrator-only navigation and actions remain restricted by the existing permission helpers.

## Reusable UI

- Local shadcn/Radix buttons, badges, inputs, dialogs, dropdown menus, popovers, tooltips, skeletons and tables.
- Responsive, collapsible sidebar; mobile navigation dialog; breadcrumb header; permission-aware page search; account menu; existing notification interface.
- `Surface`: section headers, statistics, search input, empty states, period label and pagination.
- `DataTable`: loaded-page sorting, optional column visibility, meaningful empty states and bounded horizontal scrolling.
- `AnalyticsChart`: responsive Recharts plots, legends, tooltips and an expandable semantic table alternative.
- Shared status badges, loading surfaces, error states and viewport-safe modal layout.
- `PageSkeleton`: route-specific previews for all 16 pages. Overview, latency, spend and user reports preview their own metrics and chart frames; management pages preview their actual table columns and filters; integrations preview the six providers; policy pages preview the library; settings preview fields and history; Prompt Studio previews conversation history and the composer. Shared primitives keep spacing consistent. Skeletons contain no sample records, chart paths or fabricated values, are hidden from assistive technology, and use a reduced-motion-aware neutral pulse with one announced loading status.

Page modules are loaded on demand. Charts are in a separate shared chunk, so management and conversation pages do not require chart code on initial load.

## Data coverage and limitations

Charts read existing `/dashboard`, `/analytics/summary`, `/analytics/models` and red-team result data. No production sample data or invented endpoints were added. Browser fixtures are isolated to tests, and never contact a model provider or customer API.

The available overview is a seven-day report. There is no fabricated growth comparison, revenue, registration trend, availability/health indicator, or unsupported time-range picker. Known cost estimates are explicitly separated from unknown/partial cost and are not a billing statement. Missing model prices remain unknown until rates are configured through the existing integration editor. Missing provider token usage remains visible as a coverage limitation.

Table sorting applies to the fetched page; global search/status filters and pagination retain their existing server contracts. No unsupported bulk mutation or server sorting contract was introduced.

## Verification

Run from `Frontend`:

```sh
npm run lint
npm run build
npm test
UI_TEST_URL=http://127.0.0.1:5187 npm run test:integrations
UI_TEST_URL=http://127.0.0.1:5187 npm run test:violations
npm run dev -- --host 127.0.0.1 --port 5187
# In another terminal, with system Chrome installed:
UI_TEST_URL=http://127.0.0.1:5187 npm run test:workflows
UI_TEST_URL=http://127.0.0.1:5187 npm run test:ui
```

`CHROME_PATH` can point to another installed Chrome/Chromium executable. The UI suite tests all 16 application routes at 1440px, 768px and 390px; ordinary-user permissions; superadmin settings; all five authentication views; empty/error states; table sorting and visibility; dialog keyboard focus; mobile navigation; sidebar collapse; account menu; and workspace search. Axe scans WCAG 2 A/AA, 2.1 AA and 2.2 AA rules on desktop/mobile views and dialogs. Screenshots and the accessibility report are written under `/tmp/sentinel-redesign-*`.

Existing conversation tests cover idempotent retries, draft preservation, history recovery, follow-ups, blocked prompts and responsive history navigation. Policy tests cover named policy creation/editing, large check/group lists, preserved assignments, reload and mobile modal behavior. API-contract tests cover backend compatibility and actionable failures.

These tests use intercepted synthetic responses. They validate frontend rendering and preserved workflows; they do not certify deployment configuration, live provider connectivity or comprehensive WCAG conformance.

Violation detail previously rendered after the complete table and pagination, which could make Open appear unresponsive. It now opens a viewport-safe dialog immediately, with its own loading, error and retry states. Closing or switching incidents invalidates late detail responses. The existing safe evidence, run link, review-note validation, admin-only review/resolve actions and versioned API payloads are preserved. The dedicated browser regression covers a long table, review/resolve payloads, read-only users, retry, late responses, keyboard focus return and accessible desktop/tablet/mobile dialogs.

After a confirmed review or resolution, the dialog closes and an accessible confirmation appears. The displayed record is updated from the API response before the list is refreshed. An already-saved status is disabled until its note changes, and duplicate in-flight saves are blocked. Failed saves and unconfirmed status responses remain visible inside the dialog. Version conflicts offer a reload that preserves the draft note. A failed list refresh is reported separately from a successful status save, with a list-only retry that does not repeat the mutation. These states are covered by `test:violations`; production still requires deploying the frontend changes.

The incident dialog also loads its linked run using the existing permission-scoped `GET /prompt-workspace/runs/{id}` endpoint. `ViolationContext` shows the retained submitted prompt, the recorded blocking stage, and matched catalog names, local check kinds or recorded reason codes. Run-level findings are scoped to this incident’s policy and stage; unrelated policies are excluded. Missing detailed reasons are stated explicitly. Expired prompt text and withheld model responses are not displayed. Unavailable runs have their own retry state and do not prevent incident review. The dialog header and review actions stay visible while the content scrolls. The browser regression covers recorded prompts/check names, escaped text, expiry, withheld output, inaccessible runs and unrelated-policy exclusion, in addition to the existing mutation and permission cases. No backend endpoint, authorization or retention changes were required.

## Integration connection workflow

The provider library covers OpenAI, Groq, Ollama, Gemini, DeepSeek and Anthropic. Cards open the existing create form with that provider selected. No model availability counts or example model lists appear before actual discovery. Existing `available-models`, create, update, status and saved-credential endpoints remain unchanged.

Admins can load models, search names, select individual models, select all, or clear their selection. Searching preserves selections outside the visible results. The existing backend limit is 50 models per connection; Select all is disabled when discovery returns more than 50, with an explanation and individual selection capped at the same limit. Editing credentials invalidates previous discovery, including delayed responses. An existing connection can load models with its saved key. Optional token price overrides and administrator system instructions retain their original payloads.

The dedicated integration browser suite verifies all provider presets; credential and Ollama-origin discovery; individual/bulk/search interactions; create/update payloads, pricing and instructions; saved-key reuse; empty/error/stale discovery; the 50-model limit; visible mobile save controls; no page overflow; console errors; and WCAG rule scans at 1440px, 768px and 390px. It passed with isolated synthetic API fixtures. Real provider access still depends on valid credentials and existing backend/network configuration, with no new integration required.

### Completed verification — 2026-10-11

- ESLint: passed.
- Production build: passed; route-level code splitting removes the previous oversized monolithic application chunk.
- API-contract tests: 5 passed.
- Conversation workflow, administrator policy-group workflow and named policy browser suites: passed.
- Redesign browser suite: all 15 routes at three viewport sizes, all five authentication views, ordinary-user and superadmin checks, navigation/table/dialog interactions and empty/error scenarios passed.
- Axe scans: zero detected violations for the selected WCAG rule sets across the scanned views and dialogs.
- Browser JavaScript exceptions: none. Unexpected API calls in the intercepted suite: none.
- Desktop and mobile screenshots reviewed; the search/filter overlap identified visually was fixed and now has an explicit regression assertion.
- Service modules, permission helpers and red-team polling hook match the pre-redesign snapshot. No backend files were edited during this redesign.

## User insights extension

`#user-insights` is an administrator-only route under Manage. The people directory uses the existing paginated `/users` endpoint and server name/email/status filters. Selecting a person scopes all three report requests through the existing analytics `user_id` filter; Everyone omits that filter. The summary, daily series and model requests share exactly the same UTC `from`/`to` interval for 7, 30 or 90 days. Account filters only affect the directory, never silently change report scope.

The page includes a stacked activity chart, outcome donut with readable counts, horizontal model comparison, latency percentiles, known cost/token detail, and policy-evaluation coverage. Technical errors remain distinct from blocked prompts. Dates without recorded activity are zero-filled only within a successfully retrieved series interval; an empty series stays an informative empty state. Partial boundary days, unknown usage/cost, incident-rate denominators and excluded legacy records are identified.

Reports clear during scope changes. Obsolete responses cannot overwrite a newer person or period, and a failed report exposes a retry action without retaining another person’s metrics. Directory search is debounced and paginated, so selecting a user does not require fetching the entire organization or requesting every person’s analytics.

`npm test` now includes three aggregation/interval regressions in addition to the five API-contract tests. `UI_TEST_URL=http://127.0.0.1:5187 npm run test:user-insights` exercises individual scopes, identical request intervals, 7/30/90 days, deliberately late results, search/pagination, empty reports, recovery, admin-only routing and 1440/768/390/320px layouts. Screenshots and axe results are saved under `/tmp/sentinel-user-insights-*`. No backend, permission-helper or API-service implementation was changed for this extension.

User insights validation passed: lint, production build, all 8 unit/contract tests, the dedicated user-insights browser suite (including late-response isolation), and the updated full UI suite across 16 routes at three viewport sizes. Both browser suites reported zero detected axe violations and no JavaScript exceptions. Desktop and mobile screenshots were reviewed after the final layout corrections. These are intercepted-API frontend checks, not a live provider connectivity test.

## Prompt Studio refinement and Markdown

The approved v3 is implemented in the existing Prompt Studio. The reading area has a bounded transcript, a compact composer, a concise policy disclosure and responsive chat history. The mobile history uses the existing shadcn/Radix dialog for focus trapping, Escape and focus restoration. Generation options use the existing popover; native constraints, model selection, keyboard send behavior and all existing readiness guards remain intact.

Permitted assistant responses use react-markdown and remark-gfm for headings, lists, emphasis, links, tasks, tables and code. User prompts remain literal text. Raw HTML is disabled, library URL sanitization remains enabled and model-supplied images become explicit links rather than automatic image requests. Tables and code scroll locally. Copy controls preserve the original response or parsed literal code and expose success/failure feedback. Withheld and expired text is never rendered or copyable.

Clean verification passes 8 Node tests, 81 component tests and 15 integrated browser cases. The browser cases cover four viewport sizes, eight axe scans, sending/settings, history/recovery, protected outputs, clipboard rejection and the incumbent conversation/admin-policy workflows. No detected axe violations or JavaScript exceptions occurred. Lint and production build pass; no TypeScript check is configured in this JavaScript project. Detailed evidence is in docs/planning/implementation-verification.md. These are synthetic-API frontend checks; live provider connectivity and Netlify publication remain separate.
