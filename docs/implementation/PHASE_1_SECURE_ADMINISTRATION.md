# Phase 1 — Secure Foundation and Real Administration

Read [the shared contracts](README.md) first. This phase delivers secure account administration, real groups, integration credential protection, and configurable policies. It does not claim that configured policies are enforced yet; Phase 2 adds enforcement.

## 1. Completion target

An administrator can register a new organization, verify their email, invite employees, assign real groups, connect a provider, and create a validated policy with explicit scope. Everything persists in MongoDB and respects server-side permissions. The UI uses real administration data, consistent forms, and truthful empty states.

Keep the existing provider execution feature working, but clearly label it “Policy enforcement is not enabled yet” until Phase 2. Do not present a stored policy name as evidence of protection.

## 2. Ordered work packages

| ID | Package | Depends on | Checkpoint |
|---|---|---|---|
| P1-01 | Baseline, database, errors, test fixtures | Shared contracts | App starts against explicit MongoDB; errors are safe and predictable. |
| P1-02 | Account admission, sessions, OTPs, roles | P1-01 | Tenant admission and recovery vulnerabilities are fixed. |
| P1-03 | Credential encryption and integration cleanup | P1-01, P1-02 | Credentials are encrypted and provider setup is usable. |
| P1-04 | Groups and employee lifecycle | P1-02 | Membership persists and is validated on the server. |
| P1-05 | Policies, versions, assignments, audit | P1-03, P1-04 | Real policy CRUD and scope management work. |
| P1-06 | Shared UI, administration pages, migration rehearsal | P1-01 through P1-05 | Administration workflows pass API and browser checks. |

Develop a package's UI alongside its API. P1-06 is the final consistency pass, not a reason to leave all frontend work to the end.

## 3. Files and responsibilities

### Existing files to change

- `backend/app/core/config.py`: required secrets, database mode, allowed local provider origins, throttling settings.
- `backend/app/core/security.py`: immutable JWT subject, token version validation support, password/code helpers.
- `backend/app/db/mongo.py`: explicit MongoDB access; remove automatic fallback from application execution.
- `backend/app/db/indexes.py`: indexes listed below.
- `backend/app/main.py`: exception handlers, request IDs, startup dependency checks.
- `backend/app/api/dependencies/auth.py`: active-account and company-status validation; role dependencies.
- `backend/app/api/dependencies/services.py`, `backend/app/api/router.py`: register new services/routes.
- `backend/app/services/auth_service.py`, `email_service.py`, `user_management_service.py`, `llm_integration_service.py`: implement the corrected workflows below.
- `backend/app/models/{company,user,llm_integration}.py`, matching repositories and schemas: fields, tenant-scoped methods, safe serialization.
- `backend/app/services/prompt_workspace_service.py`: adapt to encrypted credentials, canonical roles, integration status, and server-owned system instructions without adding Phase 2 enforcement yet.
- `Frontend/src/services/api/client.js`: shared ApiError and session handling.
- `Frontend/src/App.jsx`, `config/navigation.js`, `components/Sidebar.jsx`, `components/Topbar.jsx`, `pages/pageRegistry.jsx`: role-aware navigation and real routes.
- `Frontend/src/pages/{UsersPage,InventoryPage,IntegrationsPage,PoliciesPage,SettingsPage,PromptStudioPage}.jsx` and auth pages: contracts and interaction changes.
- `Frontend/src/services/{auth,users,integrations,inventory}/`: replace old shapes and browser-only group access.
- `Frontend/src/index.css`: responsive shell, control/readability fixes, reusable styles.

### New backend files

Module paths below are relative to backend/app; scripts, tests, and requirements-dev.txt are relative to backend.

