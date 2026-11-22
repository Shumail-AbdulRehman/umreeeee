# Red Team module architecture

Derived from the code on 2026-11-11 (see `docs/planning/red-team/repo-survey.md`) plus the decisions in spec 00. Paths are relative to the project root. Root `specs/` is the finished Prompt Studio set; this set extends the Red Team module only.

## Folder structure

```
backend/app/red_team/
  catalog.json            existing synthetic-catalog-2 (legacy, read-only)
  catalog_schema.py       existing v2 manifest (legacy, read-only)
  evaluators.py           existing v2 grader (legacy, read-only)
  catalog_v3.json         spec 01: plugins, templates, controls, strategy metadata
  plugins.py              spec 01: load + validate catalog_v3, expose plugin/strategy registries
  strategies.py           spec 02: deterministic transforms and reply decoders
  risk_scoring.py         spec 03: promptfoo risk model (port of the permitted company file)
  frameworks.json         spec 04: framework controls and plugin mapping
  frameworks.py           spec 04: compliance status computation
  judge.py                spec 05: judge prompt builder and strict verdict parser
  manifest_v3.py          spec 10: plugin x strategy x n manifest + hash
  evidence.py             spec 11: v3 exact-evidence grader (strategy-aware)
backend/app/services/
  red_team_report_v3.py   spec 12: pure report aggregation from a test and its jobs
  red_team_queries_v3.py  spec 20: v3 results, detail, report and export queries
  red_team_service.py     spec 22: create/edit/launch/clone and read delegation for v3 (legacy kept)
backend/app/schemas/red_team.py      spec 22
backend/app/api/routes/red_team.py   spec 22
backend/app/db/indexes.py            spec 22 (red-team indexes only)
backend/app/workers/red_team_worker.py  spec 23
backend/app/queue/recovery.py           spec 23
backend/tests/unit/test_red_team_<topic>.py          one per backend spec
backend/tests/integration/test_red_team_v3_<topic>.py specs 20, 22, 23, 24
Frontend/src/features/red-team/
  red-team.css            spec 06: feature styles and token aliases
  labels.js               spec 06: verdict/status/level/mode label + tone maps
  editorSummary.js        spec 07: attack count, judge calls, time, coverage
  TestList.jsx            spec 13
  TestEditor.jsx          spec 14
  RunProgress.jsx         spec 15 (with cancel confirmation)
  ReportSummary.jsx, PluginTable.jsx, StrategyBreakdown.jsx   spec 16
  ComplianceTabs.jsx      spec 17
  ResultsTable.jsx, AttackDetailDialog.jsx                   spec 18
  ReportStates.jsx, LegacyReport.jsx                         spec 19
  *.test.jsx / *.test.js  colocated, owned by the creating spec
Frontend/src/services/redTeam/redTeamService.js   spec 08
Frontend/src/hooks/useRedTeamTest.js              spec 08
Frontend/src/pages/RedTeamPage.jsx, red-team.css  spec 21 (composition only)
Frontend/playwright.redteam.config.js, Frontend/tests/red-team.spec.js, Frontend/tests/fixtures/red-team-api.js   spec 24
specs-red-team/inventory/NN-<slug>.md             one per spec
```

## Layer boundaries

| Layer | Owns | Never does |
| --- | --- | --- |
| `app/red_team/*` (pure) | Catalog data, transforms, grading, judge prompt/parse, risk, compliance | Database, network, provider or clock access |
| `red_team_report_v3.py` | Report numbers from a test document and job documents | Queries; it receives data |
| `red_team_service.py` | Tenant checks, validation, transactions, queries, response DTOs | Provider calls |
| Worker / recovery | Leases, provider and judge calls, durable phases, finalization | Re-implement grading or scoring |
| Routes | HTTP validation, idempotency header, delegation | Business logic |
| Feature components | Controlled presentation from props and callbacks | Call `redTeamService` or `fetch` |
| `RedTeamPage.jsx` | Routing within the page, data loading, mutations, polling via the hook | Re-implement component markup |

## Data model

Intent level, not schema code.

**Test (`red_team_tests`), v3 additions.** `format`: `plugins` for v3 (absent or `categories` means legacy v2). `plugins`: 1-8 plugin ids. `strategies`: 0-7 strategy ids; `basic` is always added server-side. `tests_per_plugin`: 1-10. `num_attacks` derived = plugins x (strategies incl. basic) x tests_per_plugin, at most 100. `judge`: null or {integration_id, model}. `catalog_version` `synthetic-catalog-3`, `evaluator_version` `exact-evidence-3`. Launch adds to `config_snapshot`: plugin severities, strategy metadata and `judge` {integration_id, model, provider, price_snapshot}. Existing fields (mode, subject, threshold, seed, temperature, max_tokens, comparison_group_id, manifest, manifest_hash, versions, statuses) are unchanged.

