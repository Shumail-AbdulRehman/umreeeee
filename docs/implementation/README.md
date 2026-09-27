# Implementation Handoff — Read This First

This package expands [the three-phase roadmap](../../REMAINING_WORK_PLAN.md) into executable implementation instructions. It is a plan, not a claim that these features already exist. Baseline inspected: 23 September 2026.

## Reading order

1. Read this file for shared contracts and constraints.
2. Implement [Phase 1: secure administration](PHASE_1_SECURE_ADMINISTRATION.md).
3. Implement [Phase 2: enforcement and observability](PHASE_2_ENFORCEMENT_OBSERVABILITY.md).
4. Implement [Phase 3: red teaming and completion](PHASE_3_RED_TEAM_COMPLETION.md).

Give an implementing model this file and only the current phase document. Each phase contains a copyable task prompt, ordered work packages, file targets, contracts, and acceptance cases. Do not start all three phases simultaneously. If a required prerequisite is incomplete, finish that prerequisite rather than inserting a mock substitute.

## 1. Scope and implementation priorities

- Finish the app quickly by reusing its existing structure, components, provider code, and visual language.
- Correctness, tenant isolation, truthful security outcomes, and usable UI are release requirements.
- No Docker, Kubernetes, cloud hosting, production deployment, CI/CD infrastructure, or infrastructure-as-code work.
- Local MongoDB and, in Phase 3, local RabbitMQ are application dependencies. Document how to connect to them; do not build a deployment platform.
- No framework migration, TypeScript rewrite, generic workflow engine, or new microservice architecture. The API remains a modular FastAPI application with a separate Phase 3 worker.
- Defer Redis, WebSockets, streaming, adaptive attack generation, custom model training, and advanced PDF generation.
- Do not automatically send real emails, spend provider credits, or launch red-team tests while developing. Automated tests use fakes; live checks use explicitly authorized test accounts/targets.
- Preserve unrelated user changes and the original DOCX. Write report corrections separately; do not replace the original report.

## 2. Verified repository starting point

| Area | Existing files | Implication |
|---|---|---|
| API bootstrap | `backend/app/main.py`, `api/router.py`, `api/dependencies/services.py` | Register new routers and dependencies here; do not create another app. |
| Authentication | `services/auth_service.py`, `core/security.py`, `schemas/auth.py`, `api/dependencies/auth.py` | Reuse flows; fix organization admission, email fallback, and session validation. |
| Employees | `services/user_management_service.py`, `repositories/user_repository.py`, `Frontend/src/pages/UsersPage.jsx` | Current Manager checks and string group names require migration. |
| Integrations | `services/llm_integration_service.py`, `repositories/llm_integration_repository.py`, `Frontend/src/pages/IntegrationsPage.jsx` | Keys are plaintext; `policy_name` is only metadata. |
| Prompt execution | `services/prompt_workspace_service.py`, `models/prompt_run.py`, `Frontend/src/pages/PromptStudioPage.jsx` | Existing provider calls and history are reusable; no enforcement exists. |
| Storage | `db/mongo.py`, `db/indexes.py` | Automatic JSON fallback is unsuitable for new transactional/query behavior. |
| Demo analytics | `services/dashboard_service.py`, `Frontend/src/services/dashboard/mockDashboardData.json` | Even the dashboard API reads static JSON today. |
| Browser groups | `Frontend/src/services/inventory/inventoryService.js`, `pages/InventoryPage.jsx` | Definitions must move to the backend; browser data is not trusted membership. |
| App routing | `Frontend/src/App.jsx`, `config/navigation.js`, `pages/pageRegistry.jsx` | Keep hash routing; support query parameters for filters/details. |
| Visual system | `Frontend/src/index.css`, `components/` | Keep Inter/JetBrains Mono and current neutral surfaces; fix small text and fixed minimum width. |

Paths starting with `backend/` or `Frontend/` are repository-relative. Backend module paths abbreviated as `core/`, `api/`, `models/`, `schemas/`, `services/`, `repositories/`, `providers/`, or `validators/` live under `backend/app/`. Backend `scripts/`, `tests/`, and requirements files live under `backend/`. Proposed new paths are targets to create, not existing files. Adapt a filename if necessary, but keep the responsibilities and contracts stable.

