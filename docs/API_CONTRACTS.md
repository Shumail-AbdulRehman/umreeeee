# API contracts (local build)

The generated, version-matched route schema is available at `/openapi.json` and `/docs` while the API is running. All resources below use authenticated Bearer JWTs; the server derives tenant and role from current database state, not client-supplied IDs. Errors use the safe `detail` envelope with a code and message; validation errors may include field information. Unauthorized is 401, insufficient role 403, and other-tenant resource IDs are 404.

The ordinary prompt route is `POST /api/prompt-workspace/run` with a UUID `Idempotency-Key`. It uses protected input/output evaluation; no public raw or system-override route exists. Run history/detail, violations, notifications, and analytics exclude Red Team source by default. Red Team's dedicated APIs require `org_admin` or `super_admin` in the same active organization.

| Red Team route | Contract |
|---|---|
| `GET /api/red-team/capabilities` | Promptfoo runtime readiness, 24-plugin/15-strategy metadata, nine framework mappings, limits, supported providers and broker/worker hints. No connection secrets. |
| `POST /api/red-team/config-preview` | Validates an unsaved `TestConfig` and returns redacted Promptfoo YAML plus generated-test and target-call estimates. For a suite-backed draft, pass its ID as `test_id` so the preview uses the stored suite. |
| `GET /api/red-team/tests` | Real pagination and `q`, `status`, `mode`, `integration_id`, `from`, `to` filters; `{items,page,page_size,total}`. |
| `POST /api/red-team/tests` | Validated Promptfoo draft configuration; 201 `{test}`. No provider call. |
| `GET /api/red-team/tests/{id}` | `{test}` with persisted configuration and `{planned,executed,graded,phase}` progress. |
| `GET /api/red-team/tests/{id}/config-preview` | Redacted Promptfoo YAML for a stored draft. |
| `PUT /api/red-team/tests/{id}` | Draft-only edit with `version`. A stale edit or a change to suite-backed generation settings returns 409. |
| `POST /api/red-team/tests/{id}/launch` | Revalidates the saved version and Promptfoo runtime, freezes a key-free target/grader/policy snapshot, and inserts one `kind: run` outbox job. Send `{version}` and a UUID `Idempotency-Key`; matching retries are idempotent. |
| `POST /api/red-team/tests/{id}/cancel` | Queued work becomes cancelled; generating/running work becomes cancelling so the worker can terminate Promptfoo. |
| `POST /api/red-team/tests/{id}/clone` | 201 new draft in the comparison group; optional `{mode}`; reuses `suite_id` when generation already completed. |
| `GET /api/red-team/tests/{id}/results` | Paginated Promptfoo case summaries; equality filters: `plugin`, `strategy`, `verdict`, `verdict_source`. |
| `GET /api/red-team/tests/{id}/results/{attack_id}` | Decrypted case prompt/reply subject to retention, evidence and the same-suite paired result. |
| `GET /api/red-team/tests/{id}/report` | Promptfoo report with risk, test-case failure rate, plugin/strategy rows, all nine compliance frameworks, paired result and trend. |
| `GET /api/red-team/tests/{id}/export?format=json\|csv` | Safe authorized export; CSV formula-prefix neutralization. |

Create and edit accept `name`, `purpose`, target `integration_id` and `model`,
`mode`, protected `subject_user_id`, 1–20 distinct `plugins`, 0–8 distinct
`strategies` (baseline is implicit), `tests_per_plugin` from 1–10, required
`grader: {integration_id, model}`, and `threshold_score`. Extra keys are rejected.
The target-call estimate may not exceed 200. Target, grader and protected subject
must be active in the same organization. Unsupported Promptfoo providers return
422 `unsupported_provider`. Launch can return 409 `promptfoo_unavailable`,
`policy_required`, `validator_unavailable`, `configuration_unavailable`,
`suite_pending`, `suite_unavailable`, or `suite_config_locked`.

Raw mode calls the configured model through Promptfoo. Protected mode calls the
worker's authenticated loopback bridge and the frozen policy pipeline. Queue
messages contain only version, job ID, test ID and dispatch generation. Stored
suites and API responses contain no integration key, Promptfoo Cloud key or bridge
token. Risk, compliance and threshold remain provisional until a terminal state.
“Test case failure rate” is the fraction of pass/fail cases that failed; errors and
pending rows are excluded. JSON preserves text, while CSV neutralizes formula prefixes.


## Named DLP and Guardrail policies

The imported catalogs at `GET /api/policies` provide the available check IDs. An
organization administrator may create and assign reusable policies through:

| Route | Contract |
|---|---|
| `GET /api/policy-sets?category=dlp\|guardrail&page=1&page_size=50` | Paginated named policies for the tenant and type. |
| `POST /api/policy-sets` | `{category,name,description,selected_entry_ids}`; returns 201 `{policy}` with no assigned groups. |
| `PUT /api/policy-sets/{id}` | `{version,name,description,selected_entry_ids}`; updates checks and metadata for all assigned groups. |
| `PUT /api/policy-sets/{id}/groups` | `{version,group_ids}`; replaces this policy's group assignments without changing its checks. |
| `PATCH /api/policy-sets/{id}/status` | `{version,status}` where status is active, disabled, or archived. Archive clears assignments. |

