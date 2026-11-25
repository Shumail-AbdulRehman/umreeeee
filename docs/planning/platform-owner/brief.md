# Averiq platform-owner dashboard proposal

## Original request

> $plan-project  use the plan proejct skill and   analzye this project deeply an di mena it depely eveyt flow and etc and then i wnat you to make a dashboard fromwhere i can as this product owner can manage differnent comapnaies and see what thye are doing and etc so first refine this dashbaord idea and tell me whuch fetures you would include

## Product goal

Give Averiq's product owner a platform-level view of every customer company. In a daily check, the owner should be able to spot who is onboarding, who is using the product, where setup or enforcement is failing, and when a company needs an access change. Each issue should take the owner directly to the relevant company's evidence.

Averiq already has a minimal list and company status control under Settings. Tenant Overview, Users, Integrations, Policies, Activity and Violation review provide organization-level workflows. The platform workspace adds discovery, comparison and support across companies, with its own restricted summaries. [Workflow evidence](../../research/platform-owner.md)

## Recommended first release

| Surface | Features | Operator outcome |
| --- | --- | --- |
| **Platform overview** | Counts for all companies, suspended companies, companies still onboarding, and companies with workspace activity in the selected interval. One activity trend for runs by outcome. A **Needs attention** list with the affected company, issue, recorded time and signal behind it. | See who needs attention before opening individual companies. |
| **Companies directory** | Search by company name or slug. Filter by access state, onboarding state, recent usage and attention condition. Show company name, access status, onboarding, last recorded workspace submission, and relevant run and unresolved-violation counts. Support server-side pagination and sorting. | Find and compare companies across the whole platform, including companies outside the first 20 results. |
| **Company detail** | Show signup date, company status and last workspace activity. Show counts of verified administrators, active accounts, invitations pending or failed, active groups and integrations. Show selected-window submissions, unique submitting users, allowed and blocked runs, provider and validation errors, and unresolved violations by severity. Include DLP and Guardrail setup, applicable input-policy coverage where it can be computed reliably, and observed evaluation coverage. | Diagnose whether a company is blocked on administrator verification, configuration, provider problems, or actual use. |
| **Suspend and reactivate** | Show the affected company, access consequences, and a recorded reason in an accessible confirmation dialog. Reuse the versioned status action and protect the operator's home company. Refresh after success and resolve stale state by reloading the latest version. | Make deliberate, reversible access changes with traceable reasons. |
| **Platform and company activity history** | Filter operator actions by company, event type and date. On the company page, show a limited set of customer milestones such as first-admin verification, integration or policy changes, and violation resolution. Platform status events expose the action, time, platform actor, reason and request ID. | See what changed and when, and give support a reference without reading private tenant content. |

The first attention rules should have plain explanations and next actions. A company without a verified admin is distinct from a company with a failed invitation. An active company with no integration or with required input policy that applies to no eligible users needs setup; a company using an integration with recent provider failures needs investigation. Recent high-severity unresolved violations and companies whose activity has dropped after prior use are also useful signals. Thresholds and minimum sample sizes for trends or repeated failures are product decisions. A brand-new company with no runs should show its onboarding state, without a false inactivity alert.

## The day-to-day flow

1. The owner signs in and opens **Platform overview**. Company operators use their **Organization overview**.
2. The owner opens **Needs attention** and selects a company with a concrete signal such as “No active integration” or “Three high-severity violations still open.”
3. The company detail shows setup, recorded use and recent changes. The owner can identify a next step such as contacting the company's admin or inspecting a platform incident.
4. If access must change, the owner records the reason and confirms the company and status. The updated status and audit entry appear in the company view and directory.

## Metric and access decisions

- Use **access** for the persisted Active or Suspended state. Use **onboarding** for derived setup milestones. Use **workspace activity** for actual recorded prompt submissions. Show a 7-day default window and a 30-day option, with timezone and as-of time.
- Count users who submitted a workspace run in the window separately from currently active accounts. Label last activity **Last workspace submission**. The current app has no observed general-purpose last-login or last-seen metric.
- Indicate configured policies, applicability, and observed evaluation independently. Keep policy blocks separate from errors and distinguish event counts from affected runs. Use current unresolved counts for incident backlog.
- Limit platform visibility to company metadata, aggregate usage and selected audit events. Existing tenant views retain employee activity detail, prompts, responses, findings and provider credentials. Cross-company visibility uses an explicit server-side `super_admin` permission and dedicated read responses.
- Reuse Averiq's current visual language and shared UI primitives. A clearly labeled Platform workspace and persistent company context should make it obvious which scope the owner is viewing. [Design system](../../../DESIGN.md)

## Follow-up features and open decisions

- **Company provisioning.** Start with self-service signup, which is already implemented. If the owner personally brings companies onto Averiq, prioritize **Create company and invite first admin** as the next feature or bring it into the first release for a managed pilot. Include invitation delivery state, retry and duplicate handling.
- **Suspension behavior.** Decide whether reactivation should require a fresh sign-in. The existing company status change blocks access during suspension without rotating all user tokens. Define the treatment of queued jobs, work already running, and external calls already issued.
- **Operations.** Add passive Red Team assessment status, infrastructure health, latency and estimated usage cost when they help answer a support question. Surface evidence quality and timestamps, and keep these signals distinct from ordinary workspace usage and billing.
- Later account features can include bounded support contact workflows, notification preferences and exports of aggregate data. Billing, plans, quotas, bulk lifecycle changes, deletion and impersonation require separate product decisions and functionality.

This first pass records the repository investigation and recommended feature scope. The outstanding inputs for design and specifications are onboarding ownership, suspension semantics, and any alternate branding.
