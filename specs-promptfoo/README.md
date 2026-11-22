# Red Team on promptfoo — spec index

This spec set replaces the in-house red-team engine with **promptfoo 0.126.0 running inside the app** (owner decision, Option B): the worker runs promptfoo's hosted attack generation and its grader against the real target through the app (raw → provider, protected → policy pipeline). [Spec 00](00-promptfoo-decisions.md) and [architecture](ARCHITECTURE.md) are binding; the numbered specs implement them. On 2026-11-22 the planner (Claude) restored the live scope in specs 01-04, 07-11, 16-18, 20-21 after the spec-writing Codex session had narrowed them to an offline replay; the narrowed wording is void.

Read [agent guide](AGENT-GUIDE.md), [architecture](ARCHITECTURE.md), [design system](DESIGN-SYSTEM.md), [reuse inventory](INVENTORY.md), and [progress](PROGRESS.md) before implementing. The existing [approved Red Team prototype](../design/red-team/v3/) is the UI source. Artifact provenance: [red-team engine research](../docs/research/promptfoo-redteam.md), [worker integration research](../docs/research/promptfoo-integration.md) and [local probe](../docs/research/promptfoo-local-probe.md).

## Index

| Spec | Unit | Wave | Depends on | Tier |
| --- | --- | ---: | --- | --- |
| 00 | [Planner decisions](00-promptfoo-decisions.md) | 0 | — | Heavy |
| 01 | [Runtime and Heroku setup](01-promptfoo-runtime-and-heroku-setup.md) | 1 | 00 | Light |
| 02 | [Plugin and strategy catalog](02-plugin-and-strategy-catalog.md) | 2 | 01 | Standard |
| 03 | [Framework compliance](03-framework-compliance.md) | 2 | 01 | Standard |
| 04 | [Config and environment builder](04-promptfoo-config-and-environment-builder.md) | 3 | 02 | Heavy |
| 05 | [Results parser](05-results-parser.md) | 1 | 00 | Standard |
| 06 | [Report aggregation](06-report-aggregation.md) | 3 | 02, 03 | Heavy |
| 07 | [Frontend client and labels](07-frontend-client-service-and-labels.md) | 1 | 00 | Standard |
| 08 | [Bridge provider compatibility](08-bridge-provider.md) | 1 | 00 | Standard |
| 09 | [Bridge server fixture boundary](09-bridge-server.md) | 2 | 08 | Heavy |
| 10 | [Fixture runner](10-promptfoo-runner.md) | 4 | 04 | Heavy |
| 11 | [Test editor](11-test-editor.md) | 2 | 07 | Standard |
| 12 | [Test list and run progress](12-test-list-and-run-progress.md) | 2 | 07 | Standard |
| 13 | [Report summary, plugin table and strategy breakdown](13-report-summary-plugin-table-strategy-breakdown.md) | 2 | 07 | Standard |
| 14 | [Compliance tabs](14-compliance-tabs.md) | 2 | 07 | Light |
| 15 | [Results table and attack detail](15-results-table-and-attack-detail.md) | 2 | 07 | Standard |
| 16 | [Service, schemas, routes and indexes](16-service-schemas-routes-indexes.md) | 4 | 02, 03, 04, 06 | Heavy |
| 17 | [Worker and recovery](17-worker-and-recovery.md) | 5 | 05, 09, 10, 16 | Heavy |
| 18 | [Red Team page integration](18-red-team-page-integration.md) | 3 | 07, 11–15 | Heavy |
| 19 | [Remove in-house engine and archive legacy data](19-remove-in-house-engine-and-archive-legacy-data.md) | 6 | 16, 17, 18 | Standard |
| 20 | [End-to-end suite](20-e2e-suite.md) | 7 | 01–19 | Heavy |
| 21 | [Verification pass](21-verification-pass.md) | 8 | 00–20 | Heavy |

## Waves and critical path

| Wave | Ready after dependencies land |
| --- | --- |
| 0 | 00 (already Done) |
| 1 | 01, 05, 07, 08 |
| 2 | 02, 03, 09, 11, 12, 13, 14, 15 |
| 3 | 04, 06, 18 |
| 4 | 10, 16 |
| 5 | 17 |
| 6 | 19 |
| 7 | 20 |
| 8 | 21 |

One longest path: `00 → 01 → 02 → 04 → 10 → 17 → 19 → 20 → 21` (9 specs, 8 edges). [DAG rationale](../docs/planning/promptfoo/dag.md) gives other longest paths, edge consumption and hot-file owners. The wave headings in the source split are narrative batches; computed waves govern dispatch and use the split's unchanged dependency edges.

## How to run

