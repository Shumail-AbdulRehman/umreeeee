# Red Team on promptfoo — spec index

This spec set replaces the in-house red-team engine with **promptfoo 0.126.0 running inside the app** for automated security testing. The integration builds on the owner's promptfoo scheduler (`scheduler_umr`; [reuse research](../docs/research/scheduler-reuse.md)) and follows the supervisor's flow:

1. The admin builds a red-team config in our UI and sees the promptfoo YAML it generates.
2. The worker runs `promptfoo redteam run` on it.
3. promptfoo's results JSON is converted into our report format.
4. The report and results are shown in the UI.

[Spec 00](00-promptfoo-decisions.md) and [architecture](ARCHITECTURE.md) are binding. Every backend spec ports a named scheduler function rather than inventing its own logic.

Read [agent guide](AGENT-GUIDE.md), [architecture](ARCHITECTURE.md), [design system](DESIGN-SYSTEM.md), [reuse inventory](INVENTORY.md) and [progress](PROGRESS.md) before implementing. The [approved Red Team prototype](../design/red-team/v3/) is the UI source. Research: [scheduler reuse](../docs/research/scheduler-reuse.md), [red-team engine](../docs/research/promptfoo-redteam.md), [worker integration](../docs/research/promptfoo-integration.md), [local probe](../docs/research/promptfoo-local-probe.md).

## Scheduler → spec map

| Scheduler (`scheduler_umr`) | Spec |
| --- | --- |
| `create_yaml`, `format_purpose` | 04 config builder |
| `run_redteam` | 10 runner |
| `callback_func` | 17 worker |
| `parse_redteam_json` (row loop) | 05 results parser |
| `parse_redteam_json` (aggregation, frameworks, `delta`) | 06 report, 03 frameworks |
| `utils/constants.py` `FRAMEWORKS` | 03 framework data |
| `utils/risk_scoring.py` | already ported (`backend/app/red_team/risk_scoring.py`) |
| — (scheduler sends test prompts directly to models) | 08, 09 protected-mode bridge |

## Index

| Spec | Unit | Wave | Depends on | Tier |
| --- | --- | ---: | --- | --- |
| 00 | [Planner decisions](00-promptfoo-decisions.md) | 0 | — | Heavy |
| 01 | [Runtime and Heroku setup](01-promptfoo-runtime-and-heroku-setup.md) | 1 | 00 | Light |
| 02 | [Plugin and strategy catalog](02-plugin-and-strategy-catalog.md) | 2 | 01 | Standard |
| 03 | [Framework compliance (scheduler frameworks)](03-framework-compliance.md) | 2 | 01 | Standard |
| 04 | [Config and environment builder (port of create_yaml)](04-promptfoo-config-and-environment-builder.md) | 3 | 02 | Heavy |
| 05 | [Results parser (scheduler row rules)](05-results-parser.md) | 3 | 02 | Standard |
| 06 | [Report aggregation (scheduler aggregation)](06-report-aggregation.md) | 3 | 02, 03 | Heavy |
| 07 | [Frontend client and labels](07-frontend-client-service-and-labels.md) | 1 | 00 | Standard |
| 08 | [Bridge provider (protected mode)](08-bridge-provider.md) | 1 | 00 | Standard |
| 09 | [Bridge server (protected mode)](09-bridge-server.md) | 2 | 08 | Heavy |
| 10 | [Runner (port of run_redteam)](10-promptfoo-runner.md) | 4 | 04, 05 | Heavy |
| 11 | [Test editor and config preview](11-test-editor.md) | 2 | 07 | Standard |
| 12 | [Test list and run progress](12-test-list-and-run-progress.md) | 2 | 07 | Standard |
| 13 | [Report summary, plugin table and strategy breakdown](13-report-summary-plugin-table-strategy-breakdown.md) | 2 | 07 | Standard |
| 14 | [Compliance tabs](14-compliance-tabs.md) | 2 | 07 | Light |
| 15 | [Results table and case details](15-results-table-and-case-details.md) | 2 | 07 | Standard |
| 16 | [Service, schemas, routes, indexes, config preview](16-service-schemas-routes-indexes.md) | 4 | 01, 02, 03, 04, 06 | Heavy |
| 17 | [Worker and recovery (port of callback_func)](17-worker-and-recovery.md) | 5 | 05, 09, 10, 16 | Heavy |
| 18 | [Red Team page integration](18-red-team-page-integration.md) | 3 | 07, 11–15 | Heavy |
| 19 | [Remove in-house engine and archive legacy data](19-remove-in-house-engine-and-archive-legacy-data.md) | 6 | 16, 17, 18 | Standard |
| 20 | [End-to-end suite](20-e2e-suite.md) | 7 | 01–19 | Heavy |
| 21 | [Verification pass and live smoke](21-verification-pass.md) | 8 | 00–20 | Heavy |

