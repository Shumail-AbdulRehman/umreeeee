# Spec 06 — Platform API client and request lifecycle

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/platformService.js`, `Frontend/src/features/platform/usePlatformResource.js`, `Frontend/src/features/platform/platformService.test.js`, `Frontend/src/features/platform/usePlatformResource.test.jsx`, `specs-platform-owner/inventory/06-platform-client.md`
**Reuses:** `Frontend/src/services/api/client.js`

## Goal

Feature clients fetch and mutate without leaking races between company selections.

## Scope

- Implement the five API operations with encoded parameters, bearer auth and optional AbortSignal.
- Add a reloadable request hook with abort cleanup and stale-response protection.
- Keep UI filter state outside the server request hook.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Implement the five API operations with encoded parameters, bearer auth and optional AbortSignal.
2. Add a reloadable request hook with abort cleanup and stale-response protection.
3. Keep UI filter state outside the server request hook.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/platformService.test.js`, `Frontend/src/features/platform/usePlatformResource.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented encoded feature API clients and abortable, race-safe reload hook. Five focused client/request tests passed. Same-query refetch retains data on recoverable errors so pending access reasons survive outages. Whole frontend353 Vitest+8Node passed.
