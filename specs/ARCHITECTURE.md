# Prompt Studio architecture

## Folder structure

- Frontend/src/pages/PromptStudioPage.jsx: existing state and API orchestration; integrate presentation here only in spec 06.
- Frontend/src/pages/workspace.css: scoped page layout and component styling; one owner, spec 06.
- Frontend/src/features/prompt-studio/: AssistantMarkdown.jsx, markdown.css and clipboard.js (spec 02), PolicyNotice.jsx (03), ChatHistory.jsx (04), Composer.jsx (05), colocated component tests.
- Frontend/src/components/ui/: existing shadcn/Radix primitives; do not fork them.
- Frontend/src/services/promptWorkspace/promptWorkspaceService.js: existing API boundary, unchanged.
- Frontend/vitest.config.js, tests/setup-components.js: component harness (01).
- Frontend/playwright.studio.config.js, tests/prompt-studio.spec.js: integrated browser proof (07).
- specs/inventory/: per-unit reuse fragments; fold at verification.

## Layer boundaries

| Path | Owns | Never does |
| --- | --- | --- |
| PromptStudioPage | Current requests, guards, drafts, selected chat, polling and retries | Rewrite API contracts, auth or model prompt |
| Feature components | Controlled UI, Markdown rendering, copy feedback and focus | Fetch application records or mutate stored responses |
| workspace.css | Target-page layout, including page-title presentation | Restyle unrelated pages or global tokens |
| API services | Existing transport | Change under this feature |
| backend/ | Existing enforcement and retention | Change under this feature |

## Naming and data model

PascalCase JSX components; colocated .test.jsx files; lowercase CSS/helper module names. Existing conversation has id/title/count; a run has id, prompt, response_text, status, response_withheld, content_expired, model, times, evaluation and usage. Form fields remain integration_id, model, prompt, temperature and max_tokens. Do not add storage.

## State ownership and component contracts

Keep current server requests and client state in PromptStudioPage. The established user request to preserve working behavior overrides a state-library migration. Presentation modules get controlled props and callbacks.

- AssistantMarkdown: text, withheld=false, expired=false; do not render/copy missing, withheld or expired assistant text. Render standard Markdown plus GFM; raw HTML off, library URL sanitizer preserved, no external image fetch. Original Markdown for response copy; exact literal code for code copy.
- PolicyNotice: context, policySetupRequired, optionalAdminPolicy, policyOptionalWithoutInput, currentUser. Retain all current text/links and actual group context. Normal state is compact; warnings, missing required setup and optional/no-policy guidance stay visible.
- ChatHistory: history, historyLoading, historyError, historyUnavailable, page, busy, chat, onNewChat, onSelect, onPageChange, onRetry, open, onOpenChange, formatTime. Render one desktop aside while closed or one Radix dialog when open, avoiding duplicate item DOM. Keep studio-history-item/studio-new-chat selectors and Chats/Close chats accessible names. The dialog captures/returns trigger focus.
- Composer: form, setForm, onSubmit, onKeyDown, promptRef, selected, integrations, busy, loadingChat, historyReady, historyUnavailable, historyLoading, policySetupRequired, error, onRetryHistory, chat, contextNote. Preserve exact labels Start a conversation/Continue the conversation, Send message/Waiting for reply, required/limits and disabled guards. Reuse shadcn Popover for generation settings. Keep textarea id studio-prompt.

## Protected files and invariants

1. No backend, service, permission helper, auth, deployment or navigation edits.
2. Preserve current submit/show/poll/loadOlder/newChat state and request-key behavior; UI focus plumbing may move to Radix.
3. Render user prompts literally; render only permitted retained assistant output as Markdown. No dangerouslySetInnerHTML or rehype-raw.
4. Use existing Button, Dialog, Popover and BrandMark; no second overlay primitive.
5. Never load model-provided image URLs automatically; safe explicit links only.
6. Features call controlled callbacks, never application APIs.
7. Copy failure is visible; original text/whitespace is preserved.
8. Transcript, tables and code remain keyboard-scrollable; focus is visible; no page horizontal overflow.
9. Keep one visible New chat action per responsive layout. The main chat history aside and drawer must not duplicate interactive items.
10. Only spec 06 edits PromptStudioPage/workspace.css/PageTitle. Only spec 01 edits package and test configuration. Frozen design/v1-v3 are read-only after approval.
11. Unit tests mock at DOM/clipboard callback seams; browser fixtures intercept all API traffic and never contact providers.
12. Spec 07 alone introduces/runs integrated browser proof; spec 08 runs both suites and protects existing dirty source by comparing saved baseline hashes.

## Test boundaries

Node contract/data tests remain. Add Vitest + Testing Library + jsdom for semantic, interaction and Markdown-security component tests. Keep all-unit command npm test; scoped command npm run test:components -- <file>. Browser command npm run test:studio; Chromium only, synthetic API fixtures, auto-start isolated local Vite server, screenshot/trace on failure. Real provider availability, Netlify deployment and physical mobile keyboards are outside local verification.
