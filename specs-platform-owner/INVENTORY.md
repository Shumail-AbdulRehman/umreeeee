# Reuse inventory

## Existing
- Frontend/src/components/BrandMark.jsx: brand SVG.
- Frontend/src/components/ui/dialog.jsx: accessible Radix dialog foundation.
- Frontend/src/components/ui/button.jsx: existing button primitive.
- Frontend/src/services/api/client.js: bearer authentication, error mapping, session expiry and tracked requests.
- Frontend/src/lib/format.js: numeric/date formatting.
- backend/app/core/permissions.py: require_super_admin.
- backend/app/core/errors.py: DomainError, object_id and common error handlers.
- backend/app/services/admin_common.py: transaction, audit, version checks and utcnow.
- backend/app/services/enforcement_service.py: current policy resolver.
- backend/app/services/analytics_service.py: existing outcome/coverage semantics.
- Frontend/tests and backend/tests: installed test harnesses.

## New fragments
Each implementation unit records its symbols in inventory/NN-name.md; fold them here during final verification.

## Implemented feature registry

### 01-contracts

Implemented strict public platform response contracts and trimmed required access reasons. Two focused schema tests and integrated HTTP validation passed; whole backend suite598 passed.

See Owns in the corresponding spec for exact application and test paths. Reuses the existing authentication/error and accessible UI foundations; no new runtime dependency.

### 02-platform-read-models

- backend/app/services/platform_metrics.py: PlatformMetrics company aggregation, server-filtered directory and overview facets, exact policy applicability for unique active membership sets.
- window_for: current-day-inclusive UTC7/30-day intervals.
- daily_series: bounded zero-filled outcome series.
- company_summary / company_metrics / safe_attention: explicit public allowlists.
- company_pipeline / attention_definitions: safe Mongo metadata lookups and recorded attention rules. Repeated-provider threshold is3 failed workspace runs in the selected interval; unresolved backlog includes reviewed and open workspace violations, high severity includes critical.

Directory onboarding is a setup milestone (verified administrator, active integration/group, active named DLP or Guardrail policy). Exact member-by-integration policy coverage is computed in detail using the existing resolver; it is not a claim of detector availability or comprehensive protection.

### 03-platform-read-service

- backend/app/services/platform_service.py: PlatformService.overview / companies / company. Constructor accepts injected metrics and an optional UTC clock for deterministic isolated tests.
- All public read operations enforce require_super_admin before any database work.
- Company detail supplies safe metrics, exact policy coverage and missing-required-coverage attention. Onboarding remains the same coarse setup milestone on every surface; actual applicability is separate. HTTP composition adds the safe audit history.
- No returned object exposes tenant content, employee identifiers or errors.

### 04-platform-audit-access

- `backend/app/services/platform_audit_service.py`: `PlatformAuditService.list` exposes safe platform/company history; `change_status` owns versioned atomic access changes and dual-company audit recording. `EVENT_LABELS` is the action filter allowlist.
- `audit_pipeline` deduplicates actor/target status records before pagination and fetches bounded company/actor metadata only for the selected page. `audit_event_read` is the public metadata allowlist.
- `backend/app/api/routes/administration.py`: legacy `CompanyStatus` accepts an optional reason; `organization_status` delegates to the same service after its role check.
- `backend/tests/unit/test_platform_audit.py`: 19 cases cover privilege boundaries, audit privacy, attribution/pagination query shape, version/default fields, no-op behaviour, reason validation, transaction rollback/retry, and explicit filter errors.

### 05-platform-http

Wired guarded overview, directory, detail, audit and access routes, composed bounded company history and added the action/recent audit index. Thirty focused HTTP tests passed; eight realMongo platform acceptance tests passed. Existing home-company status and organization-admin rejection regressions passed against disposable databases.

See Owns in the corresponding spec for exact application and test paths. Reuses the existing authentication/error and accessible UI foundations; no new runtime dependency.

### 06-platform-client

Implemented encoded feature API clients and abortable, race-safe reload hook. Five focused client/request tests passed. Same-query refetch retains data on recoverable errors so pending access reasons survive outages. Whole frontend353 Vitest+8Node passed.

See Owns in the corresponding spec for exact application and test paths. Reuses the existing authentication/error and accessible UI foundations; no new runtime dependency.