## 3. Fixed architectural decisions

### 3.1 Naming and tenancy

- Use `company_id` internally and in MongoDB because that is the existing convention. Use “Organization” in UI copy. Do not introduce a competing `organization_id` field.
- Use `Sentinel AI` as the consistent display name. Existing storage/database names such as `centurion` need not be renamed.
- Store Mongo references as `ObjectId`; serialize IDs as strings. UUID request keys are separate string fields.
- Every tenant-owned query, update, delete/archive, aggregation, and export must include trusted `company_id` filtering.
- Derive tenant identity from the authenticated user's database record. Never accept it as authority from a request body, URL filter, or queue message.
- A valid ID belonging to another company returns 404. An invalid ID returns 422. A role failure returns 403. An invalid/expired session returns 401.
- Request DTOs should reject unexpected fields for new mutation endpoints; never spread a client payload directly into a Mongo update.

Narrow internal exceptions are authentication's initial user lookup, explicit Super Admin metadata endpoints, controlled migrations, and dispatcher/recovery scans of job metadata. These execute trusted server operations rather than tenant HTTP queries. After resolving a user/job's company from stored data, all tenant-resource operations remain company-scoped. A queue message's company claim must never substitute for that lookup.

### 3.2 Database and consistency

Use MongoDB for the completed app and a disposable MongoDB test database for integration tests. Require transaction support for cross-document administration changes and run/evaluation persistence. A local single-node replica set is sufficient for development; an existing suitable MongoDB connection also works. Check transaction capability during setup and report a clear configuration error if absent.

Retire automatic fallback. The current JSON implementation does not support transactions, aggregation, conditional writes, or the query operators this plan requires. Do not try to make it emulate MongoDB. Retain its old files for explicit migration only; unit tests use repository fakes. `DATABASE_MODE=mongodb` becomes the normal mode; obsolete values produce a helpful setup error rather than selecting a fallback.

Use transactions for database-only operations. Do not send email, call a provider, or publish a RabbitMQ message inside a transaction callback that may be retried. MongoDB single-document writes support conditional atomic changes; multi-document transaction support requires a suitable database topology. [MongoDB atomicity reference](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).

### 3.3 Roles and permission boundary

Canonical stored roles: `org_admin`, `user`, `super_admin`.

| Capability | user | org_admin | super_admin |
|---|---|---|---|
| Submit ordinary prompts using own organization integrations | Yes | Yes | Yes, own organization only |
| Read ordinary prompt history/analytics | Own records | Own organization | Own organization |
| Read own group membership and eligible integration context | Yes | Yes | Yes |
| Manage users/groups/policies/integrations/settings | No | Own organization | Own organization |
| Read tenant audit log and manage violations/alerts | No | Own organization | Own organization |
| Configure/run/read/export red-team tests | No | Own organization | Own organization |
| List organization metadata and suspend another organization | No | No | Explicit platform endpoints only |

Super Admin is created only through a local administrative command, never public signup or employee forms. It is not a blanket bypass for arbitrary tenant prompt/content access. Store it with a company like other users to avoid a second null-tenant identity model. Exclude its own company from platform suspension. No separate platform dashboard is required; a small privileged Settings section is enough.

All active users initially have access to active integrations in their company. Group scopes control policies, not model access. Per-group integration permissions are deferred; do not imply that they exist.

### 3.4 Policy assignments: one source of truth

Policy documents own `scope.group_ids` and `scope.integration_ids`. Users own `group_ids`. Do not also store authoritative group policy lists or integration policy lists.

A policy matches a request when all conditions hold:

1. Same company, `status=active`, and requested stage is included.
2. `group_ids` is empty OR intersects the user's actual active group membership.
3. `integration_ids` is empty OR contains the selected integration.

Both empty means organization-wide. Within a list use OR; between group and integration conditions use AND. Matching multiple groups does not duplicate evaluation. Run all applicable policies; a client cannot opt out of an organization-wide policy. All rules within one policy use `match=any` for the first release. Complex Boolean expressions are deferred.

