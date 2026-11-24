# Spec 20 — End-to-end suite

**Status:** Done
**Depends on:** 01-19
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `Frontend/tests/red-team.spec.js`, `Frontend/tests/fixtures/red-team-api.js`, `Frontend/playwright.redteam.config.js`, `backend/tests/integration/test_red_team_promptfoo_pipeline.py`, `specs-promptfoo/inventory/20-e2e-suite.md`
**Reuses:** `Frontend/tests/red-team.spec.js`, `Frontend/tests/fixtures/red-team-api.js`, `Frontend/playwright.redteam.config.js`, `backend/tests/integration/conftest.py`, `backend/tests/fixtures/fake_promptfoo.py`

## Goal

Prove every user-visible flow (draft, launch, running, report, cancel, clone) in the browser with intercepted APIs, and the backend pipeline end to end with the fake promptfoo through Mongo and the real bridge.

## Scope

| Flow | Boundary | Binary expectation |
| --- | --- | --- |
| Draft create/edit | 07, 11, 16, 18 | Select plugin metadata, strategies, protected subject and grader; estimate, save and reopen with values, missing grader and cap rejected. |
| Config preview | 04, 07, 11, 16, 18 | Editing plugins and refreshing shows the redacted promptfoo YAML from the intercepted preview route (plugins, strategies, purpose present; no key text); a preview failure shows its error. |
| Launch and run | 01, 07, 11, 12, 16, 17, 18 | Launch sends one request with an Idempotency-Key; the page shows Generating test cases → Running test cases n/N → report; when capabilities report promptfoo unavailable the launch button is disabled with the reason. |
| Generating → running → report | 10, 12, 16–18 | Intercepted API transitions seeded fixture states; provisional progress is shown, final report/results wait for their reads. |
| Cancel | 12, 16–18 | Confirm asks once and preserves committed rows; dismiss makes no request, terminal view does not poll. |
| Clone as protected | 06, 11, 16–18 | New draft retains same scoped suite/group, uses protected mode, and its launch evaluates the stored suite (`redteam eval`) without a generate step. Paired results can be viewed from a seeded same-suite pair. |
| Report filters and result detail | 05, 13, 15, 16, 18 | Plugin/strategy/source filter narrows data; open detail, see policy/grader evidence and expired content fallback, close and recover focus. |
| Failed `no_tests_generated` | 10, 15, 17, 18 | A zero-case fake fixture is a terminal failure; no success score; specific recovery copy and a clone-to-retry action. |
| Compliance | 02, 03, 06, 14, 18 | All nine scheduler frameworks, keyboard tab navigation, status reasons, no certification claim. |
| Export | 07, 16, 18 | JSON and CSV controls produce intercepted downloads; API fixture verifies report filters and formula-safe cells. |
| Tenant and execution fences | 08–10, 16, 17, 19 | Other-company reads are denied before decrypting; malformed broker input and unexpected payloads cannot execute; a repeated bridge call with the same idempotency key does not execute twice. |

- Intercept every API call, error on unexpected routes or external network, and use harmless fixtures only. Bootstrap the existing browser auth fixture; use role/text locators and wait on visible/observable state instead of sleep. Keep the existing axe coverage at desktop and narrow viewports and add reduced-motion keyboard checks on the report and detail.
- Backend pipeline runs the worker's `process_job` with `fake_promptfoo.py` as the binary through replica-set Mongo: a raw test (`redteam run`, built-in target faked) then its protected clone (`redteam eval` on the stored suite, real bridge, fake protected service); assert the key-free stored suite, parsed rows, encrypted test prompts and replies, retention, lease fencing, no generation for the clone and the paired report. No RabbitMQ, real promptfoo or providers.

## Explicit non-scope

- Final clean-install suite and verification inventory roll-up → spec 21.
- Fixing failing product code in the suite PR (route/service → spec 16; worker → spec 17; page wiring → spec 18).

## Reuse first

- Extend existing `playwright.redteam.config.js`, `red-team.spec.js` and intercepted API fixture; do not add another browser harness. Use `test_database` and spec 10's fixed fake; use artifact envelopes from `docs/research/promptfoo-integration.md` §3, with synthetic content only.
- Exercise `RedTeamPage.jsx` and `useRedTeamTest.js` as a user would; cover state recovery through `backend/app/queue/recovery.py` on fixture data. Keep Chromium, existing local `webServer` and `baseURL`, and retain trace/screenshot on failure (enable if absent).

## Steps

1. Align fixtures and mock state transitions with the service contract for every row. Fail on unexpected network calls.
2. Implement browser cases and the Mongo fixture pipeline. Prove neither surface can send a live request to a provider or generator.
3. Run both acceptance pieces and record counts. For a product failure leave the criterion unticked and report it to the owner; do not patch product code here.

## Done when

- [ ] `cd Frontend && npm run test:red-team` passes every browser flow row with unexpected network denied. [e2e]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/integration/test_red_team_promptfoo_pipeline.py` passes using only the fixed fake and replica-set fixture. [e2e] [requires: MongoDB replica set]
- [ ] From `backend/`, `.venv/bin/python -m pytest -q tests/unit`, and from `Frontend/`, `npx vitest run`, pass; log both counts. [unit]
- [ ] From `backend/`, `.venv/bin/python -m compileall -q app`, and from `Frontend/`, `npm run lint`, pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-23:** Intercepted Chromium suite: 9 passed in 38.8 s; backend unit: 481 passed; frontend: 298 passed; compile, lint and build passed. Mongo fake-binary pipeline remains unobserved because the isolated replica-set environment was not configured.
- **2026-11-23:** Transaction-backed fake-binary pipeline passed (1 test): raw generation and protected clone evaluation used the real bridge, reused one key-free suite, retained encrypted content, and produced a paired report without an external provider call.
