# Platform owner architecture

## Folder structure
- backend/app/schemas/platform.py: strict mutation contracts and response contracts.
- backend/app/services/platform_metrics.py: bounded safe Mongo aggregation queries and policy applicability.
- backend/app/services/platform_service.py: platform read orchestration and attention signals.
- backend/app/services/platform_audit_service.py: safe timelines and shared versioned company access action.
- backend/app/api/routes/platform.py: protected HTTP composition.
- Frontend/src/features/platform/: platform shell, screens, safe API clients, hooks and scoped styles.
- Frontend/src/App.jsx and components/Sidebar.jsx: explicit platform entry and workspace return.

## Layer boundaries
Routes validate HTTP input, authenticate and compose services. Services accept a database and user; they never depend on Request objects. UI components never import backend drivers. API clients own HTTP and hooks own request lifecycle. No import creates a DB connection.

## Naming and protected files
Python snake_case; React PascalCase; tests colocated on frontend. Original design/v1-v3, unrelated dirty Red Team work, secrets, generated artifacts and migrations are protected.

## Data model
Read existing companies, users, groups, integrations, policies, prompt_runs, violations and audit_events. No schema migration is required; reasons extend existing audit metadata. Add query indexes for the new access patterns only where evidence supports them. Full field shapes are in docs/planning/platform-owner/api-contract.md.

## State ownership
Server state belongs in feature fetch hooks with cleanup, cancellation and race protection, following the existing repository stack. User-controlled filters, date range and pagination are URL-backed; dialog reason and pending flags are local state. Session identity remains App-owned.

## Invariants
1. Every platform service and route checks require_super_admin.
2. Tenant endpoints continue deriving scope solely from the session.
3. Platform DTOs exclude raw prompts, responses, findings, email addresses and provider credentials.
4. Ordinary usage counts only workspace source; backlog and window outcomes are separate.
5. Missing historical company status/version default to active/1.
6. Own organization access cannot be changed through either status route.
7. Access changes require optimistic concurrency and produce actor and target audit records atomically.
8. No external provider or detector calls run for platform reporting.
9. Prototype data never ships in the runtime application.
10. Every chart has accessible data and every failure has visible recovery.
11. Existing role-specific organization landing behaviour remains except super-admin default platform entry.
12. Native pending calls cannot be retroactively cancelled; status copy states suspension accurately.
