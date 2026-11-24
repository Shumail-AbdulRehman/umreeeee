# Red Team on promptfoo — progress tracker

Planning status only. `Done` means verified and accepted (00 is a recorded decision); `Not started` means no accepted implementation. Coders append their own spec logs; the lead maintains this table.

| Spec | Unit | Status |
| --- | --- | --- |
| 00 | Planner decisions | Done |
| 01 | Runtime and Heroku setup | Done |
| 02 | Plugin and strategy catalog | Done |
| 03 | Framework compliance (scheduler frameworks) | Done |
| 04 | Config and environment builder (port of create_yaml) | Done |
| 05 | Results parser (scheduler row rules) | Done |
| 06 | Report aggregation (scheduler aggregation) | Done |
| 07 | Frontend client service and labels | Done |
| 08 | Bridge provider (protected mode) | Done |
| 09 | Bridge server (protected mode) | Done |
| 10 | Runner (port of run_redteam) | Done |
| 11 | Test editor and config preview | Done |
| 12 | Test list and run progress | Done |
| 13 | Report summary, plugin table and strategy breakdown | Done |
| 14 | Compliance tabs | Done |
| 15 | Results table and case details | Done |
| 16 | Service, schemas, routes, indexes, config preview | Done |
| 17 | Worker and recovery (port of callback_func) | Done |
| 18 | Red Team page integration | Done |
| 19 | Archive legacy data and remove old engine | Done |
| 20 | End-to-end suite | Done |
| 21 | Verification pass and live smoke | In progress |

## Log

- **2026-11-22**: Recorded the planner's decisions and drafted 01–21, steering docs and the dependency graph.

- **2026-11-22**: Planner review: revised specs 01–21, README and AGENT-GUIDE. Spec 10 depends on 05; spec 16 on 01. Validator: 0 errors.

- **2026-11-22**: Specs 05 and 07 implemented by Codex (gpt-6.2-sol, high) and verified by Claude: parser tests 37, backend unit 522; frontend 227, lint clean.

- **2026-11-22**: Spec 01 implemented and verified: promptfoo 0.126.0 pinned at the root, runtime checker with 8 tests, backend unit 530, deployment docs updated.

- **2026-11-22**: Codex batch 2. Done (verified by Claude): 03 (12 tests; backend 542), 12 (38 tests). Known transient failure: RedTeamPage.test.jsx expects old progress copy; spec 18 owns it.

- **2026-11-22**: Specs 13, 14, 15 implemented by Codex (high) and checked by Claude: frontend 288 passed (1 known spec-18 page failure), lint clean.

- **2026-11-22**: Specs 02 (read-only catalog metadata) and 06 (report aggregation) implemented by Codex and checked by Claude: focused 49 passed, backend unit 591, compile clean.

- **2026-11-22**: Planner (Claude) redesign on the owner's scheduler (`scheduler_umr`) and the supervisor's flow (UI-built config → `promptfoo redteam run` → JSON converted to our report → UI). Research: `docs/research/scheduler-reuse.md`. Rewrote 00, 03, 04, 05, 06, 08, 09, 10, 16, 17, ARCHITECTURE, README; patched 01, 07, 11, 18, 20, 21, AGENT-GUIDE, DESIGN-SYSTEM, INVENTORY. Reopened 03, 05, 06 (from-scratch versions replaced by scheduler ports keeping the report payload) and 07 (config-preview client addendum). 04 and 08 back to Not started: the committed local-fixture code (`26ac31e`, `11d6ff8`) and the untracked fixture runner do not meet their specs. Codex implements every open spec; Claude reviews and runs spec 21's live smoke. Ready now: 03, 04, 05, 07, 08.

- **2026-11-23**: Implemented 09–11 and 16–20 as the binding Promptfoo specs require. Replaced the per-case worker with one leased Promptfoo run, added bridge/runner/config preview/API/import/recovery, removed the inventoried in-house engine, and added a dry-run-first guarded archive. Verification: backend unit **481 passed** (25.67 s); frontend **298 passed** (16.24 s); Red Team Playwright **9 passed** (38.8 s); compile, archive py_compile, lint, build and spec validation passed (**0 errors, 52 documented warnings**). Promptfoo runtime: 0.126.0, Node 24, Cloud key configured. Mongo-gated API/worker/pipeline tests: **4 skipped** because `TEST_MONGODB_URL` and a `test_*` database were not configured. Live smoke was not run: RabbitMQ, API, dispatcher, worker and recovery were not running, so its criterion remains open. No legacy archive apply was run.

- **2026-11-23**: Completed the previously gated Mongo acceptance against temporary transaction-backed `test_*` databases. API (2), worker/recovery (2), and full fake-binary pipeline (1) passed; the focused backend selection was **26 passed** in 79.73 s. The real bridge exposed and verified numeric Promptfoo cost normalization. Specs 16, 17 and 20 are Done. Only spec 21 remains open for clean-install repetition and the live RabbitMQ/API raw-plus-protected smoke.

- **2026-11-24**: Fixed audit findings in 04, 16, 17, 18 and 20. Suite-backed drafts preserve their generation settings and preview the stored suite without filesystem paths or case text. The worker records the source and version, enforces the 5 MB suite cap, preserves final progress, and closes interrupted jobs with an attached suite. Retention now includes Promptfoo cases. Backend unit tests passed (496), frontend tests passed (298), and Chromium acceptance passed (12). Lint, build, and compile passed. Five Mongo acceptance tests skipped without a configured test replica set. The live smoke remains open under spec 21.
