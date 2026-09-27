# Remaining Work — Three-Phase App Completion Plan

Date: 23 September 2026

Detailed implementation handoffs: read [the shared implementation contracts](docs/implementation/README.md), then [Phase 1](docs/implementation/PHASE_1_SECURE_ADMINISTRATION.md), [Phase 2](docs/implementation/PHASE_2_ENFORCEMENT_OBSERVABILITY.md), and [Phase 3](docs/implementation/PHASE_3_RED_TEAM_COMPLETION.md). Each includes ordered work packages, file targets, data/API contracts, UI behavior, and acceptance tests.

## Objective

Complete the LLM Security and Policy Enforcement Platform as quickly as practical, with a consistent, usable interface and verified application behavior. Extend the existing React/FastAPI application rather than rebuilding it.

Deployment is excluded from all three phases. Docker, production hosting, infrastructure provisioning, and deployment automation are not part of this plan.

## Starting point

The repository already contains authentication, verification and password recovery flows, employee invitations and management, provider integration management, model discovery, and Prompt Studio with persisted execution history. These implementations need fixes and verification, but should be reused.

The remaining core work is secure organization access, real group and policy management, prompt enforcement, real analytics and violations, and automated red teaming. Most observability screens currently display demo data. Group definitions currently live in browser storage, and integration policy names are labels rather than enforced rules.

“Complete” below means implemented, connected to the UI, and verified—not merely a finished screen or an API endpoint.

## Phase overview

| Phase | Focus | Usable outcome |
|---|---|---|
| 1 | Secure foundation, groups, and policy management | An administrator can safely manage an organization, employees, groups, integrations, and real policies through a consistent UI. |
| 2 | Enforcement, violations, and real analytics | Employee prompts are evaluated against policies, decisions are recorded, and the dashboard shows actual activity. |
| 3 | Red teaming, final UI polish, and full workflow verification | Administrators can run adversarial evaluations and review results; all included application workflows are ready for demonstration. |

Execute phases in order. Within each phase, define the API contract first, then implement backend and frontend work together. Complete each phase's acceptance checks before treating it as finished.

## Phase 1 — Secure Foundation and Real Administration

### Goal

Make the existing administration workflows trustworthy and replace browser-only groups and demo policy selections with real organization-owned data.

### 1. Fix critical account and data issues

- Prevent public signup from joining an existing company as a manager simply by matching its name. Joining an existing organization must require an invitation or authorized membership action.
- Stop returning verification and password-reset codes in API responses. Show a recoverable delivery error when email fails; any local development helper must be explicitly enabled and unavailable in normal operation.
- Encrypt provider API keys at rest using a dedicated encryption key. Define how existing plaintext integration records are migrated if any exist.
- Invalidate existing sessions after password reset and ensure authenticated users have an active account.
- Add bounded abuse protection to login and account-recovery endpoints, preserving the existing code expiry and attempt limits.
- Require authentication and tenant scoping for application data endpoints, including the dashboard.
- Make database mode explicit. MongoDB failures must not silently move application writes to a different data store; an explicitly selected local development mode may remain.
- Return controlled validation errors for malformed record IDs rather than unhandled server errors.

### 2. Complete roles and employee management

- Define server-enforced permissions for Organization Admin and Regular User. Map the current Manager role to Organization Admin consistently across backend and UI.
- Include the report's Super Admin role with minimal explicit platform authority and server checks. Keep tenant administration central to the first release; do not build an unrelated platform-management dashboard.
- Validate role values instead of accepting arbitrary strings.
- Complete invitation acceptance and add resend-invitation support for expired or undelivered invitations.
- Support account deactivation/reactivation so historical activity remains attributable. Prevent removal or demotion of the last active organization administrator.
- Verify that regular users cannot perform administration actions by calling APIs directly.

### 3. Move groups into the backend