Only unique IDs from the active matching catalog and active same-tenant groups are
accepted. A stale version returns 409. A policy assigned to no groups is not enforced.
Assigned DLP and Guardrail policies are resolved for authenticated users at input and
output stages, with effective IDs frozen in each run snapshot. Legacy catalog
assignments remain effective until removed through their existing endpoint.

## Earlier group-specific managed policy checks

`PUT /api/policies/{policy_id}/group-selections` requires an organization administrator.
Body: `{ "version": 1, "group_ids": ["ObjectId"], "selected_entry_ids": ["catalog-id"] }`.
Returns `{ "policy": <updated policy>, "message": "Group policy checks saved" }`.
Only the named groups change. An empty selection removes their assignment. Nonempty
selections require active same-tenant groups. Invalid or duplicate IDs return 422;
a stale policy version returns 409; a foreign policy returns 404. Revisions and audits
commit transactionally. The returned `group_entry_selections` array contains each
group's saved IDs; `scope.group_ids` remains the authoritative assignment list.

Runtime checks use the union of the authenticated user's active groups' selections,
without duplicates, and snapshot the effective IDs for the entire run. Older shared
assignments retain their selected IDs until explicitly edited. The legacy `/groups`
endpoint remains compatible; omitting selected_entry_ids preserves group-specific
selections, while supplying it explicitly applies that shared set to the payload's groups.

### Model-call cost metadata

Workspace runs and red-team result records include `estimated_cost_usd` (decimal string or
null), `cost_status`, `cost_source` (`configured`, `litellm`, or null), and `pricing_snapshot`.
Token counts and provider request IDs remain nullable. Automatic pricing applies when no
per-model integration override exists; pricing failures do not fail the request or become
zero-cost calls. See [Model costs](MODEL_COSTS.md) for precedence and accounting semantics.
# Conversation history — 11 October 2026

`GET /api/prompt-workspace/conversations?page=1&page_size=20` returns the current
user's chats as `{items, total, page, page_size}`. Items contain `id`, `title`,
`created_at`, `updated_at`, `message_count`, and `model`, ordered by recent activity.
Titles are derived from the first prompt's encrypted content; expired content gets
the fallback title “Earlier conversation.” No plaintext title is stored separately.

`GET /api/prompt-workspace/conversations/{id}?page=1&page_size=50` returns
`{conversation: {id, title}, items, total, page, page_size, context_note}`. Each page
contains a chronologically ordered slice; page 1 holds the latest messages, and
subsequent pages load earlier messages. Reads and continuations require both tenant
and user ownership, including for administrators. Existing run/activity endpoints
retain their established administrator visibility.

`POST /api/prompt-workspace/run` now accepts optional `conversation_id`. Omit it to
start a chat; use the response's `run.conversation_id` for subsequent messages.
`Idempotency-Key` is still required per submission. Prior allowed, retained workspace
exchanges are loaded by the server, bounded to the most recent 20 exchanges and
24,000 characters, and revalidated under the current policies before dispatch.
Clients cannot supply message history. Concurrent sends into a processing chat are
rejected. Provider adapters translate prior user/assistant turns for all six providers.

The first run ID is the conversation ID; later runs reference it. Earlier runs without
`conversation_id` act as standalone chats and can be continued without a migration.
The new owner/conversation/recent compound index is installed by the existing startup
index process. Red-team jobs continue using their existing execution path.

## Administrator policy group setup

Policy assignment is optional for `org_admin` and `super_admin` in Prompt Studio.
They can send messages with no applicable input policy even when the organization
requires policies for employees. Assigned policies are still evaluated and enforced,
including output-only policies and detector errors. The exemption uses the current
database role, which is checked again before provider dispatch. It does not change
the organization's policy requirement or protected Red Team snapshot semantics.

- `GET /api/users/me/groups`: admin-only, returns the current account's safe managed
  user record under `user`, including `group_ids` and optimistic-lock `version`.
- `PATCH /api/users/me/groups`: admin-only, accepts exactly `group_ids` (up to 32)
  and `version`. Validates active groups in the current tenant, updates only the
  caller's memberships, increments the user version, and records `user.groups_updated`.
  Rejects duplicate/invalid groups, foreign or archived groups, stale versions, and
  extra fields. Roles, profile data, credentials, and account status cannot be changed.

`GET /api/prompt-workspace/context` reads current memberships from MongoDB and returns
`require_active_policy` (the effective requirement for the current account) plus
`input_policy_coverage`, a map of integration ID to whether an applicable input policy
exists. Admin accounts receive `require_active_policy: false`; the UI allows sending
and explains that assignments are optional. Regular users without required coverage
are paused until their administrator assigns a policy. Users → My policy groups
remains available for admins who want group policies applied to their messages.