Assignment editing happens in the policy editor. Group and integration pages show derived policy summaries and link to a prefiltered policy editor. This avoids conflicting sources of truth and multi-screen synchronization bugs.

### 3.5 HTTP conventions

- Keep `/api` prefixes and existing authentication route names.
- New list endpoints return `{items, page, page_size, total}`. Defaults: page 1, page_size 20; maximum 100. Sort deterministically, usually `created_at DESC, _id DESC`.
- Migrate existing users/integrations/prompt-run list clients when their phase changes these contracts. Do not silently retain two competing response shapes.
- Mutation wrappers remain descriptive: `{user, message}`, `{integration, message}`, `{group, message}`, `{policy, message}`. Auth responses retain existing `access_token` and `user` keys.
- Detail endpoints return `{user}`, `{group}`, `{policy}`, `{integration}`, `{run}`, or `{test}` as appropriate.
- Add `version` to editable administrative entities. PUT/PATCH requests include the version read by the client; a conditional update mismatch returns 409 `stale_version` and a refresh action.
- Datetimes: timezone-aware UTC in storage; ISO 8601 with timezone in JSON. Show local time in UI with timezone available in detail views. Date filters use inclusive `from`, exclusive `to`.
- Money: nullable decimal strings in USD; do not sum binary floating point for stored charges. Token counts: nullable nonnegative integers. Unknown is not zero.
- Success: 200 read/update, 201 create, 202 durable background-work acceptance. Validation 422, conflict 409, throttling 429 with Retry-After, unavailable dependency 503.
- Error shape: `{detail: {code, message, field_errors, request_id}}`. `field_errors` is a field-to-message-list map. A run-related error may additionally include a safe top-level `run` object.
- Install handlers for Pydantic validation, known domain failures, invalid IDs, and unexpected errors. Never expose tracebacks, Mongo connection strings, raw provider error bodies, credentials, or matched sensitive text.

### 3.6 Frontend API client

Extend `Frontend/src/services/api/client.js` before adding feature clients:

1. Destructure custom `token` and `headers` from options; build merged headers after spreading valid fetch options. The current spread can overwrite merged headers.
2. Throw an `ApiError` carrying `status`, `code`, `message`, `fieldErrors`, `requestId`, and safe `run` data when present.
3. Handle existing string `detail`, Pydantic error arrays, and the new envelope during migration.
4. On a protected request's 401, clear session state, stop polling, and navigate to login with a “Session expired” message. Do not treat a bad login as an expired authenticated session.
5. Forward AbortSignal, suppress cancellation errors in UI, and prevent stale responses from replacing newer filter/model results.
6. Do not retry POST mutations or provider calls automatically. Retrying a prompt uses its original idempotency key.

Keep current bearer-token storage for this bounded implementation, but use immutable user IDs and session versions. Do not render model/user HTML with `dangerouslySetInnerHTML`. Cookie-based session architecture is a separate future change, not an accidental requirement of this plan.

### 3.7 UI acceptance baseline

Build a practical administration UI, not a new marketing design. The current colors, fonts, and shell are the starting point. The frontend-design skill informed the use of progressive disclosure, consistent feedback, accessible controls, and readable data density.

