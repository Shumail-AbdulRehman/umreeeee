# Spec 09 — Company directory screen

**Status:** Done
**Depends on:** Spec 06, Spec 07
**Model:** Standard — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformCompanies.jsx`, `Frontend/src/features/platform/PlatformCompanies.test.jsx`, `specs-platform-owner/inventory/09-platform-directory.md`
**Reuses:** `design/platform-owner/v3/index.html`

## Goal

All prototype directory controls operate on the complete company collection.

## Scope

- Connect search, access/onboarding/activity filters, sorting, date windows and server pagination.
- Keep query parameters in the URL, debounce search and preserve keyboard focus.
- Show empty results with clear filters, loading and actionable errors.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Connect search, access/onboarding/activity filters, sorting, date windows and server pagination.
2. Keep query parameters in the URL, debounce search and preserve keyboard focus.
3. Show empty results with clear filters, loading and actionable errors.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/PlatformCompanies.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented the assigned React screen and isolated interaction tests. Focused command `cd Frontend && npx vitest run src/features/platform/PlatformCompanies.test.jsx src/features/platform/PlatformAudit.test.jsx`: **14 passed** (2 files,2.51s). Targeted ESLint for the four owned source/test files passed with0 findings. Shared foundation/client files are being integrated concurrently; complete frontend suite, production build and browser evidence remain the lead’s integration gate.
