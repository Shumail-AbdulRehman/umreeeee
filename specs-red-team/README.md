# Red Team v3 implementation plan

Approved design: `design/red-team/v3` (approved 2026-11-11, "approve now write an impmenntation plan for it make sure its detailed"). Scope: the Red Team module only. This folder is a separate spec set beside the finished Prompt Studio set in `specs/`. No application code has been changed by planning.

## What it delivers

Eight attack plugins with severities and original synthetic templates; eight disguise strategies; a seeded manifest that pairs raw and protected runs; strategy-aware exact-evidence grading; an optional, labelled LLM judge with a crash-safe phase; promptfoo's 0-10 risk score; compliance coverage for OWASP LLM Top 10 2025, MITRE ATLAS, NIST AI RMF and the EU AI Act; a report that leads with raw versus protected; new list, editor, running and report screens; the polling and recovery-process defects fixed.

## Spec index

| # | Spec | Wave | What it covers |
| --- | --- | --- | --- |
| 00 | [Red Team v3 decisions](00-red-team-decisions.md) | 0 | Every inherited decision and what lost |
| 01 | [Plugin and control catalog v3](01-plugin-catalog.md) | 1 | 8 plugins, templates, controls, strategy metadata |
| 02 | [Strategy transforms and reply decoders](02-strategy-transforms.md) | 1 | Encodings, framings, decoded variants |
| 03 | [Risk scoring model](03-risk-scoring.md) | 1 | promptfoo 0-10 model, zero-success rule |
| 04 | [Framework mapping and compliance status](04-framework-mapping.md) | 1 | Four frameworks, control status rules |
| 05 | [Judge prompt builder and verdict parser](05-judge-prompt.md) | 1 | Rubric, delimiters, strict JSON parse |
| 06 | [Red Team feature folder, styles and labels](06-frontend-foundation.md) | 1 | Token aliases, shared classes, label maps |
| 07 | [Editor summary calculations](07-editor-summary.md) | 1 | Attack count, time, coverage, blocking |
| 08 | [Red Team client service and polling fix](08-client-service-and-polling.md) | 1 | Query objects, export URL, polling restart |
| 09 | [Continuous recovery process](09-recovery-process.md) | 1 | Procfiles and deployment guide |
| 10 | [Plugin manifest builder v3](10-manifest-v3.md) | 2 | Rows, markers, scenario prompts, hash |
| 11 | [Strategy-aware exact-evidence grader](11-evidence-grader.md) | 2 | Verdict, source, steps, needs-judge |
| 12 | [Report aggregation v3](12-report-aggregation.md) | 2 | All report numbers from jobs |
| 13 | [Test list component](13-test-list.md) | 2 | Grouped pairs, readiness, empty state |
| 14 | [Test editor component](14-test-editor.md) | 2 | Full-page editor and summary |
| 15 | [Running test view and cancel confirmation](15-run-progress.md) | 2 | Progress, provisional, cancel dialog |
| 16 | [Report summary, plugin table and strategy breakdown](16-report-summary.md) | 2 | Risk compare, attack success, tables |
| 17 | [Compliance coverage tabs](17-compliance-tabs.md) | 2 | Accessible tabs, control list |
| 18 | [Results table and attack detail dialog](18-results-and-attack-detail.md) | 2 | Verdict chips, evidence dialog |
| 19 | [Report states and legacy report](19-report-states.md) | 2 | Cancelled, failed, no judge, earlier format |
| 20 | [Report, results and export queries v3](20-report-queries.md) | 3 | Read side over MongoDB |
| 21 | [Red Team page integration](21-page-integration.md) | 3 | Orchestrator page |
| 22 | [Red Team service and API v3](22-service-and-api.md) | 4 | Schemas, launch, capabilities, routes, indexes |
| 23 | [Worker grading and judge phase](23-worker-judge-phase.md) | 5 | v3 grading, judging phase, recovery |
| 24 | [Red Team end-to-end suite](24-e2e-suite.md) | 6 | Browser flows and backend pipeline |
| 25 | [Red Team verification pass](25-verification-pass.md) | 7 | Clean suites, invariants, inventory |

## Waves and dependency order

- Wave 0: 00.
- Wave 1 (9 in parallel): 01, 02, 03, 04, 05 (backend pure modules); 06, 07, 08 (frontend foundation, summary, client); 09 (Procfiles).
- Wave 2 (10 in parallel): 10, 11, 12 (manifest, grader, report math); 13-19 (seven UI components, each against fixture props).
- Wave 3: 20 (read-side queries), 21 (page integration).
- Wave 4: 22 (service and API). Wave 5: 23 (worker). Wave 6: 24 (e2e). Wave 7: 25 (verification).

Critical path: 00 → 01 → 12 → 20 → 22 → 23 → 24 → 25 (8 of 26 specs). The frontend is complete after wave 3 and is proven against the real backend contract only in spec 24. Edge evidence is in `docs/planning/red-team/dag.md`.

## Design and research

Approved screens and motion: `../design/red-team/v3/`, `../design/red-team/v2/NOTES.md`, critique evidence in `../docs/planning/red-team/critique-assessment-a.md` and `-b.md`. Research: `../docs/research/red-team-frameworks.md`, `../docs/research/models.md`. Planning: `../docs/planning/red-team/` (brief, intake, repo survey, DAG, splits, validator output).

## How to run it

Validate: `python3 .ai/plan-project/scripts/validate-specs.py specs-red-team`. Orchestro: `orchestro specs graph specs-red-team/` then `orchestro specs ready specs-red-team/`. Sequential: run spec-run against this folder. Each session reads `AGENT-GUIDE.md` first.

## Status legend

Not started · In progress · Blocked · Done. `PROGRESS.md` is authoritative; each spec's Log holds the evidence.

## Open questions

1. **MITRE ATLAS tactic IDs.** Official tactic pages returned 404 on 2026-11-11; spec 04 shows names only until IDs are verified from github.com/mitre-atlas/atlas-data.
2. **Integration test environment — resolved 2026-11-11.** The user chose the MongoDB server in `backend/.env`. Tests use throwaway `test_*` databases on it (command in `AGENT-GUIDE.md`); the existing 11 Red Team integration tests passed there in 169 s with no leftover database.
3. **Live proof.** A real run needs a provider key (a free Groq key works) and RabbitMQ; automated tests use fakes only.
4. **Other app defects, out of this scope:** Models page fails for members; analytics status filter can exceed 100%; new tenants get no policy catalog; invitation expiry ignores its setting; account-enumeration messages in auth. Plan them as a separate set when wanted.
5. **Frameworks beyond v1.** OWASP API, OWASP Agentic, ISO 42001, GDPR and DoD mappings exist in the permitted code but are not in the approved design.

## Known gaps

- Integration-tier criteria are `[requires: MongoDB replica set]`; they run against throwaway databases on the configured server. If the server is unreachable they skip, not pass, and the Log must say so.
- Exhaustive gates (24, 25) list every earlier spec by design; some edges are implied transitively.
- Specs 13-19 render from fixture props and meet the real API only in specs 21 and 24; the contract in `ARCHITECTURE.md#data-model` is what keeps them aligned.
- Accepted validator warnings (details in `../docs/planning/red-team/validator.md`): specs 00–25 are Done without GitHub issues because publishing is not authorized (26 warnings); spec 22's edge to 04 is a real direct consumption even though it is also implied; the verification report has no later consumer because it is the terminal human artifact. The three unrecognized Log dates in specs 03, 05 and 10 were repaired during independent review on 2026-11-14.