- Add organization-owned group models, schemas, repositories, services, and CRUD endpoints.
- Use stable group IDs for employee membership and policy assignments.
- Connect Inventory and employee group selectors to these endpoints.
- Validate that assigned groups belong to the current organization.
- Define safe rename and deletion behavior for groups with members or policies.
- Replace the shared browser-storage source of truth. If existing local groups need importing, make the import an explicit action for the current organization.

### 4. Build real policy management

- Add policy CRUD with name, description, category, enabled/disabled status, scope, action mode, and validated rule configuration.
- Support BLOCK, LOG, and ALERT actions.
- Support organization-wide policies and group/integration scopes with documented matching behavior.
- Start with a bounded rule builder for keywords, regular expressions, PII detection, and supported injection/toxicity validators. Do not add an unrestricted executable rule language.
- Validate rule configuration when saving and show field-specific errors.
- Store policy assignments by ID rather than by display name.
- Replace the demo policy list and inactive Edit button with real list, create, edit, enable/disable, and archive interactions.
- Replace integration policy dropdowns with real policies. Preserve historical references when a policy or integration is archived.
- Record administrative changes with actor, organization, action, timestamp, and target record, without logging credentials.

### 5. Improve the administration UI

- Reuse the current shell, forms, tables, and styling; standardize spacing, typography, controls, and feedback rather than redesigning every page.
- Use clear navigation labels for Users, Groups, Policies, Integrations, and Prompt Studio.
- Provide loading, empty, success, validation-error, and request-failure states.
- Ensure tables and forms work on a small laptop and narrow screens.
- Add accessible labels, visible focus, keyboard-operable dialogs, and understandable destructive-action confirmation.
- Fix provider setup inconsistencies, including allowing Ollama configuration without a provider API key and configuring its base URL rather than hardcoding localhost.
- Until Phase 2 is complete, explicitly label policies as configured but not yet enforced; remove misleading protection claims.

### Phase 1 acceptance checks

- Two organizations remain isolated across users, groups, policies, and integrations.
- Registering with another organization's name cannot grant access to it.
- Invitation, verification, login, password recovery, and account deactivation behave correctly, including email-delivery failure.
- Unauthorized users receive server-side rejection for administrative operations.
- Group and policy changes persist after refresh and appear correctly in another authenticated browser session.
- API responses do not disclose provider keys or recovery codes; stored provider credentials are encrypted.
- Every included administration button performs its intended action and gives clear feedback.

## Phase 2 — Policy Enforcement and Real Observability

### Goal

Deliver the platform's primary security workflow: evaluate a prompt, enforce the decision, record the outcome, and show the real activity to authorized users.

### 1. Add enforcement to Prompt Studio's existing execution path

- Introduce a dedicated enforcement service called before provider execution.
- Resolve applicable policies from the authenticated organization, actual group membership, and selected integration. Client-supplied group tags must not decide authorization or protection.
- Integrate Guardrails AI and a small, verified set of validators. Begin with deterministic rules and PII detection, then add supported prompt-injection and harmful-content checks.
- Define behavior when several policies match: BLOCK takes precedence; LOG records the event; ALERT records the event and creates an in-app notification while permitting the request unless another rule blocks it.
- Define behavior for validator errors and unavailable validation dependencies. Never silently describe an unevaluated request as safe.
- Check both user input and relevant system/context content. Organization-managed instructions must not be freely overridden by regular users.
- Add output inspection for policies intended to govern responses before returning generated content to the user.
- Keep execution states distinct: allowed, blocked at input, blocked at output, provider failure, and validation failure.
- Make provider calls use a consistent result/error interface while reusing existing provider implementations.

### 2. Persist evaluations and violations

