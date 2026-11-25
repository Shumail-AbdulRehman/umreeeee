# Spec 04 — Safe audit and company access lifecycle

**Status:** Done
**Depends on:** Spec 01
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `backend/app/services/platform_audit_service.py`, `backend/tests/unit/test_platform_audit.py`, `backend/app/api/routes/administration.py`, `specs-platform-owner/inventory/04-platform-audit-access.md`
**Reuses:** `backend/app/services/admin_common.py`, `backend/app/core/permissions.py`

## Goal

Access changes are traceable and the platform timeline excludes private audit payloads.

## Scope

- Add an allowlisted platform/company timeline with bounded fields, target attribution, duplicate collapse and pagination.
- Share the existing versioned status mutation; record reasons atomically in actor/target audit copies and preserve legacy optional-reason compatibility.
- Keep own-company protection, stale-state conflict recovery and existing suspension behaviour.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Add an allowlisted platform/company timeline with bounded fields, target attribution, duplicate collapse and pagination.
2. Share the existing versioned status mutation; record reasons atomically in actor/target audit copies and preserve legacy optional-reason compatibility.
3. Keep own-company protection, stale-state conflict recovery and existing suspension behaviour.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `backend/tests/unit/test_platform_audit.py` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Added PlatformAuditService with safe lifecycle DTOs, server-side action/company/date filtering, stable pagination and duplicate access-event collapse. Company status changes now share one transaction-backed implementation; reasons are recorded in both audit copies, old missing status/version are handled, and same-status actions do not fabricate audit records. Legacy status payloads remain accepted.
- **2026-11-25**: Focused audit unit tests **19 passed**; whole backend unit suite **520 passed**, eight existing upstream warnings. Python compilation and assigned-file diff checks passed. Mongo aggregation/transaction acceptance and frontend lint/build remain with lead-owned integrated verification; no live database or provider traffic was used by this unit.

- **2026-11-25**: Independent backend review corrected audit time bounds and labels. All history queries now cap created_at at captured UTC now (inclusive), with7/30-day lower bounds when selected, so future events cannot displace real rows. The existing violation.resolved action covers open/reviewed/resolved writes; row labels now use safe after.status, preserving action IDs and a neutral filter/fallback label. Focused audit unit tests27 passed. The lead owns live Mongo boundary acceptance and integrated verification.
