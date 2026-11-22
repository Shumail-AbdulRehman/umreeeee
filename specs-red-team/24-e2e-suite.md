# Spec 24 — Red Team end-to-end suite

**Status:** Done
**Depends on:** 01-23
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `Frontend/package.json`, `Frontend/playwright.redteam.config.js`, `Frontend/tests/red-team.spec.js`, `Frontend/tests/fixtures/red-team-api.js`, `backend/tests/integration/test_red_team_v3_pipeline.py`
**Reuses:** `Frontend/playwright.studio.config.js`, `Frontend/tests/prompt-studio.spec.js`, `backend/tests/integration/test_red_team_flow.py`, `design/red-team/v3/report.html`

## Goal

Prove every Red Team capability integrated: the built app in a real browser against intercepted synthetic APIs, and the backend pipeline from launch to report through the real dispatcher and worker code with fake providers.

## Scope

**Browser harness.** Copy the Prompt Studio pattern: build, serve the production preview from the config's `webServer`, `baseURL`, Chromium via `/usr/bin/google-chrome`, trace and screenshot on failure, all `/api` traffic answered by `tests/fixtures/red-team-api.js` (synthetic data only, no provider). Add `test:red-team` to `Frontend/package.json` scripts (the only edit to that file in this set). Role- and text-based locators; axe scans at 1440 and 390 on list, editor, running and report with the dialog open.

**Backend pipeline.** One integration test that creates a v3 draft, launches it, runs `dispatch_once` with a fake publisher and `process_job` with fake target and judge providers for every job, then reads the report and results through the service: risk, compliance and threshold present; judged and exact sources both present; export contains the new columns.

| Flow | Built by | Proves |
| --- | --- | --- |
| Empty list, not-ready strip, create a test | 13, 21 | First run is guided; launch waits honestly |
| Editor: plugins, strategies, judge, limits, Advanced | 07, 14, 21 | Over-100 and zero-plugin block launch; values sent match the contract |
| Save draft, reopen, launch with idempotency | 08, 14, 21, 22 | Draft persists; one launch per key; polling starts after launch |
| Running view and cancel confirmation | 15, 21 | Consequences listed; Keep running; cancel once |
| Report: risk compare, attack success, threshold | 12, 16, 21 | Raw vs protected numbers and trend render from the API |
| Plugin and strategy breakdown | 12, 16 | Sorted risk, with-policies column |
| Compliance tabs | 04, 12, 17 | Keyboard tabs; failed first; not-tested reasons |
| Results filters and attack dialog | 11, 18, 20, 21 | Unsafe filter; judged label; decoded reply; same attack with policies |
| Cancelled, failed, no-judge, earlier-format reports | 19, 21 | Each state's banner and action |
| Export JSON and CSV | 20, 21, 22 | Downloads carry the new columns |
| Mobile 390 px: list, report, dialog | 06, 13, 16, 18 | No page overflow; stacked tables; 44 px targets |
| Pipeline: launch → dispatch → worker → judge → report | 10, 11, 12, 20, 22, 23 | Real code path end to end with fake providers |

## Explicit non-scope

- Fixing application bugs found by these tests; each becomes a new numbered fix spec recorded in README and PROGRESS, and its closure is checked by → spec 25.
- Clean-install whole-suite runs → spec 25.

## Steps

1. Write the API fixtures from the approved sample numbers and the `ARCHITECTURE.md` contract.
2. Write one browser test per flow row and the pipeline test.
3. Run them; record counts; file fix specs for app bugs.

## Done when

- [x] `npm run test:red-team` passes headless with 0 failures; the real count is in the Log. [e2e]
- [x] `TEST_MONGODB_URL=… .venv/bin/python -m pytest -q tests/integration/test_red_team_v3_pipeline.py` passes. [requires: MongoDB replica set]
- [x] Every flow row has at least one named test in the Log, and every app bug found has a fix spec number. [static]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes. [static]


## Log

- **2026-11-14**: Per the user's explicit instruction, application bugs are fixed directly in their owning files and noted in the owning spec Log, instead of opening additional fix specs. Pipeline regression found cancelled risk/compliance (owner spec 12); corrected aggregator, paired risk and trend handling, and its unit regression. Real pipeline rerun: 1 passed (75.28 s); backend unit 452 passed.
- **2026-11-14**: First Chrome run exposed skipped-step contrast 3.68:1 in the attack dialog (owner spec 18); removed opacity reduction. Harness corrections: click the visible radio label; use the Evidence combobox role; legacy report fixture omits v3 pairing. No tests disabled or axe rules excluded. Full rerun follows.

- **2026-11-14**: Mobile visual/geometry checks exposed 38px New test targets and table cell wrapping (owner 06), overlapping compliance names/badges (owner 17 with stylesheet owner 06), and raw worst-strategy IDs (owner 16). Corrected in owning files, with label and geometry regressions. The one transient preview 404 came from a concurrent build replacing dist; subsequent browser runs are serialized with builds.

- **2026-11-14**: Geometry and axe regressions now pass at 1440 and 390px, including both dialogs. Qualified the progressbar locator with its accessible name to distinguish the attack progress from the shell loading indicator. Mechanical detector reports no findings on changed feature files. Frontend component 210 + Node 8 passed; lint clean.

- **2026-11-14 flow coverage**: Empty/not-ready/create → `empty list, not-ready strip and new test guidance`; editor controls/limits/Advanced → `editor plugins, strategies, judge, limits and Advanced send the contract`; persistence/idempotency/polling → `save draft, reopen, ambiguous launch retries reuse key and start polling`; progress/cancel → `running view cancel consequences, keep running and cancel once`; risk/compare/threshold/trend → `report risk comparison, attack success, threshold and trend use API figures`; breakdowns → `plugin risk ordering and strategy breakdown preserve API order`; frameworks → `compliance keyboard tabs, failed evidence and untested reasons`; results/details → `result filters, decoded evidence, judged label, pairing and dialog focus`; report states → four named cancelled/failed/nojudge/legacy tests; export → `JSON and CSV downloads contain v3 columns`; mobile → `list editor running report and dialog accessibility 390px` (also 1440px); pipeline → `test_v3_pipeline_dispatch_grade_judge_report_and_exports`. Two additional retention tests prove withheld/expired replies are hidden.

- **2026-11-14**: Extended the real pipeline with one target rate-limit retry. It exposed 7 displayed model calls for 8 dispatches (owner spec 22); fixed the read-side metadata to sum attempt_number. Target response still dispatched only as permitted by the legacy rate-limit path; uncertain calls are never retried.

- **2026-11-14 final verification**: Chrome 17 passed (including 1440/390px axe with zero violations and all visible Red Team button/select/summary targets at least 44px); Mongo pipeline 1 passed (73.42 s), backend unit 452 passed, frontend component 210 + Node 8 passed; compile, lint (0 errors/warnings), build passed. No test_* databases remain. Direct owning-spec fixes, authorized by the user, are logged under 06, 12, 16, 17, 18, 21 and 22; no new fix specs opened. No live model, judge, broker or deploy performed.

- **2026-11-14**: Independent review added browser regressions for legacy clone/category save/launch and for paired raw labels in protected reports/dialogs; fixtures now include the real legacy fields, category capabilities, and opposite-mode pairing. Browser suite 19 passed (the original 17 remain), with desktop/mobile axe checks and no page errors. Existing pipeline passed after recovery changes. No live providers, judges or RabbitMQ calls.