1. Validate from the root: `python3 /home/shumail/.claude/skills/plan-project/scripts/validate-specs.py specs-promptfoo`. See the [captured result](../docs/planning/promptfoo/validator.md).
2. Use `orchestro specs graph specs-promptfoo/` and `orchestro specs ready specs-promptfoo/` in an environment with Orchestro installed. Dispatch exactly one numbered spec per Codex session. When running sequentially, point a separately configured `spec-run` queue at `specs-promptfoo/` and check `spec-run status` before dispatch. Do not accidentally run the repository's historical `specs/` or switch implementer models through a default runner configuration.
3. Use the [agent guide commands](AGENT-GUIDE.md#commands-and-isolation). Specs 20 and 21 alone run e2e. Never run live promptfoo, providers or RabbitMQ in automated tests; the only live run is spec 21's smoke, started through the app API.

## Open questions

- **One-time email verification:** the source plan names owner verification of `PROMPTFOO_ACCOUNT_EMAIL` ([engine research §7](../docs/research/promptfoo-redteam.md#7-remote-generation-critical), [local probe](../docs/research/promptfoo-local-probe.md#behaviour-observed)); account ownership and completion are not recorded. No verification or use of that account is required for this handoff. Configured is not verified.
- **Heroku budget and footprint:** the source plan assumes Standard-2X. [Heroku pricing](https://www.heroku.com/pricing/) and [billing](https://devcenter.heroku.com/articles/usage-and-billing) list $50/month per continuously running Standard-2X dyno, excluding add-ons (checked 2026-11-22). Who approves the incremental cost, and what is the measured full slug size and worker memory on this app? No spend or deploy is authorized here. See [integration research §§5–6](../docs/research/promptfoo-integration.md#5-installation-footprint).
- **Archive operation:** who signs off the retention policy, protected destination and maintenance window? Spec 19 builds and tests the tool on fakes, not the operator action.
- **Tool access:** the planned IDs are listed in the [OpenAI](https://developers.openai.com/api/docs/models), [Claude](https://platform.claude.com/docs/en/models/overview) and [Gemini](https://aistudio.google.com/docs/models) catalogs (checked 2026-11-22); runner installations and workspace entitlement are not verified. The local environment did not expose `orchestro` or `spec-run` on `PATH`.

## Adjustments to the source split

- Preserve all 21 units, tier lines, dependency headers and named file owners; use descriptive kebab-case slugs (the split gives titles, not explicit filenames). Add per-spec inventory fragment ownership; enumerate the legacy deletion paths and tests in 19. Keep `test_red_team_risk_scoring.py` as a regression test and update its import of removed catalog constants; 15 removes its own `LegacyReport` test case before 19 deletes the module. The incumbent `.gitignore` already ignores `node_modules/` and is not owned or changed.
- Specs 04, 08, 09, 10, 16, 17 and 21 were rewritten by the planner on 2026-11-22 and specs 01-03, 07, 11, 18, 20 patched, restoring live generation, the bridge, real launch, real grading and the live smoke (spec 00). Implementer split: Codex implements every spec except 04, 08, 09, 10, 16, 17 and 21, which Claude implements (Codex declines live red-team execution code).
- Added only the required dated Log formatting to the completed decision record. Did not change its decisions, architecture or source split.

## Known gaps

- Validator warning on 00 (1): this is a completed local decision record, not a coding issue. No GitHub issue was requested; `Issue: —` is intentional.
- Validator implied-edge warnings (3): 16 directly consumes the catalogs from 02 and 03 as well as reports from 06; 18 directly consumes the client from 07 as well as the components; 19 directly checks the service/route/schema removal in 16 as well as worker and UI. Kept the split's explicit edges; they add no waves.
- Validator orphan warnings on 19 (24): the validator treats every `Owns` path as a created artifact. All reported paths are legacy code/data/tests assigned **for deletion**, not new surfaces. They should have no future consumers; see the exact list in the validator receipt and the no-import check in 19.
- Footprint measurements differ between the local probe and integration research; neither measures the complete app slug. The probe's 500 MB limit is superseded by the 1000 MB default in the [Heroku limits reference](https://devcenter.heroku.com/articles/limits#slug-size), as recorded in integration research §6. Do not conclude the slug fits from the package-only measurements.
- Validation proves spec structure, not installed package contents, app behavior, provider availability, production deployability or legacy data compatibility. No application/acceptance tests were executed during planning. Mongo integration and Playwright remain implementation prerequisites. There is no live coverage in this handoff.
- Planner fix (2026-11-22): validator 0 errors / 31 warnings. New warnings are accepted: `promptfoo_catalog.json` is consumed through `catalog.py` (spec 02) by specs 04, 11 and 16; `backend/app/db/indexes.py` is an existing file spec 16 edits; the "already implied" edges on 16, 17, 18 and 19 are kept because each is a direct consumption.