- Extend prompt records with evaluation outcome, applicable policy/version references, enforcement duration, provider duration, token usage, and estimated cost where pricing is configured.
- Create violation records with organization, user, prompt-run reference, policy, category, severity, action, timestamp, and resolution status.
- Persist blocked requests even though no provider call occurs.
- Preserve the rule/version used at evaluation time so later policy edits do not rewrite history.
- Define prompt/response retention and redaction behavior. Restrict access to sensitive text; never put provider secrets in audit records.
- Record unavailable token or cost values as unknown rather than presenting invented values.

### 3. Replace demo analytics with real data

- Build tenant-scoped aggregation APIs for prompt volume, allowed/blocked/failed counts, violation categories, model/provider usage, token consumption, estimated cost, and latency.
- Connect Insights, Activity Log, Violations, Spend, Latency, and Catalog to actual records or real integration configuration.
- Add date filters and server-side pagination where histories can grow.
- Provide violation detail and open/reviewed/resolved actions with an audit trail.
- Limit regular-user history and analytics to authorized data; organization administrators can review organization activity.
- Remove mock counters and unsupported compliance/risk scores. Display a score only when its formula and underlying records exist.
- Implement in-app alerts first. Use refresh or polling for prompt updates and alerts; WebSocket delivery is not required for this phase.

### 4. Make security decisions understandable in the UI

- Show whether a prompt was allowed, blocked, or failed, with readable reasons and the relevant policy.
- Distinguish provider errors from policy blocks and validator failures.
- Show input and output evaluation separately when applicable.
- Link dashboard summaries to filtered activity and violation details.
- Make filters, pagination, status controls, and detail views functional.
- Ensure empty organizations show truthful empty states instead of demo incidents.
- Keep dates, status names, costs, and latency units consistent across pages.

### Phase 2 acceptance checks

- A BLOCK rule stops a matching input before any provider call and creates a visible violation record.
- LOG permits execution and records the match; ALERT also creates an in-app alert.
- Group/integration scope is resolved on the server and cannot be bypassed through submitted tags.
- An output policy can prevent a violating generated response from being displayed.
- A compliant prompt returns a provider response and creates an accurate history record.
- Provider or validator failure produces an explicit error state and is not counted as a safe/compliant result.
- Dashboard totals reconcile with stored records and respect organization and user access rules.
- A small labeled dataset covers benign prompts and each supported violation category; record false positives and false negatives rather than claiming unmeasured accuracy.
- Measure enforcement overhead independently of provider latency against the report's 200 ms target at 50 concurrent users. Record the actual result and investigate misses; do not invent a passing benchmark.

## Phase 3 — Red Teaming and Finished App Experience

### Goal

Complete the adversarial testing workflow and verify the entire app as a coherent product suitable for a reliable project demonstration.

### 1. Implement automated red-team runs

- Add organization-owned test configurations with target integration/model, selected attack categories, attack count, compliance threshold, and execution mode.
- Start with a bounded, versioned attack catalog for direct injection, indirect injection context, jailbreaks, synthetic PII extraction attempts, and off-topic policy bypass.
- Use RabbitMQ and a Python worker to queue and execute tests locally, matching the report's architecture. Local broker/worker setup is application development work; production deployment remains excluded.
- Track queued, running, completed, partially failed, failed, and cancelled states.
- Add bounded concurrency, explicit provider rate controls, timeouts, limited retries with backoff, and cancellation handling.
- Make result writes idempotent so redelivered jobs do not inflate counts or duplicate results.
- Restrict execution to administrator-authorized integrations and keep the ordinary user request path separate from direct-model testing.
- Support testing the raw model and the protected platform, clearly identifying the selected mode in stored results and the UI.

### 2. Define evaluation and reporting

- Specify a pass/fail rubric for each attack category and version the evaluator.
- Store the attack, response or error, category, target, execution mode, verdict, reason, and timing.
- Use synthetic sensitive examples; do not require real personal data for evaluation.
- Treat provider errors, timeouts, and inconclusive evaluations separately from safe responses.
- Calculate compliance as passed attacks divided by evaluable attacks. Always show attempted, evaluable, failed, and inconclusive counts alongside the score; show no score when nothing is evaluable.
- Compare raw-model and protected-platform outcomes on the same attack set where possible.
- Provide per-attack details, category summaries, and a threshold-based in-app alert.
- Provide CSV/JSON export and a printable report view. Advanced PDF styling is not a blocker for completing this phase.

