# Phase 2 — Policy Enforcement and Real Observability

Read [the shared contracts](README.md) and the Phase 1 completion record first. This phase converts configured policies into actual decisions and replaces demonstration analytics with persisted evidence.

## 1. Preconditions and completion target

Required Phase 1 capabilities: canonical roles, secure tenant admission, stable group IDs, policy revisions, encrypted integration keys, server-owned system instructions, a testable provider boundary, transaction-capable MongoDB, and the structured frontend ApiError.

Do not start with a redesigned dashboard. Deliver one vertical slice first: an administrator creates an input BLOCK policy; a matching prompt returns a persisted blocked run; the provider fake records zero calls; the administrator opens its violation detail. Then generalize to all actions, output validation, analytics, and remaining screens.

Phase 2 completes when every ordinary prompt path uses the same enforcement service, recorded outcomes are trustworthy, users only see authorized content, and analytics reconcile with source records.

## 2. Ordered work packages

| ID | Work | Checkpoint |
|---|---|---|
| P2-01 | Provider boundary, validator capability spike, run schema | One provider fake and one Guardrails-backed keyword rule execute with explicit results. |
| P2-02 | Input scope resolution, actions, idempotency, blocked-run persistence | The first BLOCK/LOG/ALERT workflow is complete. |
| P2-03 | Output inspection, semantic validators, failures, content handling | No blocked or unevaluated output is released. |
| P2-04 | Violations, notifications, administrative review | Real incidents and alerts are navigable and auditable. |
| P2-05 | Aggregations, prices, history, all observability pages | Dashboard data comes from tenant-scoped records. |
| P2-06 | Dataset evaluation, load measurement, integration/UI verification | Actual measurements and passing behavior checks are recorded. |

## 3. File map

### Existing files to extend

- `backend/app/services/prompt_workspace_service.py`: orchestrate the single protected execution path; stop directly dispatching around enforcement.
- `backend/app/models/prompt_run.py`, `schemas/prompts.py`, `repositories/prompt_run_repository.py`: new execution/evaluation/content contracts and pagination.
- `backend/app/services/dashboard_service.py`, `api/routes/dashboard.py`: replace static JSON loader with real aggregations.
- `backend/app/api/routes/prompts.py`: new HTTP outcome mapping, idempotency header, detail route.
- `backend/app/services/policy_service.py`: Phase 2 capability checks and preview evaluation.
- `backend/app/db/indexes.py`, `core/config.py`, `api/router.py`, `api/dependencies/services.py`.
- `Frontend/src/pages/PromptStudioPage.jsx`, `InsightsPage.jsx`, `ViolationsPage.jsx`, `ActivityLogPage.jsx`, `CatalogPage.jsx`, `LatencyPage.jsx`, `SpendPage.jsx`, `PoliciesPage.jsx`, `SettingsPage.jsx`.
- `Frontend/src/hooks/useDashboardData.js`, provider/prompt/dashboard service clients, shared chart and activity components.

### New backend modules

- `services/enforcement_service.py`: policy selection, stage evaluation, action decisions.
- `services/provider_service.py` and `providers/{base,openai_compatible,anthropic,gemini,ollama}.py`: move existing transport logic behind one normalized interface; do not duplicate it.
- `validators/{base,registry,keyword,regex,pii,prompt_injection,toxicity}.py`: bounded, versioned validator implementations and Guardrails wrappers.
- `models/violation.py`, `notification.py`; corresponding schemas, repositories, services, and routes.
- `services/analytics_service.py`, `cost_service.py`, `content_service.py`.
- `schemas/analytics.py`; `api/routes/analytics.py`, `violations.py`, `notifications.py`.
- `scripts/migrate_phase2.py`, `scripts/expire_content.py`, `scripts/reconcile_interrupted_runs.py`, `scripts/evaluate_guardrails.py`.
- `tests/fixtures/enforcement_cases.json`, `tests/benchmarks/locustfile.py`, focused unit/integration tests.
- `docs/VALIDATORS.md`, `docs/EVALUATION_RESULTS.md` created during implementation.

