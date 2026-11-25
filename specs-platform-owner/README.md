# Platform owner implementation

Build the approved design/platform-owner/v3 as a protected real-data workspace. The current PROGRESS.md is authoritative. Contracts: docs/planning/platform-owner/api-contract.md.

## Waves
00 decisions;01 contracts;02/04/06/07 data/audit/client/shell;03/08/09/10/11 read service/screens;05 HTTP and12 entry;13 acceptance;14 verification.

## Review artifacts

- [Implementation verification](../docs/planning/platform-owner/implementation-verification.md)
- [Runtime/workflow documentation](../docs/PLATFORM_OWNER.md)
- [Design review status](../design/platform-owner/README.md)

## Known gaps
- The current session inherits its model. Runner provider metadata comes from the installed skill; no model/provider selection or external execution is performed.
- The existing app uses fetch hooks; preserve its dependency conventions instead of introducing global query/store packages.
- Database acceptance requires a dedicated temporary transaction-capable MongoDB; any unavailable service is recorded explicitly.
- Existing changes are uncommitted. Do not reset or mix them into external commits/PRs.

- GitHub issue warnings are expected: local implementation was requested; no external issue/PR work is performed.
- Final verification consumes all application modules and tests; generated test fixtures/config and this report are verification artifacts, not runtime endpoints.
- The direct contract dependency of route composition is intentional: it consumes response DTOs independently of its service dependencies.

## Decisions
Self-service onboarding remains; no provisioning/billing/impersonation/content access. Existing token semantics remain on reactivation. The user’s implementation request approves v3 and supersedes the plan-only skill handoff.

## Index
- [00 — Platform implementation decisions](00-platform-decisions.md)
- [01 — Strict platform HTTP contracts](01-contracts.md)
- [02 — Platform aggregate read models](02-platform-read-models.md)
- [03 — Overview and company read orchestration](03-platform-read-service.md)
- [04 — Safe audit and company access lifecycle](04-platform-audit-access.md)
- [05 — Platform route composition](05-platform-http.md)
- [06 — Platform API client and request lifecycle](06-platform-client.md)
- [07 — Platform shell, tokens and shared presentation](07-platform-foundation.md)
- [08 — Platform overview screen](08-platform-overview.md)
- [09 — Company directory screen](09-platform-directory.md)
- [10 — Company detail and access dialog](10-platform-company.md)
- [11 — Platform audit screen](11-platform-audit.md)
- [12 — Application routing and workspace entry](12-platform-entry.md)
- [13 — Platform workflow and responsive acceptance](13-platform-e2e-suite.md)
- [14 — Platform final verification and reuse audit](14-platform-verification-pass.md)

## Final verification

All units are complete. See [verification evidence](../docs/planning/platform-owner/implementation-verification.md) and [runtime documentation](../docs/PLATFORM_OWNER.md). The validator’s expected warnings are 15 local-only issue references, one direct contract dependency, and three final documentation outputs that are consumed by human review rather than another runtime spec.
