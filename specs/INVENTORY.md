# Reuse inventory

Final folded inventory, inspected on 2026-11-04. Implementation fragments from specs 01–06 were merged here during final verification; the temporary fragments were removed.

### brand-mark
`Frontend/src/components/BrandMark.jsx` — Existing Averiq mark; use instead of inventing another product logo.
**Added by:** incumbent code.

### button
`Frontend/src/components/ui/button.jsx` — Radix slot-backed variants; use instead of another button foundation.
**Added by:** incumbent code.

### dialog
`Frontend/src/components/ui/dialog.jsx` — Portal, focus scope, dismissal and title; use instead of ad-hoc mobile overlays.
**Added by:** incumbent code.

### popover
`Frontend/src/components/ui/popover.jsx` — Portal-based generation settings; use instead of clipped absolute menus.
**Added by:** incumbent code.

### prompt-service
`Frontend/src/services/promptWorkspace/promptWorkspaceService.js` — Existing transport, history and execution; do not replace or duplicate.
**Added by:** incumbent code.

### permissions
`Frontend/src/utils/permissions.js` — Existing role checks; do not infer permissions from UI state.
**Added by:** incumbent code.

### formatters
`Frontend/src/lib/format.js` — Existing dates/readable text; avoid duplicate formatting policy.
**Added by:** incumbent code.

### chat-state
`Frontend/src/pages/PromptStudioPage.jsx` — Existing submit/show/poll/history/retry state transitions; keep orchestration here.
**Added by:** incumbent code.

### conversation-tests
`Frontend/tests/conversations.browser.cjs` — Existing synthetic behavior coverage; retain it rather than weaken its guarantees.
**Added by:** incumbent code.

### component-test-harness
`Frontend/vitest.config.js` and `Frontend/tests/setup-components.js` — React JSX/jsdom harness with the existing `@` source alias and explicit Testing Library cleanup after each test. Import test APIs from `vitest`; globals are disabled. Component matching is `src/**/*.test.{js,jsx}`, separate from existing Node and browser tests.
**Added by:** spec 01.

### component-test-commands
`Frontend/package.json` — `npm run test:components -- <file>` runs a scoped component test; `npm test` runs all existing Node contract/data tests followed by all component tests. Existing development, build, lint and browser scripts are preserved.
**Added by:** spec 01.

### markdown-runtime
`Frontend/package.json` — Exact runtime versions `react-markdown@10.1.0` and `remark-gfm@4.0.1`; use these for standard Markdown and GFM rather than creating a parser. Harness dev versions are `vitest@5.1.0`, `@testing-library/react@16.3.3` and `jsdom@29.1.1`.
**Added by:** spec 01.

### harness-proof
`Frontend/src/features/prompt-studio/harness.test.jsx` — Semantic labeled-input and shared Button smoke test, including field interaction, callback delivery and unmount removal. No application API is called.
**Added by:** spec 01.

### assistant-markdown
`Frontend/src/features/prompt-studio/AssistantMarkdown.jsx` — Default export `AssistantMarkdown({ text, withheld = false, expired = false })`. Imports its own scoped `markdown.css`; returns no DOM for absent, non-string, whitespace-only, withheld or expired text. Uses the installed React Markdown/GFM runtime, disables raw HTML, retains the library URL sanitizer, demotes source headings below the page h1, and exposes image descriptions as explicit safe links without rendering image elements.
**Added by:** spec 02.

### response-copy-controls
`Frontend/src/features/prompt-studio/AssistantMarkdown.jsx` — Shared Button controls have stable `Copy response` and `Copy code` names, disable while writing, and announce visible success/failure through polite live regions. Response copy preserves the original source string; code copy preserves the parser's literal code value, including indentation, tabs, trailing spaces and blank lines, without the HTML adapter's added newline. Feedback resets when the response changes and content is removed immediately if retention/policy flags change.
**Added by:** spec 02.

### clipboard-write
`Frontend/src/features/prompt-studio/clipboard.js` — Named `copyText(text)` writes literal text through `navigator.clipboard.writeText`. Missing support and browser rejection propagate to the caller's visible failure state. It does not create hidden text fields or copy rendered HTML.
**Added by:** spec 02.

### markdown-reading-styles
`Frontend/src/features/prompt-studio/markdown.css` — `studio-*` scoped prose, headings, read-only GFM tasks, tables and code; local horizontal overflow and keyboard focus for named code/table regions. Uses incumbent theme aliases and existing Tailwind spacing/type/radius variables, with the approved reading measure and response heading size. Copy actions reach 44px below 600px and honor reduced motion.
**Added by:** spec 02.

### markdown-boundary-tests
`Frontend/src/features/prompt-studio/AssistantMarkdown.test.jsx` — 30 semantic, security and clipboard component tests. Covers Markdown/GFM structure, task immutability, raw HTML, hostile and safe URLs, image fetch prevention, protected content and revocation, malformed fences, original source copying, whitespace-preserving independent code copying, pending writes, failure/retry and unavailable clipboard support. Uses clipboard/DOM seams only, without application APIs.
**Added by:** spec 02.