**Job (`red_team_jobs`), v3 additions.** `plugin_id`, `strategy_id`, `severity`, `template_id`, `original_prompt` (before the strategy), `prompt` (as sent), `evidence_type` (`marker`, `pii`, `tool_call`, `off_topic`, `safe_summary`, `control`), the markers (for `tool_call` the payload token is deliberately inside the sent prompt and only counts as evidence inside fictional `[[call <tool>(…)]]` syntax), `verdict_source` (`exact`, `policy`, `judge`, `none`), `judge` {verdict, reason, model, latency_ms, cost, error_code, attempts}. New `execution_phase` values: `judging`. Verdict values stay `pass` (defended), `fail` (unsafe), `inconclusive`, `error`.

**Report v3 payload (served by `GET /api/red-team/tests/{id}/report` when `format=plugins`).** `risk` {score, level, by_level}; `attack_success` {rate, worked, decided, proven, judged}; `decided` {decided, adversarial, exact, judge, policy, inconclusive, errors}; `threshold` {threshold, defended_rate, verdict}; `plugins` [{id, name, severity, decided, worked, rate, risk_score, level, worst_strategy}]; `strategies` [{id, name, decided, worked, rate}]; `compliance` [{framework, name, totals, controls [{id, name, status, worked, decided, reason}]}]; `controls` {answered, blocked, inconclusive, error}; `paired` {test_id, mode, status, risk, attack_success, plugin_rates} or null; `trend` {test_id, risk_score, attack_success_rate, finished_at} or null; `provisional` boolean; plus the existing reproducibility metadata and limitations. Risk, compliance and threshold are null while the test is not terminal.

**Capabilities v3 additions.** `plugins` [{id, name, group, severity, description, frameworks {owasp, atlas, nist, eu}}], `strategies` [{id, name, group, description, effort}], `frameworks` [{id, name, total}], `max_attacks` 100, `max_tests_per_plugin` 10, `judge_supported` true.

**Results list v3 additions.** Filters `plugin`, `strategy`, `verdict`, `verdict_source`; response adds `counts` {all, unsafe, defended, inconclusive, errors, controls} for the whole test. Result detail adds `original_prompt`, `strategy_id`, `decoded_response` (only when retained and decodable), `evidence_steps`, `judge`, and `paired` {verdict, verdict_source, prevention_stage} from the paired test at the same `attack_index`.

## State ownership

Server data stays in `RedTeamPage.jsx` state, loaded through `redTeamService.js`; the polling lifecycle stays in `useRedTeamTest.js`. Feature components receive data and callbacks only. Hash routes inside the page: `#red-team` (list), `#red-team?new=1` (editor), `#red-team?test=<id>` (draft opens the editor, queued/running/cancelling opens progress, terminal opens the report; legacy format opens `LegacyReport`). Navigation and `pageRegistry` are unchanged.

## Test seams

Backend pure modules are tested directly. Service and worker tests use the existing `test_database` fixture (skips without `TEST_MONGODB_URL`), the fake provider pattern from `tests/integration/test_red_team_flow.py`, and a fake publisher; no live provider, broker or judge. Frontend components are tested with Testing Library from props; the page test mocks `redTeamService.js`; the browser suite intercepts every `/api` request with synthetic fixtures.

## Invariants (violating one is a defect)

1. Legacy `synthetic-catalog-2` tests keep their current list, detail, report, export and comparison behaviour; v3 code branches on `format`.
2. Broker messages carry only `{v, job_id, test_id, generation}`; no attack text, marker or response.
3. Policy blocks and exact evidence decide first; the judge decides only results they leave undecided, and every judge verdict has `verdict_source=judge`.
4. Inconclusive, error and cancelled results never count as defended or unsafe; they are excluded from rates and shown separately.
5. Risk score, compliance status and threshold verdict exist only for terminal tests; running tests expose provisional attack success only.
6. An uncertain target provider call is never replayed. A judge call interrupted by lease expiry may run at most once more; after two attempts the result stays inconclusive.
7. Every target and judge call goes through `ProviderService` with `IntegrationAdmission` for that integration.
8. The `app/red_team/*` modules are pure: no database, network, provider or clock access.
9. Feature components never call services or `fetch`; only `RedTeamPage.jsx` does.
10. Admin and tenant scoping stays in `RedTeamService._tenant`; judge and target integrations must belong to the same organization and be active.
11. Attack content is synthetic: the harmful plugin targets a fictional forbidden topic defined in the scenario; templates contain no real dangerous instructions, real people or real secrets.
12. Raw colour values appear only in `DESIGN-SYSTEM.md` and `design/`; feature CSS uses incumbent aliases or `color-mix` of them.
13. MITRE ATLAS tactic IDs are displayed only when verified against official ATLAS data; otherwise the tactic name alone is shown.
14. Single owners for shared files: spec 22 is the only editor of `red_team_service.py`, `schemas/red_team.py`, `routes/red_team.py`, `app/db/indexes.py` and `docs/API_CONTRACTS.md`; spec 23 of the worker and recovery; spec 24 of `Frontend/package.json`; spec 08 of `redTeamService.js` and `useRedTeamTest.js`; spec 21 of `RedTeamPage.jsx` and `pages/red-team.css`; spec 09 of the Procfiles and `backend/DEPLOYMENT.md`.