- `core/errors.py`: domain error types and safe public error mapping.
- `core/permissions.py`: canonical roles/capabilities shared by services and routes.
- `core/encryption.py`: credential encryption/decryption and key validation.
- `core/rate_limits.py`: bounded MongoDB-backed fixed-window counters.
- `models/group.py`, `policy.py`, `audit_event.py`.
- `schemas/groups.py`, `policies.py`, `settings.py`, `platform.py`, `common.py`.
- `repositories/group_repository.py`, `policy_repository.py`, `audit_repository.py`.
- `services/group_service.py`, `policy_service.py`, `audit_service.py`, `settings_service.py`, `platform_service.py`.
- `api/routes/groups.py`, `policies.py`, `settings.py`, `platform.py`, `audit.py`.
- `scripts/migrate_phase1.py`, `scripts/bootstrap_super_admin.py` and package initialization needed to run them with `python -m`.
- `tests/conftest.py`, `tests/unit/`, `tests/integration/`, `requirements-dev.txt`.

### New frontend files

- `services/groups/groupService.js`, `services/policies/policyService.js`, `services/settings/settingsService.js`.
- `components/forms/FormField.jsx`, `components/Modal.jsx`, `ConfirmDialog.jsx`, `StatusBadge.jsx`, `Pagination.jsx`, `InlineNotice.jsx`, `EmptyState.jsx`.
- `components/policies/PolicyEditor.jsx`, `PolicyRuleEditor.jsx`, `PolicyScopeEditor.jsx`.
- A shared permission helper such as `utils/permissions.js`.

Keep current page filenames when practical: InventoryPage can display “Groups.” Avoid cosmetic renames that create unnecessary diffs.

## 4. Data model contracts

All new tenant-owned records include `company_id`, UTC timestamps, and an integer `version` where editable. Object IDs stay as ObjectId in storage and strings in API DTOs. Client input cannot set tenant, audit actor, timestamps, encryption fields, or effective permissions.

### 4.1 Companies

Retain `name`, `slug`, `created_at`; add:

| Field | Contract |
|---|---|
| status | `active` or `suspended`; new companies are active while their first account awaits verification. |
| version | Starts at 1; optimistic concurrency for settings/platform actions. |
| administration_revision | Integer incremented inside every tenant administration transaction to serialize conflicting changes. |
| settings.content_retention_days | Integer 1–30, default 7; Phase 2 implements content expiration. |
| settings.require_active_policy | Boolean, default true; Phase 2 uses it to reject unprotected ordinary requests. |
| updated_at | UTC timestamp. |

No billing, plans, domains, organization switching, or arbitrary settings JSON in this release.

### 4.2 Users

Retain existing personal, verification, and invitation fields; add/change:

- `role`: enum `org_admin | user | super_admin`.
- `group_ids`: array of unique group ObjectIds. Legacy `groups` is migration input only.
- `is_active`: bool, default true; separate from verified/invited state.
- `token_version`: integer, default 0; increment on password reset, deactivation, email change, or invitation credential replacement.
- `version`, `updated_at`.
- OTP records include a random `challenge_id` in addition to hash, expiry, sent time, and attempt count, so a stale attempt cannot consume a newer code.
- Invitation state includes last delivery status, with no plaintext token stored.

Computed account status precedence: inactive → `inactive`; pending invitation → `invited`; password set and verified → `active`; otherwise → `pending_verification`. A password reset must not activate an inactive/unverified user.

Keep globally unique normalized email for this version. No public role parameter. Public signup always creates `org_admin` in a newly created company.

### 4.3 Groups

Fields: `_id`, `company_id`, `name`, `name_normalized` (trimmed/casefolded), `description`, `status` (`active|archived`), `version`, `created_at`, `updated_at`.

Name: 2–80 characters; description: at most 1000. No policy labels or policy ID arrays on this record. Member count and applicable policy summaries are derived.

Archiving a group is rejected with 409 while it has assigned users (including inactive users) or is referenced by a non-archived policy. The UI provides links to resolve dependencies. This prevents silent membership loss and scope changes. Rename is safe because assignments use IDs.

### 4.4 Integrations

Retain provider/account/models fields; replace plaintext `api_key` with `api_key_ciphertext` and `api_key_key_id` (`v1` initially). Add:

- `status`: `active|archived`.
- `version`, `updated_at`.
- `system_prompt`: administrator-managed text, max 12000 characters; preserve line breaks.
- `base_url`: optional only for Ollama; validated against operator-configured allowed origins.
- `model_prices`: list of `{model, input_usd_per_million, output_usd_per_million, effective_at}`; nullable/absent until configured. Use nonnegative decimal strings. Display these as estimates, not provider billing truth.

Remove `policy_name` as an authoritative field. Read DTOs may expose `legacy_policy_name` during migration plus derived policy summaries. Do not automatically turn a legacy label into an active security policy.

Create requires an API key except for Ollama. Update with omitted/null/blank API key means preserve existing key; never treat the masked display value as a key. Provider type is immutable after creation; users create a new integration to change provider. Models are selected from discovery but validated again server-side as bounded strings; model discovery is not proof every returned model supports chat.

Archive is rejected while non-archived policies explicitly reference the integration; remove those scopes first. Phase 3 adds a conflict for queued/running red-team jobs. Ordinary historical runs remain readable by snapshot even after archive.

### 4.5 Policies and immutable revisions

Policy fields:

| Field | Contract |
|---|---|
| name/name_normalized | 2–120 characters; case-insensitive unique per company, including archived records for simple stable identity. |
| description | Max 2000 characters. |
| category | `pii`, `prompt_injection`, `toxicity`, `restricted_content`, `custom`. |
| action | `BLOCK`, `LOG`, `ALERT`. |
| severity | `low`, `medium`, `high`, `critical`; explicitly configured, with category-appropriate UI defaults. |
| status | `draft`, `active`, `disabled`, `archived`. |
| stages | Nonempty subset of `input`, `output`; default `[input]`. |
| scope | `{group_ids: [], integration_ids: []}` with shared matching semantics. |
| match | Literal `any` for this release. |
| rules | 1–10 typed rules; see below. |
| version | Monotonic integer; every mutation creates an immutable revision. |
| created_by/updated_by | Trusted user IDs. |

`policy_versions` stores the complete policy snapshot for each `(company_id, policy_id, version)`. Insert snapshot and update live record in the same transaction. Do not mutate a revision. Phase 2 references these snapshots for explainable history.

Typed rule contract:

| type | config | Phase 1 validation |
|---|---|---|
| keyword | `{terms: string[], case_sensitive: bool, match_mode: substring\|whole_word}` | 1–50 nonempty terms; each max 100 characters; default case-insensitive substring. |
| regex | `{pattern: string, ignore_case: bool}` | Max 500 characters; compile using the Phase 2-compatible bounded regex engine. No user code or flags beyond this boolean. |
| pii | `{entities: [EMAIL_ADDRESS\|PHONE_NUMBER\|CREDIT_CARD], threshold: number}` | Nonempty supported entities; threshold 0–1, default 0.8; detection implementation is Phase 2. |
| prompt_injection | `{threshold: number}` | 0–1, default 0.8; unavailable until a tested semantic validator is installed in Phase 2. |
| toxicity | `{threshold: number}` | 0–1, default 0.8; unavailable until a tested semantic validator is installed in Phase 2. |

Each rule has a server-generated UUID `rule_id`, retained on edit when the same rule remains. Unknown types/config keys are rejected. Keywords/regex can represent restricted topics but must not be marketed as semantic injection detection. Regex evaluation later uses an actual timeout-capable engine; Python `re` alone is not a safe timeout mechanism.

Expose validator capabilities as configured/available/unavailable with a reason. In Phase 1 all execution capability is false. Policies can be configured as active for future use, but every policy page and Prompt Studio must display “Configured; enforcement not enabled.” Phase 2 startup refuses enforcement readiness if active policies require unavailable validators. Do not invent a successful test result in Phase 1.

### 4.6 Audit and throttling