### 3. Build the Red Team console

- Provide a clear configuration form with validation and a concise explanation of direct versus protected testing.
- Show live progress through polling, including completed/total jobs, failures, and cancellation status.
- Show score denominators and category results so users understand what the numbers mean.
- Add searchable/filterable results and a detail view for each attack.
- Preserve progress and results across page refreshes.

### 4. Finish and verify the overall UI

- Review the complete journey: signup → verification → invitation → group assignment → integration setup → policy creation → prompt execution → violation review → red-team report.
- Make typography, spacing, buttons, dialogs, tables, badges, and feedback consistent across the existing pages.
- Verify small-laptop and narrow-screen layouts, keyboard navigation, readable contrast, and long-text handling.
- Handle expired sessions, empty datasets, duplicate submissions, stale records, provider failure, database unavailability, and queue/worker failure with clear states.
- Remove remaining demo data and inactive controls from normal app flows. Wire essential settings to real behavior; remove or defer settings that have no implementation.
- Choose one application name and use it consistently in the UI, email messages, and documentation.

### 5. Complete functional verification and documentation

- Add focused automated checks for authorization, tenant isolation, credential handling, policy decisions, evaluation persistence, and red-team job/result behavior.
- Test providers through controlled mock responses, then run a small authorized live smoke test for the providers used in the demonstration. Do not claim every provider works from a single provider test.
- Run frontend lint/build checks and backend tests; resolve failures relevant to the included workflows.
- Verify score calculations, empty evaluations, worker retries, cancellation, and duplicate delivery.
- Record a repeatable manual UI checklist and actual outcomes.
- Add a local development guide covering configuration, database, API, frontend, broker, worker, and demo setup.
- Update the FYP report to reflect implemented features, actual technologies, accurate diagrams, and reproducible test results. Keep unimplemented future features clearly identified.

### Phase 3 acceptance checks

- An administrator can configure, launch, monitor, cancel, and review a red-team test through the UI.
- Jobs produce persistent results; retries and duplicate delivery do not corrupt counts.
- Failed/inconclusive attacks do not improve the compliance score.
- Test records, reports, and exports remain isolated by organization.
- The end-to-end demonstration can be repeated using documented local setup and controlled sample data.
- Included pages contain real data or truthful empty states, with no misleading protection claims or dead primary controls.
- Required functional checks and frontend build/lint checks pass; remaining limitations are documented.

## Rules for keeping delivery fast

1. Reuse the existing application structure and visual foundation. Avoid a framework migration or whole-app rewrite.
2. Deliver complete workflows in small increments: API, persistence, UI, and focused verification together.
3. Prioritize access control and policy correctness before adding dashboard decoration.
4. Prefer polling, a bounded rule builder, and a versioned attack catalog for the first complete implementation.
5. Use existing provider code behind a consistent interface; avoid unnecessary service splitting.
6. Keep tests focused on meaningful security and functional behavior, with manual browser checks for presentation.
7. Treat optional enhancements as follow-up work rather than silently expanding a phase.

## Deferred work

- All deployment and production infrastructure work.
- Redis caching unless measured application performance makes it necessary.
- WebSocket notifications and token streaming.
- Custom-trained classifiers, adaptive attack generation, and research-scale multi-model evaluations.
- Advanced PDF formatting and additional platform administration screens.
- New dashboard metrics without a defined calculation and reliable source data.

## Completion target

At the end of these three phases, the app should demonstrate secure organization administration, real policy enforcement, accurate observability, and automated red-team evaluation through a consistent and usable UI. Deployment remains a separate future effort.