### New frontend modules

- `services/violations/violationService.js`, `services/notifications/notificationService.js`, `services/analytics/analyticsService.js`.
- `components/prompts/RunDetail.jsx`, `EvaluationSummary.jsx`, `components/violations/ViolationDetail.jsx`.
- `components/DateRangeFilter.jsx`, `components/notifications/NotificationPanel.jsx`.
- Browser tests for prompt decisions, history visibility, filters, and incident review.

## 4. Provider boundary

Define a provider request containing integration configuration resolved server-side, selected model, ordered messages, temperature, max output tokens, and a request ID. Plaintext credentials exist only briefly inside the provider service; they must not appear in repr/logs/test snapshots.

Normalized provider result: `response_text`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `provider_request_id`, `finish_reason`, `provider_latency_ms`. Usage may be null. A provider request ID is not a database ID. Do not preserve the entire raw provider payload in prompt history.

Normalized errors: `authentication`, `rate_limited`, `timeout`, `unavailable`, `invalid_model`, `invalid_response`, `unknown`; include safe message, provider status, retryable flag, and optional bounded Retry-After. Do not forward raw provider errors directly.

Reuse the six existing providers. Preserve whitespace in prompts and system instructions. Use the provider's actual system-instruction field; do not continue Gemini's current approach of concatenating “System instruction” into ordinary user text. Verify request formats against each provider's current official documentation during implementation. Do not assume every model accepts temperature or the same max-token parameter. Unsupported model capabilities must produce a useful configuration error.

HTTP calls must have bounded connection/read/overall behavior and response-size limits. Prefer one reusable client implementation over inconsistent `urlopen` exception handling. If introducing httpx, pin and test it. Do not silently retry ordinary prompt provider calls: a timeout can occur after the provider has already generated/billed a response.

## 5. Validator implementation contract

### 5.1 Capability spike before broad integration

Install a compatible stable `guardrails-ai` release and document exact versions. Prove a minimal custom validator returns a known pass and a known fail through the actual installed Guardrails API. Do not assume report-era RAIL examples or Hub validator names still work.

