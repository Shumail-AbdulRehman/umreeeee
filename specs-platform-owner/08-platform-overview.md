# Spec 08 — Platform overview screen

**Status:** Done
**Depends on:** Spec 06, Spec 07
**Model:** Standard — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformOverview.jsx`, `Frontend/src/features/platform/PlatformOverview.test.jsx`, `specs-platform-owner/inventory/08-platform-overview.md`
**Reuses:** `design/platform-owner/v3/index.html`

## Goal

The prototype overview is connected to real platform data.

## Scope

- Render the four summary metrics, outcome chart, attention panel and top company activity.
- Support7/30-day windows, recovery, empty state and company links without sample runtime values.

## Explicit non-scope

- Backend HTTP wiring → spec 05.
- Application entry and session routing → spec 12.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Render the four summary metrics, outcome chart, attention panel and top company activity.
2. Support7/30-day windows, recovery, empty state and company links without sample runtime values.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/PlatformOverview.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Connected overview to the real platform API and abortable resource hook: four metrics,7/30-day controls, recorded outcome chart, attention preview, top company activity, empty/error/retry states. No runtime fixture companies or metrics. Focused overview4 tests passed as part of16 shared tests; full concurrent-tree339 Vitest +8 Node and pre-entry build passed. Lead completes integrated browser validation.
- **2026-11-25**: Added optional onMetadata callback reporting the loaded response generatedAt for the shell's real as-of badge. Focused metadata assertion passed; final shared/overview/formatter17 tests and targeted lint passed.
