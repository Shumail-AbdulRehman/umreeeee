# Platform owner implementation verification — 25 November 2026

The implemented application follows the user-approved `design/platform-owner/v3` reference. It uses live API data and a dedicated Super Admin workspace. Original prototype HTML/CSS/JavaScript remains unchanged.

## Delivered

- Platform overview with four real totals, workspace outcome chart, prioritized attention and top-company activity.
- Searchable, filtered, stably sorted company directory with complete server pagination.
- Company investigation with account/setup counts, source-correct usage, current violation backlog, observed evaluation coverage and separate member input-policy applicability.
- Reasoned, versioned suspend/reactivate with own-company protection, safe concurrent-state recovery and retained reason during failed refreshes.
- Safe cross-company/company audit timelines, duplicate access-event collapse, real actor/request references, inclusive captured-time upper bound and accurate violation-state labels.
- Separate hash routes and Super Admin default landing; organization workspace return, sidebar and Settings links. Tenant APIs and role landing behaviour are preserved.
- Explicit allowlisted response schemas and safe Mongo projections; no runtime sample company data, tenant-content access, external detector or paid provider calls.

## Automated evidence

| Check | Actual result |
| --- | --- |
| Full backend unit suite | 598 passed; eight existing upstream deprecation warnings |
| Full frontend component suite | 353 passed |
| Frontend Node suite | 8 passed |
| Platform feature component/client/navigation checks | 51 passed in the focused selection |
| Final changed company/audit/shared presentation selection | 25 passed |
| Real MongoDB platform acceptance | 8 passed after final UTC/audit fixes |
| Existing MongoDB suspension/home-company and role-denial regressions | 2 passed |
| Platform browser workflows | 16 unique scenarios verified; details below |
| Existing Prompt Studio browser suite | 15 passed on complete retry |
| Existing Red Team browser suite | 12 passed |
| Frontend lint and production build | Passed; final browser configurations rebuild production artifacts |
| Python compilation and git diff whitespace check | Passed |
| Spec validation | Zero errors; documented local-workflow warnings |

The Mongo fixture used unique temporary `test_platform_*` databases on a transaction-capable server. The existing application database was never used as a test database. Each fixture dropped only its own generated database; a post-run check found zero remaining platform fixture databases. A standalone local Mongo probe also removed its own temporary probe database. No provider, detector, email or broker traffic was needed for acceptance.

Browser tests mock APIs with synthetic v3-like examples; real-query/transaction correctness was established separately by Mongo acceptance. The initial whole platform browser run passed 15/16: the audit-picker pagination interaction lost keyboard focus while results loaded. After fixing the persistent-focus target, the final four affected overview/audit/responsive tests all passed. This covers all 16 unique scenarios without claiming a final whole-suite 16/16 invocation. An earlier Studio run was interrupted by SIGTERM after 11 passing tests without an assertion failure; its complete retry passed all 15.

## Visual and accessibility evidence

Compared the finished render against the v3 desktop and mobile captures. Verified the 232px graphite navigation, heading/period placement, four/two-column metrics, 1.65:1 investigation area, full-width tables, 440px access dialog, approved Inter typography and violet/semantic palette.

Batched browser checks reported zero Axe violations across overview, directory, company, audit and access dialog at 1440px and 390px. Intermediate 320px, 768px and 1024px checks showed no document-level horizontal overflow. Charts retain readable daily tables and exact totals; the monthly visual groups dates into ten buckets.

The mechanical Impeccable detector reported only its generic Inter-popularity warning. Inter is explicitly fixed by the user-approved v3 design, so it was retained. Evidence: `design-detector.json`.

Application screenshots under `screenshots/`:

- `overview-desktop.png`
- `overview-mobile.png`
- `companies-desktop.png`
- `company-desktop.png`
- `audit-desktop.png`
- `access-dialog.png`

## Findings corrected during verification

- Preserved the intended access direction when another owner already applied the requested status.
- Retained the typed reason and blocked stale confirmation when conflict refresh failed.
- Restored focus after successful access changes, mobile current-route navigation and company-picker pagination.
- Removed an invalid closed-picker ARIA reference.
- Corrected scoped CSS selectors and mobile heading direction to prevent incumbent styles changing v3.
- Bounded audit histories at captured time and labelled reviewed/reopened violations correctly.
- Kept onboarding setup milestones consistent across directory and detail, independently of enforcement applicability.

## Runtime and boundaries

Reloaded the pre-existing local API with its original working directory and environment. Verified `/api/health` returns 200, OpenAPI lists the new platform endpoints, and an unauthenticated platform overview returns 401. The existing frontend development server remains available on port 8080.

No cloud deployment, new real account, role promotion, application sample seeding, external message, dependency installation, commit or publication was performed. Company provisioning, billing, impersonation and private tenant-content access remain outside the approved design. Existing suspension semantics are documented in `docs/PLATFORM_OWNER.md`.

Final copy reconciliation changed the company chart heading to the prototype’s “Company activity”. The two company/access browser cases passed again after a production rebuild, and both affected screenshots were refreshed. No open implementation or verification unit remains.

Local URL correction: verified that port 5173 belongs to the separate Hygene Ops project. This repository’s existing Vite development server runs on port 8080; use `http://localhost:8080/#platform-overview`. Its API proxy returns health 200 and unauthenticated platform overview 401.