### policy-notice
`Frontend/src/features/prompt-studio/PolicyNotice.jsx` — Controlled native disclosure for the existing readiness/setup/optional-policy branches. Uses actual group names and the existing permission helper; does not fetch or decide send permissions. Warning and optional-policy guidance is visible; normal context can be expanded.
**Added by:** spec 03.

- `Frontend/src/features/prompt-studio/ChatHistory.jsx` default-exports the controlled `ChatHistory` component with the exact architecture props: `history`, `historyLoading`, `historyError`, `historyUnavailable`, `page`, `busy`, `chat`, `onNewChat`, `onSelect`, `onPageChange`, `onRetry`, `open`, `onOpenChange`, `formatTime`.
- Reuses the existing shadcn `Button` and Radix-backed `Dialog`, `DialogContent`, `DialogTitle`, and `DialogClose`; no new overlay, transport, storage or application state.
- Closed presentation: `aside.studio-history[aria-label="Chat history"]`. Open presentation: portaled `.studio-history.studio-history-drawer.is-open` with title `Chats`, a `Close chats` button, one `.studio-new-chat` and one set of `.studio-history-item` controls. Final responsive styling belongs to spec 06.
- Captures the active element before the drawer takes focus, focuses `Close chats`, and returns focus to the captured element on dismissal. Radix owns Escape, focus trapping and dismissal. Existing page callbacks retain new-chat/selection orchestration.
- Preserves original loading, empty, retry/error, unavailable, retained-history, title/date/count, active selection, busy and pagination behavior and text.
- `Frontend/src/features/prompt-studio/ChatHistory.test.jsx` supplies 10 component tests covering state boundaries, controlled actions, pagination, busy guards, literal titles, one drawer list, Escape, keyboard focus wrapping, close and return focus. Scoped tests passed; the contemporaneous whole suite passed 8 Node tests and 15 component tests across 3 files. Lint passed without errors/warnings; build passed with an informational plugin-timing warning. No browser check ran in this unit.

**Added by:** spec 04, 2026-11-04.

### controlled-composer
`Frontend/src/features/prompt-studio/Composer.jsx` — Default-exported presentation component with the exact architecture contract: `form`, `setForm`, `onSubmit`, `onKeyDown`, `promptRef`, `selected`, `integrations`, `busy`, `loadingChat`, `historyReady`, `historyUnavailable`, `historyLoading`, `policySetupRequired`, `error`, `onRetryHistory`, `chat`, `contextNote`. Keeps application orchestration in the page, raw prompt values and callbacks intact, existing accessible names/selectors, integration-to-first-model reset, required fields and all existing send guards.
**Added by:** spec 05, 2026-11-04.

### compact-generation-settings
`Frontend/src/features/prompt-studio/Composer.jsx` — Uses existing Button and Radix-backed Popover primitives. Labeled generation inputs retain temperature 0–2 with step 0.1 and max tokens 1–8192. Portal inputs associate with `studio-composer-form`; hidden native number controls preserve validity while the popover is unmounted. An invalid closed setting opens Options and focuses/reports the matching visible field without changing its value or calling submission. Local state controls only the popover.
**Added by:** spec 05, 2026-11-04.

### bounded-composer-input
`Frontend/src/features/prompt-studio/Composer.jsx` — Two-row textarea grows and shrinks with controlled prompt changes using the consuming CSS min/max heights; overflowing input scrolls locally. The public `promptRef` still resolves to the textarea for existing page focus behavior. Consumers must retain a finite textarea CSS max-height; visual styling remains owned by spec 06.
**Added by:** spec 05, 2026-11-04.

### composer-unit-proof
`Frontend/src/features/prompt-studio/Composer.test.jsx` — 29 semantic component tests cover prompt limits/ref/names, every send guard, pending/loading controls, raw edits and callback delivery, integration/model changes, popover focus/escape, generation numeric constraints and extrema, invalid closed-settings recovery, history retry/error feedback, and bounded input growth/shrink. No application APIs are called.
**Added by:** spec 05, 2026-11-04.

## Verification

- 2026-11-04: Scoped composer tests passed 29/29. `npm test` passed 8 Node tests and 74 component tests across 5 files in the concurrent workspace. `npm run lint` passed with 0 errors and 0 warnings. `npm run build` passed (2669 modules); Vite reported plugin timing information. Component integration, browser layout/focus review and e2e proof remain assigned to specs 06–07.

### studio-layout
`Frontend/src/pages/workspace.css` — Route-scoped reading layout, bounded transcript scroll, compact composer and responsive history drawer. Keeps mobile controls accessible and preserves the existing app shell and theme tokens.
**Added by:** spec 06.

### studio-boundary-tests
`Frontend/src/features/prompt-studio/PromptStudioPage.test.jsx` — Seven API-boundary component tests for initialization, literal prompts, permitted Markdown, protected/expired output and existing send guards. Uses the real presentation components.
**Added by:** spec 06.

### studio-browser-proof
`Frontend/playwright.studio.config.js` and `Frontend/tests/prompt-studio.spec.js` — Synthetic-API production-preview checks for presentation and preserved workflows. The config builds first; drawer bounds, focus and mobile navigation are checked against compiled CSS. Reuse test:studio when changing this layout.
**Added by:** spec 07.
