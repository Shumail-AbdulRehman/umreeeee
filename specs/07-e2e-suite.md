# Spec 07 — Integrated Prompt Studio proof

**Status:** Done
**Depends on:** Spec 01, Spec 02, Spec 03, Spec 04, Spec 05, Spec 06
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `Frontend/playwright.studio.config.js`, `Frontend/tests/prompt-studio.spec.js`, `Frontend/tests/admin-policy-groups.browser.cjs`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Reuse installed Playwright/axe and existing conversation browser checks. Build and start an isolated Vite preview webServer from config; synthetic API traffic only.

## Scope

Exercise `Frontend/src/pages/PromptStudioPage.jsx`, `Frontend/src/pages/workspace.css` and `Frontend/src/components/PageTitle.jsx` as the integrated page.

- Exercise every flow in the table below with semantic locators, traces/screenshots on failure, desktop/laptop/tablet/mobile, and no page/console errors.
- Verify Markdown rendering/copy/security, plain prompts, protected/expired outputs, model controls/options, policy states, history/retry/follow-ups and existing request-key behavior.
- Fix test errors only; log any application bug as a bounded fix unit rather than silently widening this spec.

## Explicit non-scope

- Clean whole-suite verification and final inventory folding → spec 08.

## Reuse first

- Read the cited inventory and approved screen before creating components.
- Preserve the existing transport, permission helpers and controlled component contracts.
- Use the declared local shadcn foundation; do not add another parser/overlay/state system.

## Steps

1. Inspect owned paths and upstream artifacts against the real tree.
2. Record or verify only the bounded responsibilities above.
3. Save reuse entries in this unit’s fragment where applicable; record evidence and limitations.

## Done when

- [x] `npx playwright test --config playwright.studio.config.js` passes every declared flow with intercepted API fixtures. [e2e]
- [x] Existing conversation and admin-policy/group browser scripts pass with UI_TEST_URL set to the configured local server. [e2e]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Flow table

| Flow | Built by | Proves |
| --- | --- | --- |
| Structured Markdown, tables, code, malformed input and safe links | 02, 06 | Visible semantic content and bounded overflow |
| Original-response/code clipboard and rejection | 02, 06 | Exact source and actionable feedback |
| Plain prompts, blocked/withheld/expired/check errors | 02, 03, 06 | No unchecked or expired content leak |
| Empty/loading/history recovery, page/switch/older messages | 04, 06 | Current data/actions and stale-response guards |
| Submit/follow-up/retry/reload/idempotency | 05, 06 | Existing state and API behavior |
| Generation options/provider/model and readiness guards | 03, 05, 06 | Valid controls and no unauthorized/premature send |
| Mobile history/focus/Escape, zoom/long content | 04, 05, 06 | Accessible and responsive composition |

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- **2026-11-04**: Implemented the isolated Vite/Playwright suite with synthetic API interception. All 15 tests pass after a clean install (54.0s), including both incumbent conversation and administrator policy/group scripts. Four viewport sizes (1440, 1280, 768, 390 CSS pixels) pass eight axe scans with no detected violations; mobile dialog focus/Escape and generation popovers work. Markdown copy uses exact source/code, no remote image fetch occurs, protected/expired content stays hidden, and existing request payload/idempotency/history guards pass. Desktop and mobile screenshots were visually reviewed. No browser JavaScript exceptions were recorded. Lint and production build pass.
- **2026-11-04**: Updated only the incumbent admin test interaction to expand the new normal policy disclosure before its unchanged group assertion. Initial test failure correctly identified hidden details; the policy content and assertion were preserved. The bounded list-marker CSS correction belongs to spec 02 and is recorded there. No orchestration/backend fix was needed.
- **2026-11-04**: Production-preview audit exposed the drawer translate interaction missed by development-only checks. The bounded fix is in spec 04; browser config now builds and serves production assets, with mobile drawer bounds asserted before Escape/focus checks. The first passing development run is retained as evidence, not substituted for the pending production rerun.
- **2026-11-04**: Final production rerun passes all 15 cases in 55.1s, including both legacy workflow scripts and explicit mobile drawer bounds. Separate complete three-script workflows also pass against production preview. The development-only result is superseded by this production evidence.