- Remove `.app-shell`'s fixed `min-width:1200px`; use a collapsible navigation drawer on narrow screens and `min-width:0` in grid children.
- Verify at 1366×768, 1024×768, and 390×844. No page-level horizontal overflow; wide tables may have labeled local scrolling.
- Forms/body text: generally 14–16 px; metadata no smaller than 12 px. Do not inherit existing 9–10 px text into new workflows.
- Main controls approximately 40 px high; touch targets at least 44 px on touch layouts. Maintain visible keyboard focus and readable contrast.
- Shared components: FormField, Modal, ConfirmDialog, StatusBadge, Pagination, InlineNotice, EmptyState. Reuse current LoadingState/ErrorState.
- Modal: name/description, focus capture, Escape close when safe, return focus, labeled close button, scrollable content, reachable footer, and unsaved-change handling.
- Show one primary action per task, meaningful disabled reasons, inline validation, submission progress, success confirmation, and retryable errors. Preserve entered form values after failure.
- Destructive actions name the affected resource and explain consequences. Archive/deactivate instead of deleting history.
- Render long prompts as plain text with wrapping; copy actions only copy content the user may access.
- No fake incident counts, compliance badges, charts, timestamps, or “secured” language without supporting data.
- Navigation: Workspace (Prompt Studio); Observe (Insights, Activity, Violations, model usage); Manage (Users, Groups, Policies, Integrations); Evaluate (Red Team in Phase 3); Settings. Show only permitted items.
- Model usage can group Catalog/Latency/Spend under one navigation section while retaining existing routes/pages.
- No global search control unless it actually searches a defined resource. Remove inactive decorative controls.

### 3.8 Verification and reproducibility

Install development dependencies in the project environment, not globally. Add `backend/requirements-dev.txt` with pinned compatible pytest/httpx tooling; add a committed frontend lockfile after resolving dependencies. Do not invent package versions in advance: install a compatible stable set, run it, and record actual versions.

Backend unit tests use service/repository fakes; integration tests use a dedicated test database name and refuse to run against the app database. Tests must never drop an arbitrary database. Frontend browser tests use Playwright or the available browser harness with mocked providers and local synthetic users. Tests begin in Phase 1; Phase 3 expands coverage rather than introducing testing for the first time.

Required phase checks: focused backend tests; `npm run lint`; `npm run build`; browser walkthrough of affected workflows; tenant/role checks appropriate to the change. Record unavailable checks honestly. External provider integration tests are separate, opt-in, and not part of routine CI-style test runs.

## 4. Cross-phase schema ownership

| Collection | First introduced/changed | Responsibility |
|---|---|---|
| companies, users, integrations | Phase 1 | Tenant identity, administration, credentials, settings |
| groups, policies, policy_versions, audit_events, auth_rate_limits | Phase 1 | Membership, rules, immutable revisions, administrative history, throttling |
| prompt_runs | Phase 2 upgrade | Canonical ordinary execution and embedded evaluation snapshot |
| violations, notifications | Phase 2 | Incident review and in-app alerts derived from execution |
| red_team_tests, red_team_jobs, integration_execution_locks | Phase 3 | Test definition, dispatch intent, attempts/results, shared provider pacing |

For all collections, define indexes explicitly in `db/indexes.py`. Avoid unique names without a tenant component. Retain the existing global unique email constraint for this release; multiple organizations per email/account are out of scope.

## 4.1 Configuration contract

Update `backend/.env.example` with names and descriptions only, never working credentials. Parse numbers/booleans once in config.py with bounded validation and actionable startup errors. Unit fixtures explicitly set test secrets; no application mode silently uses the current default JWT secret.

