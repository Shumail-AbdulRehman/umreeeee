# Red Team v3 progress

| # | Spec | Status | Depends on | Model | Issue | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | [Red Team v3 decisions](00-red-team-decisions.md) | Done | — | Heavy | — | Recorded at planning |
| 01 | [Plugin and control catalog v3](01-plugin-catalog.md) | Done | 00 | Standard | — | Lead-verified: 21 tests, unit suite 122 |
| 02 | [Strategy transforms and reply decoders](02-strategy-transforms.md) | Done | 00 | Standard | — | Lead-verified: 24 tests; decode probe |
| 03 | [Risk scoring model](03-risk-scoring.md) | Done | 00 | Standard | — | Lead-verified: 176 tests; numbers recomputed |
| 04 | [Framework mapping and compliance status](04-framework-mapping.md) | Done | 00 | Standard | — | Lead-verified: 14 tests; harmful scope fixed |
| 05 | [Judge prompt builder and verdict parser](05-judge-prompt.md) | Done | 00 | Standard | — | Lead-verified: 32 tests; injection probes |
| 06 | [Red Team feature folder, styles and labels](06-frontend-foundation.md) | Done | 00 | Light | — | Lead-verified: labels probe; no raw colours |
| 07 | [Editor summary calculations](07-editor-summary.md) | Done | 00 | Light | — | Lead-verified: 10 tests |
| 08 | [Red Team client service and polling fix](08-client-service-and-polling.md) | Done | 00 | Standard | — | Lead-verified: 17 tests; page untouched |
| 09 | [Continuous recovery process](09-recovery-process.md) | Done | 00 | Light | — | Lead-verified: Procfiles, deploy doc, import |
| 10 | [Plugin manifest builder v3](10-manifest-v3.md) | Done | 01, 02 | Standard | — | Lead-verified: 14 tests; real-row probes |
| 11 | [Strategy-aware exact-evidence grader](11-evidence-grader.md) | Done | 01, 02 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 12 | [Report aggregation v3](12-report-aggregation.md) | Done | 01, 03, 04 | Heavy | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 13 | [Test list component](13-test-list.md) | Done | 06 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 14 | [Test editor component](14-test-editor.md) | Done | 06, 07 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 15 | [Running test view and cancel confirmation](15-run-progress.md) | Done | 06 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 16 | [Report summary, plugin table and strategy breakdown](16-report-summary.md) | Done | 06 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 17 | [Compliance coverage tabs](17-compliance-tabs.md) | Done | 06 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 18 | [Results table and attack detail dialog](18-results-and-attack-detail.md) | Done | 06 | Standard | — |  Radix focus fix; 421 backend, 195 + 8 frontend |
| 19 | [Report states and legacy report](19-report-states.md) | Done | 06 | Standard | — |  Lead-verified: backend 421, frontend 194; lint/build pass |
| 20 | [Report, results and export queries v3](20-report-queries.md) | Done | 02, 12 | Heavy | — |  Queries verified; unit 434, integration 1 |
| 21 | [Red Team page integration](21-page-integration.md) | Done | 08, 13, 14, 15, 16, 17, 18, 19 | Heavy | — | Page 15; backend 434; frontend 210 + 8; static checks pass |
| 22 | [Red Team service and API v3](22-service-and-api.md) | Done | 04, 10, 20 | Heavy | — | Schemas 18; Mongo API 1; backend 452; frontend 210 + 8 |
| 23 | [Worker grading and judge phase](23-worker-judge-phase.md) | Done | 05, 11, 22 | Heavy | — | Mongo worker 4; backend 452; frontend 210 + 8; static checks pass |
| 24 | [Red Team end-to-end suite](24-e2e-suite.md) | Done | 01-23 | Heavy | — | Chrome 17; Mongo pipeline 1; backend 452; frontend 210 + 8 |
| 25 | [Red Team verification pass](25-verification-pass.md) | Done | 00-24 | Heavy | — | Unit 452; Mongo retry 114; frontend 210 + 8; browser 17 + 15; validator 0 errors; DNS failure retained in Log |

## Log

