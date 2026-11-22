# Spec 05 — Compact controlled composer

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/prompt-studio/Composer.jsx`, `Frontend/src/features/prompt-studio/Composer.test.jsx`, `specs/inventory/05-composer.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`, `Frontend/src/components/ui/popover.jsx`

## Goal

Build the compact bounded composer from approved v3 and the controlled contract.

## Scope

- Preserve integration/model selection, generation values, form submit/key callbacks, text length and every disabled-send guard.
- Reuse Popover for settings; keep fields labeled, mobile actions comfortable and input text readable.
- Render error/history-recovery/pending feedback from passed state, without adding network or new submission behavior.

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

- [x] `npm run test:components -- src/features/prompt-studio/Composer.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- 2026-11-04: Implemented the controlled default-exported Composer and 29 semantic component tests in the owned feature files. Preserved the architecture props, raw prompt/callbacks, required selectors, maxlength 24000, exact send-disabled guards, established accessible names, integration/model reset and history/pending/error feedback. Reused Button/Popover; options retain native numeric limits while closed and open/focus the invalid field on attempted submit. Textarea defaults to two rows and auto-sizes within consuming CSS min/max bounds; the public focus ref still resolves to it. Reuse notes are in inventory/05-composer.md.
- 2026-11-04: Scoped Composer proof passed 29/29; npm test passed 8 Node tests plus 74 component tests across 5 files in the concurrent workspace. Lint passed with 0 errors/warnings; production build passed (2669 modules, plugin timing notice only). No API, backend, page, CSS, service, configuration or browser-test files were edited by this unit. Integrated rendering/browser proof remains with specs 06–07; lead owns tracker/status updates.
- 2026-11-04: Integration follow-up wrapped visible Options and Send/Thinking text in studio-options-label/studio-send-label spans for the existing responsive toolbar CSS; accessible names and behavior are unchanged. Scoped tests passed 29/29 and lint passed with 0 errors/warnings. Lead will run the final integrated build.
- **2026-11-04**: Integrated controlled fields, form-associated generation options, native constraint preservation and mobile icon labels. Final combined unit suite passes 8 Node plus 81 component tests; lint and production build pass. Browser payload, pending and history-recovery guards pass.
