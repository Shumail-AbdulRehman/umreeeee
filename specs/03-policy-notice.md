# Spec 03 — Compact truthful policy context

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/prompt-studio/PolicyNotice.jsx`, `Frontend/src/features/prompt-studio/PolicyNotice.test.jsx`, `specs/inventory/03-policy-notice.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Build the controlled policy disclosure from approved v3 using the PolicyNotice contract in ARCHITECTURE.md.

## Scope

- Preserve the incumbent required/optional/admin/not-ready text, role-appropriate links and actual group names.
- Use a compact normal summary and keep actionable warning/setup guidance visible.
- Do not fetch, infer protection from mere configuration or change whether sending is permitted.

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

- [x] `npm run test:components -- src/features/prompt-studio/PolicyNotice.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- **2026-11-04**: Implemented the compact native disclosure with existing policy-readiness branches, real group names and role-appropriate navigation. Warning and optional-policy guidance stays open; normal context is expandable. Four component tests pass. Integrated npm test passes 8 Node plus 81 component tests; lint exits 0 without warnings and build passes.
