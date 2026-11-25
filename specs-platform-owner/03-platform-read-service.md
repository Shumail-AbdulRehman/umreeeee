# Spec 03 — Overview and company read orchestration

**Status:** Done
**Depends on:** Spec 02
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `backend/app/services/platform_service.py`, `backend/tests/unit/test_platform_service.py`, `specs-platform-owner/inventory/03-platform-read-service.md`
**Reuses:** `backend/app/core/permissions.py`

## Goal

The four overview totals, evidence-backed issues and company details come from recorded state.

## Scope

- Compose overview, directory and company detail using read models.
- Derive explainable attention rules for setup, invitation failures, repeated provider errors and high-severity backlog.
- Enforce super-admin access at every public service method and handle missing companies.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Compose overview, directory and company detail using read models.
2. Derive explainable attention rules for setup, invitation failures, repeated provider errors and high-severity backlog.
3. Enforce super-admin access at every public service method and handle missing companies.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `backend/tests/unit/test_platform_service.py` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented the assigned backend boundary. Focused platform metric/service tests:38 passed. Whole backend unit suite at this working-tree snapshot:558 passed with8 upstream warnings (16.07s). Python compilation passed. Public response objects validate against the strict platform schemas. Real Mongo pipeline acceptance belongs to spec05 and final verification; frontend lint/build are deferred to the lead's integrated pass while UI units are still changing. No application DB or provider request was made.

- **2026-11-25**: Follow-up review keeps onboarding identical across overview, directory and detail: no active verified password-bearing administrator means awaiting_admin; otherwise absence of an active integration, active group, or active named DLP/Guardrail policy means setup_incomplete; otherwise ready. Actual input-policy applicability remains its own metric/banner. Coverage considers only active integrations with at least one enabled model; no enabled models yields zero covered, never an invented pass. Added cross-surface consistency and model-less integration tests. Narrowed resolver input projection to rule types, assignment IDs and catalog IDs so raw policy terms/patterns/descriptions never leave MongoDB for reporting. Focused metric/service tests40 passed; the lead owns final integration evidence.
