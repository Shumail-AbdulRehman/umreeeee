# Spec 00 — Presentation-only decision

**Status:** Done
**Depends on:** —
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** —
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Record approved v3, existing React/Vite stack, current API/state ownership, and the safe Markdown/test choices.

## Scope

- Keep Mongo/backend, auth, request contracts and deployment unchanged.
- Choose react-markdown plus remark-gfm over regex parsers/raw HTML. Choose Vitest/Testing Library/jsdom for component proof while retaining existing Node tests and installed Playwright.
- Reject state-library migration, streaming, attachment, syntax-highlighting and broad global-shell changes in this feature.

## Explicit non-scope

- Dependency installation and harness → spec 01.
- Application integration → spec 06.

## Reuse first

- Read the cited inventory and approved screen before creating components.
- Preserve the existing transport, permission helpers and controlled component contracts.
- Use the declared local shadcn foundation; do not add another parser/overlay/state system.

## Steps

1. Inspect owned paths and upstream artifacts against the real tree.
2. Record or verify only the bounded responsibilities above.
3. Save reuse entries in this unit’s fragment where applicable; record evidence and limitations.

## Done when

- [x] Approved design, stack/storage/state/testing choices and rejected alternatives are recorded without changing production behavior. [static]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Decision recorded from inspected source, approved v3 and primary-source research. Existing lint/build evidence is in docs/UI_REDESIGN.md; re-run in final verification.
- **2026-11-04**: Design approval and presentation-only scope confirmed; execution follows the frozen v3.
