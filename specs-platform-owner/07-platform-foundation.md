# Spec 07 — Platform shell, tokens and shared presentation

**Status:** Done
**Depends on:** Spec 00
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformShell.jsx`, `Frontend/src/features/platform/PlatformComponents.jsx`, `Frontend/src/features/platform/platform.css`, `Frontend/src/features/platform/PlatformComponents.test.jsx`, `Frontend/src/features/platform/platformFormat.js`, `Frontend/src/features/platform/platformFormat.test.js`, `specs-platform-owner/inventory/07-platform-foundation.md`
**Reuses:** `design/platform-owner/v3/index.html`, `design/platform-owner/v3/styles.css`, `Frontend/src/components/BrandMark.jsx`, `Frontend/src/components/ui/dialog.jsx`

## Goal

All screens share the approved visual structure and accessible table/chart primitives.

## Scope

- Rebuild the v3 shell, chart, metrics, company and audit tables and pagination as reusable React presentation.
- Scope all styles to the platform surface and inherit existing brand and accessible primitives.
- Include mobile navigation, real as-of context, keyboard focus and accessible chart data.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Rebuild the v3 shell, chart, metrics, company and audit tables and pagination as reusable React presentation.
2. Scope all styles to the platform surface and inherit existing brand and accessible primitives.
3. Include mobile navigation, real as-of context, keyboard focus and accessible chart data.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/PlatformComponents.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Rebuilt the approved v3 shell and shared React presentation with isolated feature tokens, responsive navigation, zero-filled truthful chart display, daily chart data, safe company/audit tables and explicit UTC formatting. The pure formatter is isolated in platformFormat.js to keep component refresh exports clean. Focused16 tests and own-file ESLint passed. Full concurrent-tree snapshot:339 Vitest +8 Node passed; production build passed before final entry wiring. Final integrated visual/browser checks belong to13/14.
- **2026-11-25**: Final focused run after monthly chart grouping and incumbent-class isolation:17 tests passed across shared components/overview/UTC formatting; own-file ESLint passed with zero errors. Monthly chart test proves ten display buckets retain all thirty daily rows and totals.
