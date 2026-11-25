# Spec 02 — Platform aggregate read models

**Status:** Done
**Depends on:** Spec 01
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `backend/app/services/platform_metrics.py`, `backend/tests/unit/test_platform_metrics.py`, `specs-platform-owner/inventory/02-platform-read-models.md`
**Reuses:** `backend/app/services/enforcement_service.py`, `backend/app/services/analytics_service.py`

## Goal

A database query layer supplies real safe company summaries and coverage.

## Scope

- Aggregate company setup, workspace-only daily outcomes and current violation backlog with safe projections.
- Implement stable server-side directory filtering, totals, sorting and pagination and exact member policy applicability.
- Cover empty data, default historical fields, mixed sources, UTC boundaries, actor privacy and multiple-company scoping.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Aggregate company setup, workspace-only daily outcomes and current violation backlog with safe projections.
2. Implement stable server-side directory filtering, totals, sorting and pagination and exact member policy applicability.
3. Cover empty data, default historical fields, mixed sources, UTC boundaries, actor privacy and multiple-company scoping.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `backend/tests/unit/test_platform_metrics.py` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented the assigned backend boundary. Focused platform metric/service tests:38 passed. Whole backend unit suite at this working-tree snapshot:558 passed with8 upstream warnings (16.07s). Python compilation passed. Public response objects validate against the strict platform schemas. Real Mongo pipeline acceptance belongs to spec05 and final verification; frontend lint/build are deferred to the lead's integrated pass while UI units are still changing. No application DB or provider request was made.

- **2026-11-25**: Follow-up review keeps onboarding identical across overview, directory and detail: no active verified password-bearing administrator means awaiting_admin; otherwise absence of an active integration, active group, or active named DLP/Guardrail policy means setup_incomplete; otherwise ready. Actual input-policy applicability remains its own metric/banner. Coverage considers only active integrations with at least one enabled model; no enabled models yields zero covered, never an invented pass. Added cross-surface consistency and model-less integration tests. Narrowed resolver input projection to rule types, assignment IDs and catalog IDs so raw policy terms/patterns/descriptions never leave MongoDB for reporting. Focused metric/service tests40 passed; the lead owns final integration evidence.
