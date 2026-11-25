# Spec 05 — Platform route composition

**Status:** Done
**Depends on:** Spec 01, Spec 03, Spec 04
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `backend/app/api/routes/platform.py`, `backend/app/api/router.py`, `backend/app/db/indexes.py`, `backend/tests/unit/test_platform_http.py`, `backend/tests/integration/test_platform_owner.py`, `specs-platform-owner/inventory/05-platform-http.md`
**Reuses:** `backend/app/api/dependencies/auth.py`

## Goal

The new frontend can call the complete protected platform HTTP surface.

## Scope

- Wire overview, directory, company detail, audit and reasoned status endpoints under the dedicated platform prefix.
- Compose safe five-event history into company detail and validate query enums and IDs.
- Prove authorization, wire contracts and scoped queries; integration tests remain isolated to temporary databases.

## Explicit non-scope

- Final evidence and reuse audit → spec 14.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Wire overview, directory, company detail, audit and reasoned status endpoints under the dedicated platform prefix.
2. Compose safe five-event history into company detail and validate query enums and IDs.
3. Prove authorization, wire contracts and scoped queries; integration tests remain isolated to temporary databases.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `backend/tests/unit/test_platform_http.py`, `backend/tests/integration/test_platform_owner.py` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Wired guarded overview, directory, detail, audit and access routes, composed bounded company history and added the action/recent audit index. Thirty focused HTTP tests passed; eight realMongo platform acceptance tests passed. Existing home-company status and organization-admin rejection regressions passed against disposable databases.
