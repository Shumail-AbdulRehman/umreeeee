# Prompt Studio analysis and intended boundary

Date: 2026-11-04. Scope is this page and its assistant-message presentation.

## Current facts

| Concern | Grounded source | Finding |
| --- | --- | --- |
| Raw Markdown | Frontend/src/pages/PromptStudioPage.jsx, RunDetail | response_text is inside a plain p element; Markdown markers are preserved literally. |
| Protected output | Same RunDetail | Rendering checks response_text != null and !response_withheld. Keep these gates before rich rendering and clipboard access. |
| Policy states | Same page, policy banner and Findings | Existing required/optional/no-policy/not-ready states and recorded reasons must remain distinct. A validator error is not a policy match. |
| Chat behavior | Same page, submit/show/poll/loadOlder | Existing generation fences, one-submission ref, idempotency-key reuse, pending prompt, draft preservation, history retry and polling are behavior boundaries, not redesign targets. |
| Large composer | Frontend/src/pages/workspace.css | Min-height, labels, two control rows and multiple notes leave less space for the transcript. |
| Duplicate actions | PromptStudioPage.jsx markup | New chat appears in history heading, full history button and workspace heading. Target one obvious visible action at each breakpoint. |
| Responsive history | Same page, historyOpen | Current overlay/inert/focus/Escape treatment should reuse the existing shadcn Dialog primitive when the mobile presentation is rebuilt, keeping the same history data/actions. |
| Response details | Findings and security details disclosure | Preserve recorded matches/errors, role gating, usage, pricing and latency. Keep technical detail available without competing with normal reading. |
| Existing tests | Frontend/tests/conversations.browser.cjs | Regression coverage already exists for old-backend failure, idempotency, draft/history recovery, grouping, follow-ups, blocked/validation states, new chat and mobile history. |

## Design intent

Preserve Averiq’s fixed identity and global shell. Reduce repeated page/section labels and duplicate actions. Treat the conversation as a reading surface, with a 72ch maximum prose measure, purposeful headings, readable list spacing and bounded local code/table overflow. Keep the composer reachable and compact without replacing its controls or submission rules. Present actual provider/model selection and a truthful compact policy disclosure.

## Planned Markdown boundary

Render only authorized assistant response_text as structured Markdown. Preserve original source; never mutate stored replies or send modified system prompts to make rendering work. Keep user prompts literal. Use a standard parser and the default safe URL transform; reject executable raw HTML and avoid external image auto-loading. Support CommonMark and GFM; postpone math, diagrams, syntax highlighting and streaming unless requested later. Markdown-to-React rendering tests must include semantic blocks, raw HTML/unsafe URLs, malformed/incomplete fences, very long unbroken content, copy failures, withheld output and expiry.

## Draft unit boundaries, subject to v3 approval

1. Record the presentation-only decision and test/runtime choices.
2. Set up only the renderer/testing dependencies and fixture contracts.
3. Build a safe, independently tested assistant Markdown presentation component.
4. Build the scoped responsive conversation/history/composer styles from approved v3, keeping shared/global files untouched where possible.
5. Integrate presentation into the current page, retaining all request/state transitions and protective guards.
6. One end-to-end regression spec exercises the complete page, the existing flows and accessibility/responsiveness.
7. One final verification spec runs both suites, lint/build and a source/API-permission duplication review.

This is a raw split, not runner-ready specs. Final dependencies and ownership must be resolved after the design is approved, especially ownership of package manifests, PromptStudioPage.jsx and workspace.css. No implementation code is introduced by this planning pass.
