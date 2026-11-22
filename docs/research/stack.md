# Prompt Studio stack evidence

Checked 2026-11-04.

- Frontend/package.json: React 19.2.5, Vite 8.0.10, Tailwind 4.2.4, local shadcn/Radix components, lucide-react, JavaScript/JSX. react-markdown, remark-gfm and Vitest are not currently declared.
- Frontend/src/pages/PromptStudioPage.jsx: RunDetail renders assistant response_text in a plain paragraph. It gates response_text on !response_withheld, renders explicit blocked/validation/expired states, and keeps admin-only statistics. User prompts remain literal paragraph text.
- Frontend/src/pages/workspace.css: .studio-layout uses a fixed viewport subtraction plus 490px minimum height. Composer textarea, control row, labels and notes compete with the transcript. Duplicated new-chat controls occur in history header, history action and conversation header.
- Frontend/src/services/promptWorkspace/promptWorkspaceService.js: existing context, conversation list/detail, run execution/detail and idempotency contracts. No endpoint or request transformation is needed for Markdown presentation.
- Frontend/tests/conversations.browser.cjs: existing idempotency, draft preservation, history outage/recovery, follow-up, blocked-input, checking-error and mobile history checks. Preserve these; planning does not run production mutations.
- Frontend/src/components/ui/: existing button, dialog, popover, tooltip and textarea primitives. Reuse these in implementation; prototypes use native HTML for a build-free visual reference.
- Unit runner: node --test tests/*.test.mjs. Playwright and axe already installed. A narrowly scoped Vite-compatible JSX unit runner is a proposed decision for approval, not an installed fact.
- Root PRODUCT.md describes an earlier phase. Incumbent source includes actual enforcement and conversation support; do not rewrite root context as a planning side effect. Root DESIGN.md remains visual authority.
- The house React patterns prefer feature boundaries and separated rendering/state. Existing application behavior and user authorization override a migration to new state/cache libraries in this presentation-only feature. Keep current hooks and services, extract only presentation components where it reduces duplication.