- **2026-11-11**: Design v3 approved by the user. Spec set written from the approved design, the code and dated research. No application code changed; implementation starts only on an explicit request.
- **2026-11-11**: User chose the existing MongoDB server for tests. Probe: replica set, transactions and create/drop of a throwaway database work. Baseline: `tests/integration/test_red_team_flow.py` 11 passed (169 s) with `TEST_MONGODB_DB_NAME=test_`; no leftover test database. A longer prefix fails on Atlas's 38-byte name limit.
- **2026-11-11**: Spec 01 Done after lead review. Fixes requested and verified: tool templates no longer contain `[[call` syntax; `basic` named Plain. Lead re-run: spec tests 21 passed, unit suite 122 passed, compile clean; only Owns files changed. Plan clarified tool_call evidence in specs 10, 11 and ARCHITECTURE.
- **2026-11-11**: Spec 09 Done after lead review: recovery line added to both Procfiles with existing lines unchanged; DEPLOYMENT.md Red Team section and scale command updated; recovery module imports.
- **2026-11-11**: Spec 05 Done after lead review: re-ran 32 tests; probed forged delimiters (neutralised), prose-wrapped JSON and wrong-case verdicts (rejected). Extra JSON keys are tolerated; acceptable.
- **2026-11-11**: Spec 02 Done after lead review: 24 tests re-run; base64-hidden marker found via decoded_variants; garbage input safe. Note for spec 11: leetspeak-reversed variant rewrites digits, so grade raw and every variant by substring.
- **2026-11-11**: Spec 03 Done after lead review: 176 tests re-run; 7.93 example, zero-success 0/none, system penalty and cap recomputed independently.
- **2026-11-11**: Spec 06 Done after lead review: labels produce 'Unsafe · judged', 'Answered', 'Running · 46%', 'Not scored'; no raw colour literals in red-team.css. Build ran as isolated vite build because of concurrent sessions.
- **2026-11-11**: Spec 07 Done after lead review: editor summary tests re-run (part of 27 targeted tests passing); isolated build.
- **2026-11-11**: Spec 08 Done after lead review: service and hook tests re-run; npm test 132 passed; lint clean; build passed; RedTeamPage.jsx unchanged.
- **2026-11-11**: Spec 04 Done after lead review: removed over-broad harmful mappings (NIST 2.7, 2.11, EU Annex III-7); harmful now maps only to NIST 2.6, ATLAS Resource Development and Impact; ATLAS ids null until verified. Mapped: OWASP 5/10, ATLAS 6/16, NIST 18/21, EU 12/14.
- **2026-11-11**: Spec 10 Done after lead review: deterministic 96+5 rows, no non-tool marker in sent prompts, all placeholders filled, failure_marker set per evidence type; unit suite 400 passed. Integration probe found the grader-side tool_call mismatch, sent to spec 11.
- **2026-11-14**: Spec 11 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 12 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 13 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 14 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 15 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 16 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 17 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 19 Done; recorded supplied lead verification: backend unit 421, frontend unit 194 passed, lint 0 problems, build OK.
- **2026-11-14**: Spec 18 Done. Radix dialog and View-button/ Escape focus restoration verified: targeted 10, backend unit 421, frontend component 195 + Node 8 passed; compile, lint (0 problems), build passed. Browser verification follows in spec 24.
- **2026-11-14**: Spec 20 Done. Read queries verified: targeted unit 13, MongoDB integration 1, full backend unit 434, frontend component 195 + Node 8 passed; compile, lint (0 problems), build passed. No test_* databases remain. CSV-safe rows are opt-in (csv=True) so JSON preserves original text; ROT13/leet decoding requires evidence to avoid transforming ordinary prose.

- **2026-11-14**: Spec 21 Done: page 15, backend unit 434, frontend component 210 + Node 8 passed; compile, lint and build passed. No test_* databases remain.

- **2026-11-14**: Spec 22 Done: schema 18, Mongo API 1, backend unit 452, frontend component 210 + Node 8 passed; compile/lint/build pass; test_* cleanup confirmed.

- **2026-11-14**: Spec 23 Done: worker integration 4, backend unit 452, frontend component 210 + Node 8 passed; compile/lint/build pass; test_* cleanup confirmed.

- **2026-11-14**: Spec 24 Done: browser 17, Mongo pipeline 1, backend unit 452, frontend component 210 + Node 8 passed; compile/lint/build pass. Desktop/mobile axe zero violations. Bugs fixed in owning files and logged per explicit user authorization. test_* cleanup confirmed.

- **2026-11-14**: Independent review completed with narrowly scoped fixes logged in owning specs. Latest counts: backend unit 464, integration 116 unique cases including two new recovery races, frontend 214 Vitest + 8 Node, browser 19 Red Team + 15 Studio. Validator 0 errors/28 explained warnings. Complete evidence, failures/retries, snapshot scope and cleanup: docs/planning/red-team/final-review.md.
