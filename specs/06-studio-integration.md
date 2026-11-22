# Spec 06 — Approved layout and presentation integration

**Status:** Done
**Depends on:** Spec 02, Spec 03, Spec 04, Spec 05
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/pages/PromptStudioPage.jsx`, `Frontend/src/pages/workspace.css`, `Frontend/src/components/PageTitle.jsx`, `Frontend/src/features/prompt-studio/PromptStudioPage.test.jsx`, `specs/inventory/06-studio-integration.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Wire approved presentation components into the existing page; retain submit/show/poll/loadOlder/idempotency/draft/history logic and service imports.

## Scope

Consume `Frontend/src/features/prompt-studio/AssistantMarkdown.jsx`, `Frontend/src/features/prompt-studio/markdown.css`, `Frontend/src/features/prompt-studio/clipboard.js`, `Frontend/src/features/prompt-studio/PolicyNotice.jsx`, `Frontend/src/features/prompt-studio/ChatHistory.jsx` and `Frontend/src/features/prompt-studio/Composer.jsx` from the independent UI units.

- Apply approved scoped reading/history/composer layout and one visible New chat per viewport. Remove redundant page kicker only for this route.
- Preserve plain user prompts and all blocked/checking/error/withheld/expired distinctions; assistant Markdown uses the established guard.
- Let Dialog own overlay focus; keep breakpoint synchronization and existing route/query behavior.
- Prove controlled initialization, protected response guards and no premature sends through API-boundary unit mocks.

## Explicit non-scope

- Integrated browser flow proof → spec 07.
- Clean suite and reuse audit → spec 08.

## Reuse first

- Read the cited inventory and approved screen before creating components.
- Preserve the existing transport, permission helpers and controlled component contracts.
- Use the declared local shadcn foundation; do not add another parser/overlay/state system.

## Steps

1. Inspect owned paths and upstream artifacts against the real tree.
2. Implement only the scoped responsibility and its meaningful component tests.
3. Save reuse entries in this unit’s fragment where applicable; record evidence and limitations.

## Done when

- [x] `npm run test:components -- src/features/prompt-studio/PromptStudioPage.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- **2026-11-04**: Integrated all four presentation units and scoped desktop/mobile workspace styles. Seven page component tests pass, covering initialization, literal user input, protected/expired outputs and send guards. The full suite passes 8 Node and 81 component tests in 6 files; lint exits 0 without warnings and production build passes. Seven existing orchestration functions remain byte-identical to the pre-implementation baseline. Initial browser run passes 14 cases across four viewport sizes; final verification remains spec 08.
