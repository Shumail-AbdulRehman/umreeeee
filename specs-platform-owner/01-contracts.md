# Spec 01 — Strict platform HTTP contracts

**Status:** Done
**Depends on:** Spec 00
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `backend/app/schemas/platform.py`, `backend/tests/unit/test_platform_contracts.py`, `specs-platform-owner/inventory/01-contracts.md`
**Reuses:** `backend/app/core/errors.py`

## Goal

All platform inputs and public data shapes have explicit contracts.

## Scope

- Define strict access-change validation, allowed filters and safe response shapes using the API contract.
- Reject blank reasons, extra fields, invalid windows, status and versions.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Define strict access-change validation, allowed filters and safe response shapes using the API contract.
2. Reject blank reasons, extra fields, invalid windows, status and versions.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `backend/tests/unit/test_platform_contracts.py` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented strict public platform response contracts and trimmed required access reasons. Two focused schema tests and integrated HTTP validation passed; whole backend suite598 passed.
