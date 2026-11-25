# Spec 10 — Company detail and access dialog

**Status:** Done
**Depends on:** Spec 06, Spec 07
**Model:** Standard — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformCompany.jsx`, `Frontend/src/features/platform/PlatformCompany.test.jsx`, `specs-platform-owner/inventory/10-platform-company.md`
**Reuses:** `Frontend/src/components/ui/dialog.jsx`, `design/platform-owner/v3/index.html`

## Goal

A platform owner can investigate a company and safely change access.

## Scope

- Render company identity, access, metrics, chart, setup/coverage and company history.
- Add accessible reasoned suspend/reactivate confirmation, own-company protection and stale-version refresh.
- Show actual suspension consequences and preserve inputs across recoverable errors.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Render company identity, access, metrics, chart, setup/coverage and company history.
2. Add accessible reasoned suspend/reactivate confirmation, own-company protection and stale-version refresh.
3. Show actual suspension consequences and preserve inputs across recoverable errors.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/PlatformCompany.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Implemented v3 company investigation and reasoned access dialog with explicit suspension semantics, immutable requested action, own-company protection and version refresh. Seven meaningful component cases passed, including already-applied state and failedconflictrefresh recovery. Browser proof verifies focus restoration and prevention of reversed intent.
