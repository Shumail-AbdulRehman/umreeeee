# Spec 00 — Platform implementation decisions

**Status:** Done
**Depends on:** —
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** —
**Reuses:** `docs/planning/platform-owner/api-contract.md`

## Goal

The existing prototype and the user implementation request settle design and scope.

## Scope

- Record user-approved v3, existing React/FastAPI/Mongo stack, safe DTO boundary, UTC windows and suspension semantics.
- Preserve fetch hooks instead of imposing new query/store libraries on an existing application; no new dependency or redesign.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Record user-approved v3, existing React/FastAPI/Mongo stack, safe DTO boundary, UTC windows and suspension semantics.
2. Preserve fetch hooks instead of imposing new query/store libraries on an existing application; no new dependency or redesign.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] Record the approved visual direction, existing stack and scope. [static]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.
