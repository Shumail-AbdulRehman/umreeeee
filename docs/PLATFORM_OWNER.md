# Averiq platform owner workspace

The platform owner workspace implements the approved `design/platform-owner/v3` reference with live company metadata and aggregate workspace activity. It is separate from the organization workspace.

## Open the workspace

The existing local server for this workspace is [Averiq on port 8080](http://localhost:8080/#platform-overview). Port 5173 belongs to another project.

Sign in with an active, verified `super_admin` account. New sign-ins and an empty application URL open Platform overview. Existing organization routes remain available through **Your organization**; the organization sidebar and Settings link back to **Platform workspace**.

Routes:

- `#platform-overview`
- `#platform-companies`
- `#platform-company?id=<company-id>`
- `#platform-audit` or `#platform-audit?company_id=<company-id>`

Use the existing local promotion command to promote an explicit verified account if needed: from `backend`, run `.venv/bin/python -m scripts.bootstrap_super_admin --user-id <id>` to review the change, then repeat with `--apply`. Promotion revokes existing sessions; sign in again. No HTTP promotion or bootstrap route was added.

## Recorded data

- **Workspace activity:** only `source=workspace` prompt submissions. Red Team runs and imported legacy runs do not inflate adoption metrics. The selected 7/30-day UTC interval includes the current partial day.
- **Using Averiq:** companies with at least one workspace submission in the selected interval. A blocked or failed submission still demonstrates use.
- **Access:** current Active/Suspended state. Missing status/version on older records means Active/version1.
- **Onboarding:** Awaiting admin means no active, verified administrator with a password. Setup incomplete means an administrator exists but an active integration, group or named DLP/Guardrail policy is missing. Ready describes these setup milestones, independently of enforcement applicability.
- **Configured policies:** active named DLP and Guardrail policies, excluding reference catalog documents.
- **Input-policy coverage:** eligible active verified ordinary members covered for every active integration with an enabled model. Administrators retain their existing exemption. The metric describes applicability, not detector availability or accuracy.
- **Evaluation coverage:** terminal workspace submissions with at least one completed rule check divided by all terminal workspace submissions. No terminal submissions produces an unavailable percentage.
- **Open violations:** the current unresolved workspace backlog, including reviewed items. This is independent of the selected submission window; high severity includes high and critical.
- **Needs attention:** high/critical backlog, at least three recorded provider errors in the selected interval, missing verified administrator, failed invitation delivery and missing active integration. Company detail additionally reports incomplete required input-policy coverage.

The directory uses server-side filtering, stable sorting and pagination. Report timestamps and chart dates are UTC. Charts provide a daily table; the 30-day visual groups days into ten buckets while preserving totals.

## Company access and audit

Suspend/reactivate requires a nonblank reason and the latest company version. The operator cannot change their home company's access. The transaction writes both the operator and target audit records; the platform timeline displays one action attributed to the affected company.

Suspension denies company authentication and ordinary workspace dispatch while suspended. It does not rotate all member tokens, undo external requests already dispatched, or guarantee cancellation of every background process. An existing unexpired session can become usable after reactivation. These existing semantics are stated in the confirmation dialog.

Concurrent changes require a refresh and deliberate confirmation. If another owner already applied the requested state, the dialog will not reverse it. A failed refresh retains the reason and blocks confirmation until the latest state loads.

All platform APIs require server-authenticated Super Admin authority and return explicit metadata-only responses. They do not expose tenant prompts, responses, employee emails, findings, resolution notes, provider credentials, system instructions or arbitrary audit payloads. Tenant actors use role labels; platform access actions may show the platform actor's display name. Only selected lifecycle events are visible, with real UTC timestamps and request identifiers. Future-dated events are excluded.

## Verification

- Backend unit tests: `cd backend && .venv/bin/python -m pytest -q tests/unit`
- Platform Mongo acceptance: configure a dedicated `TEST_MONGODB_URL` and `TEST_MONGODB_DB_NAME=test_platform`, then run `.venv/bin/python -m pytest -q tests/integration/test_platform_owner.py`. The fixture creates and drops its own unique test databases.
- Frontend unit tests: `cd Frontend && npm test`
- Platform browser acceptance: `cd Frontend && npm run test:platform`
- Lint/build: `cd Frontend && npm run lint && npm run build`

Browser fixtures contain synthetic v3-like examples only in tests. The runtime never seeds or substitutes sample company data. Screenshot evidence and actual results are in `docs/planning/platform-owner/implementation-verification.md`.
