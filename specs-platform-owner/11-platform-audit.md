# Spec 11 — Platform audit screen

**Status:** Done
**Depends on:** Spec 06, Spec 07
**Model:** Standard — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformAudit.jsx`, `Frontend/src/features/platform/PlatformAudit.test.jsx`, `specs-platform-owner/inventory/11-platform-audit.md`
**Reuses:** `design/platform-owner/v3/index.html`

## Goal

The audit screen shows a safe complete cross-company timeline.

## Scope

- Connect company, event-type and date filters with stable server pagination.
- Support a preselected company from a detail link without fetching a complete private tenant directory.
- Render allowed events, reasons, actors, UTC times and request IDs with empty/error recovery.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Connect company, event-type and date filters with stable server pagination.
2. Support a preselected company from a detail link without fetching a complete private tenant directory.
3. Render allowed events, reasons, actors, UTC times and request IDs with empty/error recovery.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/PlatformAudit.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented the assigned React screen and isolated interaction tests. Focused command `cd Frontend && npx vitest run src/features/platform/PlatformCompanies.test.jsx src/features/platform/PlatformAudit.test.jsx`: **14 passed** (2 files,2.51s). Targeted ESLint for the four owned source/test files passed with0 findings. Shared foundation/client files are being integrated concurrently; complete frontend suite, production build and browser evidence remain the lead’s integration gate.
