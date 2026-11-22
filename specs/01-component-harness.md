# Spec 01 — Component harness and Markdown dependencies

**Status:** Done
**Depends on:** Spec 00
**Model:** Light — `claude-haiku-5-5` · `gpt-6-luna` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `Frontend/package.json`, `Frontend/package-lock.json`, `Frontend/vitest.config.js`, `Frontend/tests/setup-components.js`, `Frontend/src/features/prompt-studio/harness.test.jsx`, `Frontend/eslint.config.js`, `Frontend/.gitignore`, `specs/inventory/01-component-harness.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Add the verified Markdown runtime packages and Vite-compatible component test dependencies only.

## Scope

- Preserve existing scripts; make npm test include both Node contract/data and component suites. Provide test:components for one-file Vitest runs.
- Configure jsdom, JSX transformation, cleanup, alias resolution and isolated test matching. Keep production Vite/deployment config unchanged.
- Prove the harness with a labeled semantic control and clean up test artifacts.

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

- [x] `npm run test:components -- src/features/prompt-studio/harness.test.jsx` passes the behaviors above with boundary mocks and semantic assertions. [unit]
- [x] `npm test` passes all existing Node and component units with real counts recorded. [unit]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- 2026-11-04: Implemented the isolated React/jsdom Vitest config, explicit Testing Library cleanup and `@` alias, a labeled input/shared Button interaction smoke test, all-unit/scoped commands, and test artifact ignores. Existing scripts are preserved; the ESLint config already accepts the imported test APIs and needed no change. Added reuse records in `inventory/01-component-harness.md`. Production Vite config, application/services/backend sources and browser scripts were not edited.
- 2026-11-04: Queried npm registry versions/engines/peers against installed Node v24.14.1, npm 11.11.0, Vite 8.0.10 and React 19.2.5. Installed exact runtime `react-markdown@10.1.0`, `remark-gfm@4.0.1` and dev `vitest@5.1.0`, `@testing-library/react@16.3.3`, `jsdom@29.1.1`. Latest jsdom 30.1.3 requires Node >=24.15.0 on this major; selected 29.1.1 supports >=24.0.0. `npm ls` verified installed dependency versions and Testing Library's DOM peer 10.4.2. Installation reported 15 audit findings (1 low, 7 moderate, 7 high); no unrelated dependency remediation was attempted.
- 2026-11-04: Verification passed: scoped harness command — 1 file, 1 test; `npm test` — 8 existing Node tests plus 1 component test, zero failures; `npm run lint` — exit 0 with no errors or warnings; `npm run build` — exit 0, 2669 modules, built in 4.56s. Build emitted the existing plugin timing advisory (@rolldown/plugin-babel 66%); no production config change was needed. No e2e command ran in this unit. Tracker/status updates remain with the lead.
- **2026-11-04**: Lead added the test:studio script for the spec 07 browser config. Final integrated verification passes 8 existing Node tests and 81 component tests in 6 files; lint exits 0 without warnings; production build passes. Manifest changes remain within this unit.
