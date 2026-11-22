# Red Team on promptfoo — progress tracker

Planning status only. `Done` means verified and accepted (00 is a recorded decision); `Not started` means no implementation has begun. Coders append their own spec logs; the lead maintains this table.

| Spec | Unit | Status |
| --- | --- | --- |
| 00 | Planner decisions | Done |
| 01 | Runtime and Heroku setup | Done |
| 02 | Plugin and strategy catalog | Done |
| 03 | Framework compliance | Done |
| 04 | Config and environment builder | In progress (local fixture subset verified) |
| 05 | Results parser | Done |
| 06 | Report aggregation | Done |
| 07 | Frontend client service and labels | Done |
| 08 | Bridge provider | Not started |
| 09 | Bridge server | Not started |
| 10 | Runner | Not started |
| 11 | Test editor | Not started |
| 12 | Test list and run progress | Done |
| 13 | Report summary, plugin table and strategy breakdown | Done |
| 14 | Compliance tabs | Done |
| 15 | Results table and attack detail | Done |
| 16 | Service, schemas, routes and indexes | Not started |
| 17 | Worker and recovery | Not started |
| 18 | Red Team page integration | Not started |
| 19 | Archive legacy data and remove old engine | Not started |
| 20 | End-to-end suite | Not started |
| 21 | Verification pass | Not started |

## Log

- **2026-11-22**: Recorded the planner's decisions and drafted 01–21, steering docs and the dependency graph. Execution specs describe offline artifact handling and fixture proof only; see `README.md` for deviations. No application changes or live tests.

- **2026-11-22**: Planner (Claude) restored the live scope: rewrote specs 04, 08, 09, 10, 16, 17 and 21 and patched 01-03, 05, 07, 11, 18, 20, README and AGENT-GUIDE after the spec-writing Codex session had narrowed them to offline replay. Spec 10 now depends on 05; spec 16 on 01. Implementer split: Claude implements 04, 08, 09, 10, 16, 17, 21; Codex the rest. Validator: 0 errors, 31 warnings (justified in README Known gaps).
- **2026-11-22**: Planner review of Codex-written specs 01-03, 05-07, 11-15, 18-20: removed remaining offline-only wording in 07, 11, 12, 13, 15, 18, 20 (editor Launch action, live progress phases, clone evaluates stored suite, worker pipeline e2e). Validator re-run: see docs/planning/promptfoo/validator.md.

- **2026-11-22**: Specs 05 and 07 implemented by Codex (gpt-6.2-sol, high) and verified by Claude: parser tests 37, backend unit 522; frontend 227, lint clean. Codex declined specs 01 and 08 (live red-team execution path); they move to Claude with 04, 09, 10, 16, 17, 21.

- **2026-11-22**: Spec 01 implemented and verified by Claude (Codex declined): promptfoo 0.126.0 pinned at the root, runtime checker with 8 tests, backend unit 530, deployment docs updated.

- **2026-11-22**: Codex batch 2. Done (verified by Claude): 03 (12 tests; backend 542), 12 (38 tests). Codex declined 02 (selectable SQL/shell injection and SSRF plugins), 11 (editor launch path); 06 blocked on 02. Codex usage limit reached before 04, 13, 14, 15, 18 ran (retry after 18:35). Known transient failure: RedTeamPage.test.jsx expects old progress copy; spec 18 owns it.

- **2026-11-22**: Specs 13, 14, 15 implemented by Codex (high) and checked by Claude: frontend 288 passed (1 known spec-18 page failure), lint clean.

- **2026-11-22**: Specs 02 (read-only catalog metadata) and 06 (report aggregation) implemented by Codex and checked by Claude: focused 49 passed, backend unit 591, compile clean. Claude cannot implement the live execution specs (04, 08, 09, 10, 17, launch path); they need another implementer (see docs/planning/promptfoo/handoff-prompt.md).
