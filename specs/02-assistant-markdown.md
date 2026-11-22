# Spec 02 — Safe assistant Markdown and copy

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/features/prompt-studio/AssistantMarkdown.jsx`, `Frontend/src/features/prompt-studio/markdown.css`, `Frontend/src/features/prompt-studio/clipboard.js`, `Frontend/src/features/prompt-studio/AssistantMarkdown.test.jsx`, `specs/inventory/02-assistant-markdown.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`, `Frontend/src/components/ui/button.jsx`

## Goal

Build the approved structured response presentation using the established parser and GFM plugin.

## Scope

- Render headings, emphasis, lists, quotes, tasks, links, inline code, fenced code and tables; bound wide content locally.
- Keep raw HTML off, preserve safe URL processing and avoid automatic external image loads. Do not write a parser.
- Copy original Markdown and literal fenced code with stable labels and visible feedback, including failure.
- Never render or copy absent, withheld or expired content; test hostile URLs/HTML, malformed fences and literal preservation.

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

- [x] `npm run test:components -- src/features/prompt-studio/AssistantMarkdown.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- 2026-11-04: Implemented the owned renderer, scoped stylesheet, clipboard writer and 30 component tests; added `inventory/02-assistant-markdown.md`. Markdown/GFM rendering retains the parser URL sanitizer and disables raw HTML; image references become explicit safe links. Protected/absent text produces no rendered or copyable content. Response copy preserves original Markdown; code copy uses the parser's literal value without trimming or the HTML adapter's extra newline. Existing Button and theme aliases are reused; source page, services and global tokens were not edited.
- 2026-11-04: Scoped command `npm run test:components -- src/features/prompt-studio/AssistantMarkdown.test.jsx` passed: 1 file / 30 tests. `npm test` passed: 8 existing Node tests plus 68 component tests across 5 files at the verification time. `npm run lint` passed with zero errors/warnings after removing two unnecessary test-string escapes. `npm run build` passed (2,669 modules); Vite reported plugin timing information. Impeccable's changed-target detector returned no findings. No browser/e2e runs were performed by this unit; integrated layout/visual proof remains specs 06–07. Tracker/status updates remain with the lead.
- **2026-11-04**: Visual review found Tailwind preflight suppressing list markers. Restored explicit decimal/disc/circle list styles in this unit; spec 07 now checks the computed ordered-list style. The parser, security and copy behavior remain unchanged.