### 07-platform-foundation

- PlatformShell.jsx: isolated global workspace navigation, breadcrumb, account and own-organization return.
- PlatformComponents.jsx: PageHeading, PeriodControl, MetricStrip, WorkspaceChart, CompanyTable, AuditTable, Pagination, AccessBadge, CompanyMark, OnboardingLabel, AttentionPanel, AttentionBanners, LoadingState, ErrorState, EmptyState, CompanyActivityPanel.
- platformFormat.js: formatDate(value,{relative,dateOnly}) with explicit UTC context.
- platform.css: approved v3 tokens and geometry scoped under .platform-workspace; Radix access dialog carries .platform-workspace.platform-access-dialog.

Thirty-day charts group consecutive days into at most ten visual buckets while the accessible table retains the daily inputs. Submission sparklines likewise aggregate recorded values and never invent history.

### 08-platform-overview

PlatformOverview.jsx exports a default component taking {days=7,onDaysChange}. It calls getPlatformOverview through usePlatformResource and composes the shared presentation. It does not own navigation state or synthesize runtime sample data.

### 09-platform-directory

- `Frontend/src/features/platform/PlatformCompanies.jsx`: server-backed company directory; URL filter callback patch contract; debounced search preserves input focus; status/onboarding/activity/sort/window controls; total-aware pagination and filtered/unregistered/out-of-range recovery.
- Reuses `platformService.js`, `usePlatformResource.js` and `PlatformComponents.jsx`; no additional package or global stylesheet.
- `PlatformCompanies.test.jsx`: seven interaction tests covering query scope, stable focus, filter/window updates, server totals, empty recovery and service failures.

### 10-platform-company

Implemented v3 company investigation and reasoned access dialog with explicit suspension semantics, immutable requested action, own-company protection and version refresh. Seven meaningful component cases passed, including already-applied state and failedconflictrefresh recovery. Browser proof verifies focus restoration and prevention of reversed intent.

See Owns in the corresponding spec for exact application and test paths. Reuses the existing authentication/error and accessible UI foundations; no new runtime dependency.

### 11-platform-audit

- `Frontend/src/features/platform/PlatformAudit.jsx`: safe event timeline with URL company/action/date/page filters and backend pagination.
- Internal CompanyFilter: native disclosure with searchable eight-company pages; all companies remain reachable, scoped metadata-only requests, Escape/outside dismissal and focus restoration. Uses `getPlatformCompany` only to label a selected company without matching events.
- Reuses shared audit table, recovery/pagination presentation, HTTP client and request lifecycle hook; event options mirror the backend safe allowlist.
- `PlatformAudit.test.jsx`: seven tests covering safe table fields, deep links, uncapped company selection, keyboard dismissal, action/date/paging, empty company history and retry.

### 12-platform-entry

Integrated dedicated hash-routed workspace, role-specific default landing, own-organization return and sidebar/Settings entry. Navigation/window history and role composition tests passed. Existing role landing paths remain; platform routes never mount for tenant roles.

See Owns in the corresponding spec for exact application and test paths. Reuses the existing authentication/error and accessible UI foundations; no new runtime dependency.

### 13-platform-e2e-suite

- Frontend/playwright.platform.config.js: strict isolated production preview on5193 using installed Chrome.
- Frontend/tests/fixtures/platform-api.js: test-only12-company data matching v3 counts and weekly volume, UTC time fixed for screenshots; optional error, conflict, external-state-change and pagination states; every API request recorded and all unexpected requests rejected.
- Frontend/tests/platform-owner.spec.js: default entry/login,7/30-day overview, directory, detail, reasoned access lifecycle, three conflict/recovery paths, own-company protection, audit filters/pagination/search, workspace return, both role denials,1440/390px Axe/overflow/focus checks.
- docs/planning/platform-owner/screenshots/: six final production-browser screenshots for review against approved v3.

No sample records are imported into runtime code and no real provider calls occur.

Final browser coverage also includes failed conflict refresh recovery, already-applied state protection, post-mutation focus, mobile current-link focus, browser-Back date state and all-screen320/768/1024px overflow. Screenshots are captured in the desktop/mobile acceptance tests so every final artifact comes from the same production build.