| Variable | Introduced | Required behavior/default |
|---|---|---|
| SECRET_KEY | Phase 1 correction | Required random JWT/HMAC secret; reject the existing change-this default. |
| DATABASE_MODE | Phase 1 correction | mongodb; reject auto/memory with migration guidance. |
| MONGODB_URL, MONGODB_DB_NAME | Existing | Explicit application connection/name; transaction-capable topology. |
| TEST_MONGODB_URL, TEST_MONGODB_DB_NAME | Phase 1 | Separate test configuration; database name must be a safe test prefix and differ from app DB. |
| INTEGRATION_ENCRYPTION_KEY | Phase 1 | Required Fernet key; no fallback to SECRET_KEY. |
| ALLOWED_OLLAMA_ORIGINS | Phase 1 | Comma-separated operator allowlist; default local http://127.0.0.1:11434. |
| ACCESS_TOKEN_EXPIRE_MINUTES | Existing | Retain 60 unless explicitly configured. |
| SMTP_HOST, SMTP_PORT, SMTP_FROM_EMAIL, SMTP_USERNAME, SMTP_PASSWORD, SMTP_USE_TLS, SMTP_USE_SSL | Existing | Support SMTP authentication being absent for an explicitly configured local sink; delivery availability is not inferred solely from having a username/password. No OTP console fallback. |
| FRONTEND_APP_URL, CORS_ORIGINS | Existing | Explicit trusted local frontend addresses; invitation links use FRONTEND_APP_URL. |
| AUTH_LOGIN_ACCOUNT_LIMIT, AUTH_LOGIN_IP_LIMIT, AUTH_RECOVERY_ACCOUNT_LIMIT, AUTH_RECOVERY_IP_LIMIT | Phase 1 | Defaults/windows in Phase 1; positive bounded integers. |
| CONTENT_ENCRYPTION_KEY | Phase 2 | Separate required Fernet key for stored text; never sent to clients. |
| VALIDATOR_MODEL_CACHE_DIR | Phase 2 | Explicit local model cache; no download during request execution. |
| INJECTION_MODEL_ID, INJECTION_MODEL_REVISION, TOXICITY_MODEL_ID, TOXICITY_MODEL_REVISION | Phase 2 | Model IDs and pinned artifact revisions recorded in VALIDATORS.md. |
| VALIDATION_STAGE_TIMEOUT_MS | Phase 2 | Default 5000; bounded and measured separately from the performance target. |
| RABBITMQ_URL, RED_TEAM_QUEUE_NAME | Phase 3 | Broker connection and application-owned durable queue; no credentials in API health output. |
| RED_TEAM_MAX_ATTEMPTS | Phase 3 | Default/max 3 for first release. |
| RED_TEAM_EXECUTION_LEASE_SECONDS | Phase 3 | Default 120; greater than ordinary network deadlines, heartbeat required. |
| INTEGRATION_REQUESTS_PER_MINUTE | Phase 3 | Default 6, valid 1–60 for first release; shared per-integration limiter. |

Use a fake email/provider/broker through dependency injection in tests instead of environment flags that could accidentally enable security bypasses in the real app. Add package __init__.py files where module-run commands require them. Commands such as `python -m scripts.migrate_phase1` and `python -m app.queue.dispatcher` run with `backend/` as the working directory.

## 5. Implementation progress protocol

At the end of each work package, update `docs/implementation/PROGRESS.md` (create during implementation) with:

- Work-package ID and status: not_started / in_progress / complete / blocked.
- Files changed and migrations/configuration added.
- Commands run and actual results.
- Known failures and next exact step.
- Any deliberate contract change, including which dependent phase document was updated.

Do not mark a package complete when its UI is still using fake data, its tests are skipped, or a required integration is only represented by a stub. Keep small coherent checkpoints; do not automatically commit or publish changes unless the user requests that workflow.

## 6. Sources and version-sensitive checkpoints

These documents define application contracts. Library call signatures must be checked against the installed version during implementation.

- Encryption uses authenticated Fernet encryption with a separately managed key. Verify round-trip and invalid-key behavior against the installed package. [Cryptography Fernet documentation](https://cryptography.io/en/latest/fernet/).
- Guardrails has custom validator support; policy actions belong to the application's decision layer, not an assumed universal library default. [Guardrails validator source](https://github.com/guardrails-ai/guardrails/blob/main/guardrails/validator_base.py).
- RabbitMQ publisher confirms and consumer acknowledgements address separate delivery stages. Prefetch limits unacknowledged deliveries; it is not a requests-per-minute limiter. [RabbitMQ acknowledgements and confirms](https://www.rabbitmq.com/docs/confirms).

## 7. Prompt for the implementing model

> Read `docs/implementation/README.md` and the phase document I name. Inspect the current repository and preserve unrelated changes. Implement the phase in its stated work-package order, including backend, frontend, migrations, and focused tests. Reuse the existing architecture and UI; deployment is excluded. Follow the shared API, role, tenant, and policy contracts. Do not replace unfinished features with mock success responses. Maintain `docs/implementation/PROGRESS.md` so another session can continue without rereading everything. At each completed package, report the behavior delivered, verification results, and next package. If repository facts invalidate a design assumption, document the smallest necessary correction and update dependent contracts. Never claim a live provider, benchmark, or security test passed without executing it.