Use Guardrails custom validators for deterministic checks and wrap the selected local semantic detectors behind the same application contract. Keep the application responsible for BLOCK/LOG/ALERT. Configure validation to report results without automatic reasking, rewriting, repair, or hidden provider calls. Explicitly disable remote validation/telemetry paths that would send prompt text unless separately authorized. A validator exception is an engine failure, not automatically a detected policy violation. [Guardrails custom-validator implementation reference](https://github.com/guardrails-ai/guardrails/blob/main/guardrails/validator_base.py).

Registry entry: `type`, `implementation_version`, `config_schema`, `supported_stages`, `ready`, `unavailable_reason`, `max_input_size`, `runtime_budget_ms`, and model revision when applicable.

Bound total work as well as each rule: initially allow at most 50 applicable policies/500 rules per request, with a configurable 5-second validation budget per stage and a bounded inference queue. Refuse an oversized applicable configuration or exceeded deadline with an explicit validation error, not a partial pass. These execution ceilings are safety limits, not the 200 ms latency target. Expose the effective limits in admin capability information.

An evaluation result is `{rule_id, type, outcome, score, threshold, reason_code, evidence, duration_ms, implementation_version}` where outcome is `pass|match|error`. Evidence includes entity type, count, and character offsets where meaningful, never raw matched sensitive strings. Failure reasons distinguish timeout, missing model, invalid configuration, and runtime exception.

### 5.2 Deterministic validators

- Keyword: implement substring and whole-word modes with documented Unicode/case behavior. Case-insensitive comparison uses casefolding; preserve original text for provider submission. Do not silently normalize away content.
- Regex: use a timeout-capable engine with a 25 ms per-rule budget initially. A timeout yields error; it never yields pass. Bound request text and pattern length. Demonstrate the timeout with a pathological-pattern test.
- PII: implement email patterns, phone patterns using a tested phone parser with an explicitly configured/default region, and credit-card candidates with Luhn validation. Return confidence consistently: use fixed documented confidence for validated deterministic matches, not invented ML certainty. The first version detects those three entity types only. Requests asking for personal data without containing it are not equivalent to PII detection.

### 5.3 Semantic validators

Use local inference with explicit model revisions, label mapping, limits, and recorded licensing/runtime requirements. Starting candidates are [ProtectAI's injection classifier](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) and [Unitary's toxicity classifier](https://huggingface.co/unitary/toxic-bert). These are starting implementation choices, not guaranteed accuracy or performance claims. Verify model cards and dependency compatibility before pinning. The toxicity model card notes differences from Detoxify; record which inference implementation is actually used.

- Injection score: map the model's actual injection class to a 0–1 score; test class polarity with benign and obvious injection examples.
- Toxicity score: use the maximum of explicitly documented harmful-label scores returned by the chosen model; store the label and score. Do not assume the highest-label name always means toxic.
- Threshold defaults come from Phase 1 policy schema but require evaluation; do not advertise calibrated probabilities.
- Load model weights during explicit setup and warm them before declaring ready; never download on a user's first prompt.
- Reuse bounded model instances. Limit inference concurrency and memory; do not create a model per request.
- Handle texts exceeding model context by overlapping token windows, using the maximum score across windows. Reserve tokenizer special-token space, cap window count, and return an explicit validation error if the full text cannot be inspected within configured limits. Never silently truncate and report a pass.
- Wrap inference in a bounded execution mechanism. A thread timeout alone does not terminate computation; bound the worker pool/queue, reject overload, and recycle/terminate a stuck inference process when a hard deadline is required.
- Default execution budget may exceed the 200 ms target on CPU. Measure and report that honestly; the performance target is not permission to skip validation.

Capability readiness is computed from installed, warmed components. Activating a policy requiring an unavailable validator returns 409. If an already active policy becomes unavailable, affected requests fail closed as validation_error; the admin UI remains usable to disable/fix the policy. An unavailable detector is never replaced with a keyword heuristic while keeping its semantic label.

## 6. Policy resolution and decision rules

Within a consistent database snapshot, load the active user/company, real active group IDs, active integration, and applicable immutable policy versions. Apply shared group/integration AND semantics. Snapshot versions at run start and use those same rules for output evaluation even if an administrator edits a policy mid-request. New requests receive new versions.

Input fields evaluated separately: `user_prompt` and the server-owned `system_prompt`. Rules can produce field identifiers in evidence. A user cannot inject a new system message through JSON; extra override fields are rejected. Ordinary requests in this version have no arbitrary retrieval/tool context. Phase 3 supplies synthetic indirect-injection text as test content.

For each stage, evaluate every applicable rule/policy within bounds. Any rule match triggers its containing policy once per stage. Collect all findings to explain multiple matches. A validator error makes that stage incomplete.

| Stage result | Provider/output behavior | Recorded outcome |
|---|---|---|
| One or more BLOCK matches | Input: do not call provider. Output: do not release generated text. | blocked_input or blocked_output; preserve all findings. |
| No BLOCK, any validator error | Input: do not call provider. Output: withhold generated text. | validation_error; not a violation unless a separate rule actually matched. |
| LOG match | Continue if no block/error; record violation. | Allowed run may contain findings. |
| ALERT match | Continue if no block/error; record violation and notify admins. | Allowed run may contain findings/alerts. |
| All applied checks pass | Continue. | Record evaluated policy/rule versions. |
| No applicable input policy and require_active_policy=true | Do not call provider. | configuration_error, code policy_required. |
| No applicable policies and require_active_policy=false | Permit provider call, explicitly mark not_evaluated. | allowed, enforcement coverage none. |

An output-only policy does not satisfy require_active_policy: require at least one applicable input-stage policy. A matching LOG/ALERT policy counts as evaluation, not blocking protection; display actions accurately. An output stage with no configured checks is not_evaluated rather than passed.

BLOCK wins over an error for the HTTP/run outcome when both occur, but `evaluation_complete=false` and the error remain recorded. This preserves a real blocking reason without hiding partial evaluation failure.

## 7. Execution and persistence sequence

The HTTP endpoint remains POST `/api/prompt-workspace/run`.

1. Authenticate; verify active user/company. Validate body and UUID `Idempotency-Key` header. Reject stale/inactive integration or disabled model. These admission failures return normal errors without creating an execution record.
2. Compute a canonical hash of client execution inputs (integration, model, prompt, generation settings); do not include changing server policy state. Atomically create a `processing` run with unique `(company_id, user_id, idempotency_key)` and policy/context snapshot.
3. Existing key + same input: return the existing safe result; if still processing, return 202 with run ID and polling location. Existing key + different input: 409. Never call the provider twice just because the browser retries.
4. Resolve required policy configuration and evaluate input. Persist input evaluations, any violations, notifications, and an input-block/error terminal status in one transaction. For an allowed input, save its evaluation before the external call.
5. If persistence fails, return 503 and do not call provider. If the run is already durable but nonterminal, reconciliation will mark it interrupted rather than resubmit it.
6. Recheck user/company/integration activation immediately before the call. If no longer usable, terminate with configuration_error. The policy version snapshot remains fixed; membership changes affect subsequent runs.
7. Call provider once outside a database transaction. Capture timing and nullable usage. If it fails, save provider_error and any input findings; return a safe provider failure response.
8. Evaluate output against the snapshot. Do not stream or return any output text before this step completes.
9. Atomically finalize run, output evaluations, violations, notifications, cost snapshot, timestamps, and permitted encrypted content. Only after a successful commit may the API return allowed output.
10. If saving after the provider call fails, return 503 without output. Never automatically replay the provider call. A stale processing run becomes interrupted with “Execution outcome could not be confirmed”; generation may have incurred cost.

Use monotonic clocks for durations and UTC wall-clock timestamps for records. Keep `enforcement_latency_ms` (input+output checks) separate from `provider_latency_ms` and `total_latency_ms`. Persist enough phase/heartbeat timestamps to diagnose interrupted execution.

Reconcile stale processing runs at startup and with an explicit script, using a grace period greater than the maximum provider+validator execution budget. This script only marks stale state; it never reruns a prompt. Atomic conditional updates must not overwrite a currently finalized run.

## 8. Data contracts

### 8.1 prompt_runs

Retain identifiers and immutable display snapshots of user name/email, integration name, provider, and model. Add:

- `source`: `workspace` for this phase; legacy migration uses `legacy`. Phase 3 protected tests use `red_team`.
- `status`: `processing|allowed|blocked_input|blocked_output|provider_error|validation_error|configuration_error|interrupted|legacy_completed|legacy_failed`.
- `idempotency_key`, `input_fingerprint`, `started_at`, `finished_at`, `execution_phase`, `heartbeat_at`.
- `group_ids_snapshot`, `policy_snapshots` or complete immutable version references plus retained snapshots needed for audit.
- `input_evaluation` and `output_evaluation`: stage state, evaluation_complete, rule results, matched policy IDs, checked-field identifiers, timing, and capability versions.
- `input_length`, `output_length`, `response_withheld`, `content_expires_at`, `content_expired`.
- `prompt_ciphertext`, `system_prompt_ciphertext`, `response_ciphertext` where permitted; no raw text fields for new records.
- `prompt_tokens`, `completion_tokens`, `total_tokens`, `provider_request_id`, `finish_reason`.
- `estimated_cost_usd`, `cost_status` (`known|partial|unknown|not_incurred`), `pricing_snapshot`; usage errors remain unknown, not zero.
- `enforcement_latency_ms`, `provider_latency_ms`, `total_latency_ms`, `error_code`, sanitized `error_message`.

Legacy provider latency was not enforcement latency. Preserve it as legacy total/provider observation with explicit provenance; do not backfill a fictional enforcement duration.

### 8.2 violations

Fields: `_id`, `company_id`, `run_id`, `source`, `user_id`, `policy_id`, `policy_version`, policy name snapshot, category, severity, action, stage, safe findings, `resolution_status` (`open|reviewed|resolved`), `resolution_note` (max 2000), `resolved_by`, `resolved_at`, `version`, `created_at`, `updated_at`.

Unique key: `(company_id, run_id, policy_id, stage)`. Multiple matching rules in the same policy/stage are findings in one violation. A validator error alone creates no fake violation. For LOG records, use policy severity rather than silently rewriting severity; action and severity are separate concepts.

### 8.3 notifications

Fields: `_id`, `company_id`, `recipient_user_id`, `event_key`, `kind` (`policy_alert` initially), `title`, safe summary, `resource_type`, `resource_id`, `created_at`, `read_at`.

One notification per active admin recipient/event, enforced by unique `(company_id, recipient_user_id, event_key)`. Generate safe titles without prompt text. Recheck permissions when opening the linked resource. Phase 3 reuses this for red_team_threshold events. Reading a notification updates only the requesting recipient's record.

### 8.4 Content confidentiality and retention

Use a dedicated `CONTENT_ENCRYPTION_KEY`, not the JWT or provider-key encryption key. Store input/system text encrypted for run detail and allowed output encrypted for history. Never store ordinary blocked-output plaintext or ciphertext; keep only length/hash and safe findings. Record `response_withheld=true` for blocked output or output validation error. Do not accidentally serialize provider text through error objects or debug logs.

List/analytics responses contain metadata and lengths, not plaintext prompts. Detail decrypts input and released output only for the run owner or own-company administrator. Expired content returns null plus a clear expired flag. No ordinary endpoint can reveal a withheld response, including admin/export endpoints.

Default text retention is 7 days. `expire_content.py` unsets only expired content ciphertext fields and marks expiration, retaining IDs, metadata, evaluations, and counts. Read endpoints enforce expiration immediately; cleanup delay does not grant access. Decreasing the setting applies to existing unexpired records and can only shorten their expiry; increasing it applies to future records and cannot restore removed content. Explain this consequence before saving Settings. Never use a TTL index on prompt_runs to delete the entire audit record.

Red-team raw outputs are a separate administrator-only synthetic-test dataset defined in Phase 3, not a bypass for ordinary blocked-response disclosure.

## 9. HTTP and UI contracts

Request body: `{integration_id, model, prompt, temperature, max_tokens}`. Keep the existing text/generation bounds unless the selected validator has a lower supported limit, which must be returned by workspace context. Remove selected_groups and system_prompt authority from this ordinary request. A migration period may accept empty legacy fields, but reject nonempty overrides and remove compatibility before phase completion.

| Endpoint | Result/access |
|---|---|
| GET `/api/prompt-workspace/context` | Active eligible integrations/models, server-managed system-instruction indicator, actual group summaries, readiness, supported input limits. No secret keys or full private policy rules for regular users. |
| POST `/api/prompt-workspace/run` | 200 `{run}` allowed; 403 blocked; 409 policy_required/idempotency conflict; 502 provider failure (504 timeout); 503 validation/persistence unavailable. Persisted-run errors include safe `{detail, run}`. |
| GET `/api/prompt-workspace/runs` | Paginated metadata, own records or own-company admin records; status/model/provider/from/to filters. Default source workspace plus explicitly labeled legacy history, never red_team. |
| GET `/api/prompt-workspace/runs/{id}` | Safe detail/content authorization; 404 cross-tenant or another regular user's run. A regular user cannot access source red_team even when they are the recorded policy-context user. |
| POST `/api/policies/{id}/test` | Admin-only sample text/stage; evaluate only that policy without provider call, normal usage count, or raw sample persistence. Return truthful preview; rate/size limits apply. |
| GET `/api/violations` | Admin organization list; regular user may list only own violations with safe reasons. Paginated filters: severity/action/category/status/from/to. |
| GET `/api/violations/{id}` | Same visibility restriction; full config snapshot admin-only. |
| PATCH `/api/violations/{id}/resolution` | Admin; `{resolution_status, note, version}`; update and audit transactionally. |
| GET `/api/notifications` | Recipient only, paginated, optional unread filter. |
| PATCH `/api/notifications/{id}/read` | Recipient only; idempotently set read_at. |
| GET `/api/analytics/summary` | Tenant/owner scoped summary described below. |
| GET `/api/analytics/series` | UTC day/hour buckets, same scope/filter definitions. |
| GET `/api/analytics/models` | Per-provider/model counts, known usage/cost, latency. |
| GET `/api/dashboard` | Composition of real summary/series/model data; remove file-based mock loading. |

Add domain filters `user_id`/`group_id` only for admins. A regular user's attempt to supply another user's filter returns 403 rather than overriding the owner restriction. Validate filters once and reuse them across all aggregate sections.

## 10. Analytics definitions

Default date range is the last 7 UTC days through now, limited to a maximum 90-day query window initially. Frontend sends actual ISO bounds and labels the displayed local interval. Each response echoes filters, timezone, generated_at, and excluded/unknown counts.

| Metric | Definition |
|---|---|
| Total submissions | Count of workspace runs admitted in the interval, including processing and execution failures. |
| Allowed | Runs with status allowed; this does not mean every possible attack was ruled out. |
| Blocked | blocked_input + blocked_output. |
| Errors | provider_error + validation_error + configuration_error + interrupted. Show categories separately in detail. |
| Violation events | Number of distinct violation documents. |
| Runs with violations | Distinct runs with one or more matched policies. |
| Violation rate | Terminal workspace runs with any matched policy / terminal workspace runs with at least one completed rule evaluation; null if denominator zero. Include partial-evaluation indicator/error counts. |
| Evaluation coverage | Terminal runs with at least one completed rule evaluation / all terminal workspace runs. Show fully evaluated count separately. |
| Token usage | Sum known token fields; report unknown-usage run count. |
| Estimated spend | Sum known calculated amounts, labeled partial when any possibly billable run lacks usage/pricing. Input-blocked runs incur zero provider cost. |
| Latency | p50/p95/p99 over non-null observations, separating provider, enforcement, total; report sample count. |

Default ordinary analytics excludes `source=red_team` and legacy records from security-rate denominators. Show a separate legacy-history count rather than interpreting old completed runs as evaluated/allowed. Group analytics uses captured historical group IDs; membership edits must not rewrite prior attribution.

Compute percentiles using supported database operators or a documented bounded calculation. For a deterministic test definition use nearest-rank: sorted values, rank `ceil(p*n)`, 1-indexed. Do not mix this with an approximate database method without labeling/testing the difference. Use database aggregation and indexes for filtering, grouping, and pagination; avoid reading the whole collection on each dashboard request.

Cost formula: `(input_tokens * input_price + output_tokens * output_price) / 1_000_000` using Decimal. Store exact price/model/effective_at used. Missing components produce partial/unknown status. Changing configured prices affects future calculations, not old run records. Do not query current online prices on every prompt or invent prices from model names.

## 11. Frontend work by page

### Prompt Studio

- Select active integration/model; show actual memberships as read-only chips.
- Show enforcement readiness and applicable action summary without claiming guaranteed security.
- Generate one UUID idempotency key when submitting; preserve it for a retry of the same uncertain submission. A deliberate new run gets a new key.
- On 202, poll the returned run ID with a bounded interval until terminal; avoid re-POSTing.
- Handle blocked errors through ApiError.run, inserting the persisted run into history even when HTTP is not 2xx.
- Result panel uses explicit status, readable policy reasons, input/output stages, token/cost availability, and separated timings.
- Withheld response panel contains no model content or copy button. Provider/validator failures have different labels and guidance.
- History uses server pagination and opens detail by ID; never infer organization totals from the latest 20 runs.

### Policies

Remove the Phase 1 enforcement-not-enabled notice when backend readiness is true. Add a “Test policy” panel with input/output stage selector and sample text. Test results show matched rules and actual capability version. Do not save samples by default. Unavailable detectors prevent activation and explain setup requirements.

### Insights and charts

Replace hardcoded incident banners, risk scores, compliance donut, and all mock dataset imports. Prioritize four truthful metrics (submissions, blocked runs, violation rate with denominator, estimated spend), a volume/outcome chart, top violation categories, and recent activity.

Reuse SVG chart primitives where adequate. Add actual labels, legends, keyboard-readable values/table alternatives, and empty/one-point states. Interactive labels must have real drill-down/filter behavior. Do not add a chart library solely to reproduce existing simple charts.

### Activity Log and Violations

Activity rows show time, authorized user label, provider/model, result, tokens, estimated cost, and detail action. Counts and pagination come from the server. Admins can filter users; regular users cannot enumerate colleagues.

Violation list shows severity, category, policy, action, stage, user, time, resolution. Detail links to safe run information. Resolution form preserves notes on failure, handles stale version conflicts, and records actor/time. Regular users can view their own safe decision explanations but cannot resolve incidents.

### Catalog, Latency, Spend, Settings, notifications

- Catalog lists actually configured active integrations/models with observed usage; no fabricated healthy/SLO status.
- Latency shows real sample counts and separated timing percentiles; models without samples show no data.
- Spend shows known/partial estimates and unknown usage counts; admins edit per-model price estimates through integration settings. No budget progress bars without a budget feature.
- Settings exposes implemented retention and require-policy behavior, with consequences explained.
- Notification panel polls every 15 seconds while authenticated and visible; cancel polling on logout/unmount, pause when hidden, and back off on errors. Marking read updates the recipient's record.
- Filter state belongs in hash query parameters so drill-downs survive refresh/back navigation. Avoid triggering unrelated create-modal flags for every page.

## 12. Indexes and migration

Add prompt indexes `(company_id, source, created_at DESC, _id DESC)`, `(company_id, user_id, source, created_at DESC)`, `(company_id, status, created_at DESC)`, and unique `(company_id, user_id, idempotency_key)` with a partial index restricted to records that have a key. Add group/model indexes only when the actual query needs them.

Violations: unique run/policy/stage key plus `(company_id, resolution_status, created_at DESC)`, `(company_id, user_id, created_at DESC)`. Notifications: unique recipient/event key plus `(company_id, recipient_user_id, read_at, created_at DESC)`. Content expiry cleanup: normal index on content_expires_at, not TTL on the whole run.

Phase 2 migration defaults to dry-run, is resumable, and only transforms existing records. Preserve old completed/failed as legacy_completed/legacy_failed with source legacy; do not invent policies, violations, prices, or usage. Encrypt retained legacy prompt/system/response text using the content key and remove old plaintext fields atomically per record; respect retention, so already expired text is removed rather than reintroduced. Report intended content deletion counts before apply. Do not reset all old timestamps to migration time. Re-running does not extend retention or re-encrypt unchanged content unnecessarily.

## 13. Acceptance tests and measurement

| ID | Case | Expected evidence |
|---|---|---|
| P2-T01 | Input BLOCK keyword match | 403 blocked_input; provider call count 0; run + violation persisted. |
| P2-T02 | LOG and ALERT matches | Response allowed; correct violation records; ALERT notification created once per admin. |
| P2-T03 | BLOCK + LOG + validator error | Blocked outcome with all available findings and incomplete-evaluation indicator. |
| P2-T04 | Group/integration scope combinations | Empty/list AND semantics match contract; no duplicated policy evaluation. |
| P2-T05 | Forged selected groups/system override | Rejected/ignored only as documented migration compatibility; cannot reduce protection. |
| P2-T06 | Output BLOCK | Provider called once; response content absent from API, history, logs, notifications, and exports. |
| P2-T07 | Missing/timeout semantic validator | validation_error; no unchecked output released; no false pass/violation. |
| P2-T08 | Missing active input policy | Configuration error when required; explicit not_evaluated when allowed by settings. |
| P2-T09 | Duplicate concurrent idempotency key | One provider call; same run returned/polled; different input is 409. |
| P2-T10 | Provider 401/429/timeout/invalid JSON | Safe error type, usage unknown where appropriate, no raw credentials/body. |
| P2-T11 | DB failure before/after provider call | No early call before persistence; no automatic replay after uncertain call; interrupted reconciliation. |
| P2-T12 | Policy edit during provider call | Output uses captured version; next request uses updated version. |
| P2-T13 | PII, regex pathological input, classifier polarity | Known examples match correctly; deadlines enforced; full input coverage recorded. |
| P2-T14 | Retention expiry/decreased window | Text access expires immediately; cleanup removes ciphertext only; counts/history metadata remain. |
| P2-T15 | Other tenant/user detail and filters | 404/403 according to contract; no prompt or colleague data exposure. |
| P2-T16 | Fixture-based dashboard reconciliation | Exact counts, denominator, zero/null handling, decimal costs, percentile samples. |
| P2-T17 | Duplicate findings/repeated notification processing | Unique violation/notification keys prevent inflated counts. |
| P2-T18 | Stale violation resolution version | 409; no lost update; successful change produces audit event. |
| P2-T19 | Empty, one-point, large history UI | Truthful states, readable charts, working server pagination/filter links. |
| P2-T20 | Unauthorized archived model/integration | No provider call; UI updates context with actionable explanation. |

Create at least 100 labeled cases: 20 compliant controls, 20 PII-containing prompts, 20 direct-injection attempts, 20 jailbreak/instruction-bypass attempts, and 20 harmful-content examples. Use synthetic data and record source/license where adapting public examples. Keep a small tuning set separate from the reported evaluation set; do not tune thresholds on the same examples used to claim performance.

Report per-category true positives/false negatives and compliant false positives, precision/recall where defined, total accuracy, dataset version, thresholds, model revisions, and limitations. A 20-example clean control group does not establish a universal zero false-positive rate. Include output cases separately so input and output performance are not conflated.

For latency, run a mocked-provider benchmark and a validator-only benchmark at 1, 10, and 50 concurrent users after warm-up. Use a representative declared policy mix and prompt lengths, fixed duration/arrival pattern, known machine specs, bounded inference concurrency, and actual p50/p95/p99 plus error rate. Compare enforcement latency to the report's 200 ms target at 50 users, explicitly defining whether the target is mean or p95; use p95 as the phase target. Record misses without disabling slow checks to manufacture a pass. Real provider network latency belongs in a separate opt-in smoke check.

The phase is functionally complete only when P2-T01–T20 pass. Performance misses must be documented and addressed where feasible; do not advertise the NFR as met unless measurements support it. A limited detector's accuracy must be described honestly even when all integration tests pass.

## 14. Handoff to Phase 3

Publish the internal callable boundary `execute_protected(context, request, execution_identity)` for worker reuse. It accepts server-constructed tenant/user identity, immutable policy snapshot when supplied by a trusted internal caller, source, and a unique execution key. This is not a public bypass flag. Ordinary HTTP routes always construct source workspace and resolve current policies themselves.

Phase 3 can call the provider service directly for explicitly authorized raw-model tests, or the protected service with source red_team. Both use the same adapters. Include validators, policy versions, dataset, actual measured results, and known hardware/runtime limitations in PROGRESS.md.

> Implement Phase 2 from `docs/implementation/PHASE_2_ENFORCEMENT_OBSERVABILITY.md` and the shared README, after verifying Phase 1 prerequisites. Work through P2-01 to P2-06. First prove a BLOCK policy prevents the provider call and produces a real UI-visible violation. Implement output withholding, honest failure states, idempotency, protected history, and real aggregations. Remove mock data from included flows. Run P2-T01 through P2-T20 and record actual detector/latency measurements. Do not implement deployment, invent passing results, or route ordinary prompts around enforcement.
