# Platform API contract

All routes require the database-authenticated `super_admin` role. The new prefix is `/api/platform`; existing `/organizations` routes remain compatible. All reads return explicit safe DTOs, never tenant serializers. Times are ISO UTC strings, IDs strings, access `active|suspended`, onboarding `ready|setup_incomplete|awaiting_admin`. Dates cover the current UTC day and the preceding days, ending at the captured request time. Only `source=workspace` counts as use; missing status/version on old companies means active/1.

## Shared fields
`window`: {days:7|30, from:ISO, to:ISO, timezone:"UTC"}. `generated_at`: ISO.
`series`: ordered daily {date:ISO, allowed:int, blocked:int, other:int}, including zero days. Blocked combines blocked_input and blocked_output; all other states count as other.
`CompanySummary`: {id,name,slug,status,version,created_at,is_own,onboarding,workspace_runs,last_workspace_submission,open_violations,high_severity_violations,series}. Last workspace submission is lifetime latest; violation backlog is current, workspace-only.
`Attention`: {id,company_id,company_name,kind,title,description,occurred_at,tone}. No prompts, names/emails of employees, free-form errors, finding text, provider configuration or secrets.

## Onboarding definition

Awaiting admin means no active, verified, password-bearing org_admin or super_admin. Setup incomplete means an administrator exists but an active integration, active group, or active named DLP/Guardrail policy is missing. Ready means these setup milestones exist. This label is independent of exact member input-policy applicability and observed evaluation coverage. Exclude managed catalog reference rows from configured named-policy counts.

## GET /overview?days=7
{window,generated_at,metrics:{total_companies,using_companies,onboarding_companies,suspended_companies},series,attention:{items:[Attention],total},companies:[CompanySummary]}
Top company activity contains up to four companies ordered by submissions descending then ID. Attention preview contains up to four deterministically prioritized issues and a total.

## GET /companies
Query: days=7,page=1,page_size=8 (max100),q (max120),access,onboarding,activity=used|idle,sort=runs|name|violations. All filtering, stable sorting, totals and pagination happen on the server.
{items:[CompanySummary],total,page,page_size,window,generated_at}

## GET /companies/{id}?days=7
{company:CompanySummary,window,generated_at,series,attention:[Attention],metrics:{active_accounts,verified_admins,pending_invitations,failed_invitations,active_groups,active_integrations,dlp_policies,guardrail_policies,submitting_users,allowed_runs,blocked_runs,provider_errors,validation_errors,configuration_errors,interrupted_runs,processing_runs,other_runs,evaluation_coverage,evaluated_runs,terminal_runs,policy_coverage:{required,eligible_members,covered_members}},history:{items:[AuditEvent],total,page,page_size}}
Evaluation coverage is percentage 0..100 or null when no terminal runs. A terminal run counts as evaluated if at least one input/output rule has pass/match, consistent with tenant analytics. Active accounts require active and verified; pending invitations are active users without a password and with an invitation token, including failed delivery. Verified admins have active verified admin roles. Policy coverage counts eligible active verified ordinary members covered for every enabled active integration, excludes admin exemptions, and uses server group assignments and resolver semantics. No integration => zero covered.

## GET /audit
Query: company_id optional, event_type optional, days optional7|30, page=1,page_size=20(max100).
{items:[AuditEvent],total,page,page_size}
AuditEvent: {id,company_id,company_name,action,event,actor_name,created_at,request_id,reason}. Allowlist selected company milestones and platform status actions. Tenant actors are role labels; platform actors can have display names without email. Do not expose arbitrary audit before/after dictionaries. Collapse the actor/target duplicate platform audit records into one visible action; attribute it to the affected company, even for the actor-copy record. Use stable newest-first pagination.

## PATCH /companies/{id}/status
{status:active|suspended,version:int>=1,reason:trimmed nonblank<=180}.
{organization:{id,name,status,version},message}. Return stale_version409, own_company403, invalid_id422, not_found404. Preserve own-company protection and transactional version/audit behavior. Persist reason in both audit copies. Legacy status API accepts an optional reason for compatibility.

## Service interfaces
`PlatformService(db).overview(user, days=7)`; `.companies(user, days=7, page=1, page_size=8, q='', access=None, onboarding=None, activity=None, sort='runs')`; `.company(user, company_id, days=7)` returns detail without history.
`PlatformAuditService(db).list(user, company_id=None, event_type=None, days=None, page=1, page_size=20)`; `.change_status(user, company_id, status, version, reason, request_id)` supports reason=None only for legacy caller.
The route composition adds audit history (five records) to company detail. Feature frontend uses getPlatformOverview(options), listPlatformCompanies(options), getPlatformCompany(id,options), listPlatformAudit(options), setPlatformCompanyStatus(id,payload) from platformService.js. Hooks use the existing fetch/AbortController stack to preserve repository conventions without adding a query library for this feature.