## Waves and critical path

| Wave | Specs (ready once dependencies are Done) |
| --- | --- |
| 0 | 00 (Done) |
| 1 | 01 (Done), 07 (addendum), 08 |
| 2 | 02 (Done), 03, 09, 11, 12–15 (Done) |
| 3 | 04, 05, 06, 18 |
| 4 | 10, 16 |
| 5 | 17 |
| 6 | 19 |
| 7 | 20 |
| 8 | 21 |

Ready to dispatch now: **03, 07, 08** (and 04, 05 since 02 is Done). Longest path: `00 → 01 → 02 → 04 → 10 → 17 → 19 → 20 → 21`. [DAG rationale](../docs/planning/promptfoo/dag.md).

## How to run

1. Validate from the root: `python3 .ai/plan-project/scripts/validate-specs.py specs-promptfoo` ([captured result](../docs/planning/promptfoo/validator.md)).
2. Dispatch exactly one numbered spec per Codex session (`gpt-6.2-sol`), with [the handoff prompt](../docs/planning/promptfoo/handoff-prompt.md). `orchestro specs ready specs-promptfoo/` lists what is ready where Orchestro is installed. Never point a runner at the historical `specs/`.
3. Automated tests never run real promptfoo, call a model or reach RabbitMQ. The only live run is spec 21's smoke, started through the app API.

## Open questions

- **promptfoo Cloud key:** generation uses the owner's promptfoo Cloud user API token (`PROMPTFOO_API_KEY` in `backend/.env`, organization `umer-fyp`), verified headless on 2026-11-22. The token expires in 2027.
- **Protected-mode smoke prerequisites:** the organization needs an active policy and a verified subject user for the protected clone in spec 21.
- **Archive operation:** who signs off the retention policy and maintenance window for spec 19's `--apply`? Spec 19 builds and tests the tool on fakes only.
- **Heroku:** not planned for now; spec 01's notes (Node buildpack, Standard-2X) remain documentation.

## Adjustments (2026-11-22 redesign)

- Rebuilt on the owner's scheduler at the owner's and supervisor's request. Reopened Done specs 03, 05, 06 (from-scratch versions replaced by scheduler ports that keep the report payload) and 07 (small client addendum). Rewrote 00, 04, 08, 09, 10, 16, 17. Patched 01 (removed the contradictory email-verification step), 11 (config preview), 18, 20 and 21.
- Corrected planning defects:
  - The agent guide forbade the live bridge and the live smoke that the specs require.
  - The index still carried offline titles ("Fixture runner", "Bridge server fixture boundary").
  - Spec 04 put the grader in `redteam.provider`, which also makes it generate follow-up prompts for multi-turn strategies.
  - The suite was going to be stored with the API keys promptfoo copies into `redteam.yaml`.
  - `-o` on `redteam run` overwrites the suite with the results.
- Local-fixture code committed for specs 04 and 08 (`26ac31e`, `11d6ff8`) and the untracked fixture `runner.py`/`fake_promptfoo.py` do not meet the specs; their owners replace them.

## Known gaps

- Validator warning on 00: a completed decision record with `Issue: —`, intentional.
- Implied-edge warnings on 16, 17, 18, 19: each edge is a direct consumption and adds no waves.
- Orphan warnings on 19: legacy paths assigned for deletion, not new surfaces. On 03: the port script and its sample fixture are one-off tooling and test data with no runtime consumers; `scheduler_frameworks.json` is consumed through `framework_compliance.py` (specs 06, 16). On 02: `promptfoo_catalog.json` is consumed through `catalog.py`. On 16: `db/indexes.py` is an existing file it edits.
- "Log has no dated entry" on 02, 13, 14, 15: Codex logged under `###` date headings; the content is dated, the format differs.
- `scheduler_umr` lives outside the repo (`/home/shumail/Downloads/scheduler_umr/scheduler_umr`). Specs port logic from it; `docs/research/scheduler-reuse.md` records the rules so implementation does not depend on the folder, except spec 03's one-time framework port.
- Validation proves spec structure, not promptfoo Cloud availability or model behaviour; spec 21's live smoke is the only end-to-end proof.
