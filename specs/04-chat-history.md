# Spec 04 — Responsive history presentation

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/prompt-studio/ChatHistory.jsx`, `Frontend/src/features/prompt-studio/ChatHistory.test.jsx`, `specs/inventory/04-chat-history.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`, `Frontend/src/components/ui/dialog.jsx`

## Goal

Build the controlled history list and native-feeling mobile drawer from approved v3 and the contract.

## Scope

- Reuse existing Dialog primitive for focus, Escape and dismissal; render only one interactive set of history items.
- Preserve loaded/empty/loading/error/unavailable states, titles, dates, counts, pagination and busy disabling.
- Keep established class/accessibility hooks for existing regression tests and call existing callbacks only.

## Explicit non-scope

- Page integration and final layout wiring → spec 06.
- Integrated browser flows → spec 07.

## Reuse first

- Read the cited inventory and approved screen before creating components.
- Preserve the existing transport, permission helpers and controlled component contracts.
- Use the declared local shadcn foundation; do not add another parser/overlay/state system.

## Steps

1. Inspect owned paths and upstream artifacts against the real tree.
2. Implement only the scoped responsibility and its meaningful component tests.
3. Save reuse entries in this unit’s fragment where applicable; record evidence and limitations.

## Done when

- [x] `npm run test:components -- src/features/prompt-studio/ChatHistory.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- 2026-11-04: Implemented `Frontend/src/features/prompt-studio/ChatHistory.jsx`, its colocated component tests and `specs/inventory/04-chat-history.md`. The exact controlled contract preserves incumbent history copy, retained items on errors, loading/empty/unavailable states, busy guards, dates/counts, active selection and pagination. Reused existing Button and Radix Dialog; renders one desktop aside or one dialog, with one New chat control in its history presentation. Dialog focus starts on Close chats and returns to the captured trigger; Radix handles Escape and trapping. No page, CSS, API, backend or service edits.
- 2026-11-04: Verification passed: scoped ChatHistory component run 10/10 tests; `npm test` 8/8 Node tests plus 15/15 component tests across 3 files at the time of this concurrent implementation; `npm run lint` exit 0 without warnings; `npm run build` exit 0 (2,669 modules; informational plugin-timing warning). Impeccable detector returned no findings for the component. No browser/e2e checks ran; final layout and page wiring remain spec 06, integrated browser proof remains spec 07.
- **2026-11-04**: Integrated the controlled history and Radix mobile drawer. Final combined unit suite passes 8 Node plus 81 component tests; lint and production build pass. Desktop/mobile browser focus and Escape checks pass.
- **2026-11-04**: Bounded production-only correction: built CSS merged translate:none into transform while the shared Dialog centering translate utilities remained active, moving the mobile drawer partly offscreen. Override those shared utilities through cn/Tailwind merge with top-0, left-auto, right-0 and zero x/y translations. No history data, focus semantics or callbacks changed. Spec 07 now runs the production build and asserts all drawer bounds.