`audit_events`: `_id`, `company_id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `before`/`after` allowlisted metadata, `request_id`, `created_at`. Append only; no public edit/delete endpoints. Never include keys, OTPs, passwords, JWTs, full prompts, or plaintext provider responses.

For unauthenticated successful signup/verification, attribute to the created user when known; failed authentication goes to sanitized operational logs and rate counters, not a fake tenant audit event.

`auth_rate_limits`: hashed key, endpoint bucket, count, window start, `expires_at`. Suggested configurable defaults: login 10 attempts/account/15 min and 60/IP/15 min; signup 10/IP/hour; recovery/resend 5/account/hour and 30/IP/hour. Keep code attempt limits and resend cooldown as additional controls. Use server-observed IP; do not trust arbitrary X-Forwarded-For headers. Use conditional atomic updates/upserts and a unique bucket key. TTL cleanup is storage hygiene; explicitly check time windows in logic.

## 5. API inventory

All tenant endpoints derive company from authentication. Refer to shared list/error/version conventions.

| Endpoint | Access | Contract |
|---|---|---|
| Existing `/api/auth/*` | As appropriate | Keep route names and form shapes; correct security behavior below. |
| GET `/api/users` | Admin | Paginated users; filters `q`, `status`, `role`, `group_id`; include current admin with protected actions disabled. |
| POST `/api/users` | Admin | Invite using first/last name, email, department, role (`org_admin` or `user`), group_ids; return user and delivery status. |
| PUT `/api/users/{id}` | Admin | Edit profile, role, group_ids with version. Do not change account credentials through this endpoint. |
| PATCH `/api/users/{id}/status` | Admin | `{is_active, version}`; revoke sessions on deactivation. |
| POST `/api/users/{id}/resend-invitation` | Admin | Invited accounts only, cooldown enforced, new token invalidates old token. |
| GET/POST `/api/groups` | Admin | Paginated list/create; group fields above. |
| GET/PUT `/api/groups/{id}` | Admin | Detail/edit with version. |
| PATCH `/api/groups/{id}/status` | Admin | `{status, version}`; enforce dependency conflicts. |
| GET `/api/groups/mine` | Any active user | Own active memberships only; register static path before dynamic ID path. |
| GET/POST `/api/policies` | Admin | List/create; filters q/category/status/group_id/integration_id. |
| GET/PUT `/api/policies/{id}` | Admin | Detail/full configuration edit with version. |
| PATCH `/api/policies/{id}/status` | Admin | `{status, version}`; immutable audit/revision. |
| GET `/api/policies/{id}/versions` | Admin | Paginated historical metadata; detail can include selected version snapshot. |
| GET `/api/policies/capabilities` | Admin | Typed validators, parameter schema, readiness, reason; static route first. |
| Existing `/api/integrations` and `/available-models` | Admin | Keep provider workflows; paginate list and encrypt credentials. |
| POST `/api/integrations/{id}/available-models` | Admin | Empty body; discover using this same-tenant integration's stored credential/base URL without returning the credential. |
| GET `/api/integrations/{id}` | Admin | Safe integration detail, configured models, derived policy links. |
| PATCH `/api/integrations/{id}/status` | Admin | Archive/unarchive with version and dependencies checked. |
| GET/PUT `/api/settings` | Admin | Organization name and validated settings only; version required on PUT. Slug is immutable. |
| GET `/api/audit` | Admin | Paginated/filterable administrative events. |
| GET `/api/platform/organizations` | Super Admin | Organization metadata only; no prompt/user-content joins. |
| PATCH `/api/platform/organizations/{id}/status` | Super Admin | `{status, version}`; audit and deny self-company suspension. |

Remove old destructive DELETE user/integration routes from UI; either remove them from API or return 405 with a migration message. Do not silently preserve hard deletion. `/api/auth/me` returns canonical role, `group_ids`, safe `groups` summaries, effective account status, and company metadata. Frontend permissions derive from canonical role, not group labels.

## 6. P1-01 — Baseline, database, and error handling

1. Inspect git status and configuration examples. Do not read real secrets into output. Record current run commands in PROGRESS.md.
2. Create an isolated Python environment and install current requirements plus pytest/httpx. Add explicit cryptography and the chosen timeout-capable regex dependency when introduced; pin the versions actually tested.
3. Install frontend dependencies and generate a lockfile. Run initial lint/build; record existing failures before edits.
4. Implement transaction-capable MongoDB access with bounded connection timeouts. Do not fall back on connection failure. Distinguish live process health from dependency readiness; readiness returns 503 without raw connection details when unavailable.
5. Add safe ObjectId parsing and request IDs. Centralize exception handlers. Domain service failures map to stable codes.
6. Add a test database fixture and repository unit fakes. Test database names must start with a dedicated test prefix and differ from app configuration. Reset only fixture-owned collections.
7. Add common pagination and version checks. Scope repository methods by company: prefer `find_by_id(company_id, id)` over loading globally then checking in the service.

Transaction rule for tenant administration: update the company document's `administration_revision` first within each administration transaction. This creates a shared write conflict for concurrent membership/role/scope/archive edits. Re-read prerequisites inside the transaction; on transaction retry, re-evaluate them. This small-app tradeoff prevents last-admin and assignment/archive races without a separate distributed lock. Do not use a Python process lock to claim multi-process safety.

## 7. P1-02 — Correct authentication and authorization

### Registration

Normalize inputs, validate password confirmation, and derive the company slug. If slug already exists, return 409 with instructions to ask an administrator for an invitation. Never reuse that company for public signup.

Create company and first pending org_admin atomically with unique company-slug/email constraints. On concurrent duplicates, roll back both records and return a controlled conflict. Commit before attempting email delivery. If delivery fails, keep the pending account so login/resend can recover; explain delivery failure without exposing the code. The signup response must not imply a verified session.

### JWT and account checks

Use JWT claims `sub=user_id`, `ver=token_version`, `iat`, and `exp`. Load user by ID on every authenticated request; reject absent/inactive/unverified accounts, suspended company, or version mismatch. Do not accept old email-subject tokens as a compatibility fallback. Migration deliberately signs everyone out.

Malformed/missing JWT subject/version is a 401 authentication failure; do not reuse a route-resource ID parser in a way that turns an invalid token into a 422.

Keep existing PBKDF2-SHA256 password hashes; do not force a bcrypt migration just to match the outdated report. Centralize exact role checks. Backend dependencies protect routes, and services also enforce authority where invoked outside HTTP.

### Recovery and verification

- No email-delivery fallback returns or logs codes in normal operation. Use fake email delivery in automated tests and a local SMTP sink for manual development.
- A verification or reset challenge is stored hashed, scoped to email/purpose, and bound to a random challenge ID. Send only after the database commit. On delivery failure, conditionally invalidate that same challenge if it is still current.
- Forgot-password always returns the same generic outward response for nonexistent, inactive, and existing accounts, including delivery failure. Do not expose account existence through delivery status. Authenticated invitation administration may show delivery failure.
- Validate expiry, attempts, challenge ID, and expected hash inside an atomic conditional update/transaction. Increment failed attempts atomically. Successful consumption clears the challenge exactly once.
- Password reset increments token_version in the same atomic operation as changing the password. It does not alter verification or activation status.
- Resend rotates codes/tokens and invalidates previous ones. Cooldown survives delivery errors; never allow unlimited resend because delivery mode equals console.
- Do not enable password recovery as an alternate invitation-acceptance path; invited accounts without an established password use invitations.

### Employee lifecycle

Existing users keep a stable ID. Disable email edits for already active accounts in this release, explaining that verified-email change is not supported; this avoids insecure address reassignment. Invited-account email correction rotates the invitation and increments token_version.

Only admins assign org_admin/user. Super Admin changes are CLI-only. Prevent an admin from deactivating themself through employee management. Also verify within the serialized transaction that at least one other active, verified administrative account remains before demotion/deactivation of an admin. Count org_admin and super_admin within the company. Pending invitations do not count.

Company suspension is checked on every authenticated request and later on every worker provider call. Unsuspension does not reactivate individually disabled users.

`bootstrap_super_admin.py` promotes an explicitly identified existing active, verified account by immutable user ID. It runs locally with database authority, requires an explicit apply option, shows only safe identity/tenant metadata, increments token_version, and records an audit event. Do not accept a password through a command-line argument or add an HTTP bootstrap endpoint. It must not silently create a default privileged account on startup.

## 8. P1-03 — Credentials and provider setup

1. Add `INTEGRATION_ENCRYPTION_KEY`, a valid Fernet key separate from JWT `SECRET_KEY`. Missing/malformed key is an explicit startup/configuration error, never a plaintext fallback.
2. Encrypt on create/update in the credential service before persistence. Decrypt only in provider execution/model discovery. List/detail serialization must never expose ciphertext or a raw key.
3. Return `has_api_key` and a minimal masked suffix; do not reveal the first portion of the key. Ollama can return has_api_key=false.
4. Preserve the existing provider dispatch code. Make provider errors safe and typed; robustly handle error bodies that are objects, strings, or invalid JSON.
5. Fix model-selection races: cancel or ignore an old discovery response after provider/key changes. During edit, use POST `/api/integrations/{id}/available-models` for the stored credential. Use the existing POST `/api/integrations/available-models` with explicitly supplied provider/api_key only for create or testing a replacement key; do not send the stored secret back to the browser.
6. For Ollama, allow only HTTP(S) URLs whose origin is explicitly allowed in operator configuration; default allow local `http://127.0.0.1:11434`. Reject userinfo, fragments, unexpected path/query components, and redirect escapes. This is a local development integration, not an arbitrary server-side URL fetcher.
7. Keep a server-owned integration system prompt. Regular users cannot change it via Prompt Studio; reject nonempty system_prompt overrides. Admin changes use integration edit with audit. Clear the existing freeform system-prompt field from the ordinary prompt request UI.
8. Token cost configuration is optional; leave missing prices as unknown. Add controls under an “Advanced: estimated model pricing” disclosure or complete these controls with Spend in Phase 2.

Use a pure provider transport interface suitable for a fake in tests. Do not introduce a second provider implementation for red teaming; Phase 3 will reuse this boundary.

## 9. P1-04 — Groups and employee membership

Create tenant-scoped CRUD and index names by `(company_id, name_normalized)`. Validate every requested group ID against active groups in the same company. A cross-company or nonexistent assignment returns a field error without exposing another group's name.

Replace browser group loading in UsersPage, InventoryPage, and PromptStudioPage. UsersPage lists server groups for assignments. Prompt Studio only displays actual memberships from `/auth/me` or `/groups/mine`; remove selectable groups that imply users can choose their security scope. If descriptive tags are later needed, use a separate `tags` field with no authorization effect.

Group archive checks and membership changes both participate in the tenant administration transaction. UI conflicts include useful same-tenant dependency counts and links. Paginate users on the server; do not load the whole company into memory and slice it.

## 10. P1-05 — Policy editor and history

Implement typed Pydantic request models using a discriminated union for rule types. Validate stages, status, scope references, term/pattern limits, and thresholds. For regex, compile but do not run an unbounded arbitrary pattern during save.

On create, generate policy/rule IDs and version 1, validate all references, insert policy plus revision, and audit in one transaction. On edit, preserve unchanged rule IDs, assign IDs to new rules, increment version, and snapshot the full result. Use conditional version matching. An archive is a new revision with archived status, never record deletion.

Do not replace a deleted scoped group/integration with an empty list because empty means global scope. Reject dependency-breaking archives or require the admin to edit the policy first. An archived policy cannot be activated directly; restore to draft, validate, then activate.

UI editor sections:

1. Basics: name, description, category.
2. Behavior: action, severity, input/output stages; explain that LOG/ALERT allow a match unless another policy blocks.
3. Scope: organization-wide default or optional group/integration selectors; show a readable AND/OR summary.
4. Rules: choose a supported type, show only its fields, add/remove rules, explain “any rule matches.”
5. Review/save: current status, enforcement readiness notice, validation summary.

Policy list columns: name, category, action, stages, scope summary, status, last updated, actions. Search/status filters are functional. Do not show trigger totals before Phase 2 provides them. Detail includes version history and audit metadata.

## 11. Migration and indexes

Implement `python -m scripts.migrate_phase1 --dry-run` as the default. Require explicit `--apply`; print counts and IDs, never secrets or personal text. Require a user-created backup before applying to a non-test database. Record migration version and per-record progress so retries are safe.

Migration order:

1. Inspect duplicate/invalid company slugs, normalized emails, and per-company/provider normalized integration account names. Report conflicts; do not merge organizations or credential-bearing integrations automatically.
2. Add company fields/defaults. Map Manager (case-insensitive) → org_admin and Employee/User → user. Stop on unknown roles and require an explicit mapping rather than granting privileges.
3. Add is_active, token_version, versions/timestamps; mark legacy tokens invalid through the new JWT schema. Preserve password hashes.
4. Convert existing backend user group-name assignments into per-company groups, case-insensitively deduplicated, then write group_ids. This migration is based on existing server records; browser-local groups are not auto-imported.
5. Encrypt each plaintext integration key and verify decryption before removing its plaintext field in that record's atomic update. Leave already encrypted records unchanged. Any failure stops with a count and safe record ID.
6. Add integration status/system_prompt defaults. Preserve old policy_name as legacy metadata only; create no active policy from a label.
7. Preserve old prompt history as legacy-unenforced; Phase 2 performs content/schema migration. Do not invent evaluations.
8. Create indexes after conflict checks, then rerun dry-run to confirm idempotency.

Optional browser group import: explicit administrator action showing proposed names for the current company, duplicate resolution, and a server-side validation preview. Do not import local DLP/guardrail labels as working rules. Successful import can leave old local storage untouched but unused; no broad browser storage clearing.

If an actual legacy app.db JSON file exists, support an explicit `--source-json` migration input rather than reading it automatically. Parse Mongo Extended JSON, validate collection/record shapes, preserve IDs and relationships, and run the same transformations into the configured MongoDB target. Abort on conflicting IDs/slugs/emails instead of merging tenants. Dry-run reports conflict/count summaries only. Never modify or delete the source file, and never enable continued dual writes after import.

Required indexes:

- companies: unique slug.
- users: unique normalized email; `(company_id, is_active, role)`; `(company_id, group_ids)`; invitation token hash lookup.
- integrations: unique `(company_id, provider, account_name_normalized)`; `(company_id, status)`.
- groups: unique `(company_id, name_normalized)`; `(company_id, status)`.
- policies: unique `(company_id, name_normalized)`; `(company_id, status)`; separate indexes for scope.group_ids and scope.integration_ids (do not build a compound index containing both array fields).
- policy_versions: unique `(company_id, policy_id, version)`.
- audit_events: `(company_id, created_at DESC, _id DESC)`.
- auth_rate_limits: unique bucket key; TTL on expires_at with explicit logic-level window enforcement.

## 12. P1-06 — UI completion and phase transition

Make role checks consistent in App, Sidebar, page actions, and API services. Use a single canonical permission helper rather than repeating `role === 'manager'`.

Until Phase 2, replace the live-looking dashboard with a real onboarding/administration summary: users/groups/integrations/policies counts derived from MongoDB, and an explicit enforcement-not-ready notice. Hide nonfunctional analytics/violations controls or show a truthful “Not available yet” page. Do not let the old mock dashboard remain the implicit API fallback. Protect `/api/dashboard` now; it can return this transitional summary with a named response shape consumed by an updated InsightsPage.

Use backend-provided capabilities for policy option availability. Disabled features require a visible reason. Forms preserve values after 409/422/503. Expired invitation pages offer instructions to request a new invitation, not a dead submit button. Failed SMTP on invitation creation shows “Account created; invitation delivery failed” with a resend action instead of claiming the entire creation failed.

Settings exposes actual organization name, retention setting (marked as taking effect with Phase 2), and require-policy setting. Super Admin gets a metadata-only organization list and suspension action. All settings are allowlisted and audited.

## 13. Acceptance tests

Implement the security/API cases as automated tests, plus focused browser cases. Use two companies A/B, admins A/B, a regular user A, an invited user A, inactive user A, and a Super Admin fixture. These fixtures never send real email.

| ID | Scenario | Required result |
|---|---|---|
| P1-T01 | Signup with existing company slug, different email | 409; no membership/user created in that company. |
| P1-T02 | Concurrent signup for same slug | At most one company/admin pair; no orphan company after rollback. |
| P1-T03 | Email delivery failure | No code/token in API/log output; verification retry works; reset remains generic. |
| P1-T04 | Reuse consumed verification/reset/invitation token | Rejected; concurrent successful consumption occurs only once. |
| P1-T05 | Reset established user's password | Old JWT fails; new password works; inactive account stays inactive. |
| P1-T06 | Login/resend rate limit | 429/Retry-After according to configured bucket; no unbounded retry loop. |
| P1-T07 | Regular user calls each admin mutation | 403 even if navigation is bypassed. |
| P1-T08 | A queries/edits B resource IDs | 404; no metadata/content exposure or state change. |
| P1-T09 | Concurrent demotion/deactivation of final admins | Transaction conflict/recheck preserves an active admin. |
| P1-T10 | Invalid ObjectId and unexpected fields | Controlled 422; no traceback. |
| P1-T11 | Integration create/update/read | Storage contains encrypted key only; browser sees no raw/ciphertext key. |
| P1-T12 | Blank key on edit, Ollama without key | Existing remote key retained; local integration creation succeeds. |
| P1-T13 | Disallowed Ollama URL or redirect | Rejected without fetching the destination. |
| P1-T14 | Group membership across refresh/browser sessions | Same server-owned IDs and assignments; no local storage dependency. |
| P1-T15 | Archive assigned group/integration | 409 with safe dependency explanation; no scope broadening. |
| P1-T16 | Policy mutation and stale version | Immutable new revision on success; stale write 409; rules validated. |
| P1-T17 | Migration applied twice | No duplicate groups, no double encryption, no privilege escalation. |
| P1-T18 | Super Admin platform operations | Can change another company's status; cannot read arbitrary tenant prompts or suspend own company. |
| P1-T19 | Mongo unavailable | Explicit unavailable state; no new JSON file or fallback write. |
| P1-T20 | Narrow screen and keyboard-only CRUD | No page overflow; usable dialog focus, errors, save, and cancel. |

Run frontend lint/build and focused backend tests. Record browser screenshots or observations at the three shared viewport sizes. Do not mark Phase 1 complete if known critical security cases fail.

## 14. Handoff to Phase 2

Deliver migrations, test fixtures, actual local setup commands, and recorded dependency versions. Confirm these stable boundaries: canonical roles, group IDs, immutable policy versions, encrypted credentials, safe provider interface, server-owned system prompt, tenant-scoped repository methods, transaction-capable MongoDB, ApiError support, and real policy editor.

Use this next-model prompt:

> Implement Phase 1 from `docs/implementation/PHASE_1_SECURE_ADMINISTRATION.md` after reading `docs/implementation/README.md`. Work through P1-01 to P1-06, preserving existing code where useful. Start with security and data contracts, connect each workflow to the UI, and execute P1-T01 through P1-T20. Do not implement deployment or claim prompt enforcement exists. Track actual progress in `docs/implementation/PROGRESS.md`, including migration state and failed/unavailable checks. Finish the phase with a concise handoff listing implemented behavior and remaining blockers.
