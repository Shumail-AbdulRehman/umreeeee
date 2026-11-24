# Promptfoo Red Team implementation inventory

Verified against the working tree on 2026-11-23. The retired in-house evaluator, judge, manifest, report/query branches and frontend legacy report were removed by spec 19.

## Red Team domain

### Runtime and metadata

| Responsibility | Implementation |
| --- | --- |
| Pinned CLI and readiness | root `package.json` / `package-lock.json`; `backend/scripts/check_promptfoo_runtime.py` |
| Promptfoo catalog | `backend/app/red_team/promptfoo_catalog.json`; `backend/app/red_team/catalog.py` |
| Scheduler framework mapping | `backend/app/red_team/scheduler_frameworks.json`; `backend/app/red_team/framework_compliance.py` |
| Config, preview and environment | `backend/app/red_team/config_builder.py` |
| Final artifact parser and suite sanitizer | `backend/app/red_team/results_parser.py` |
| Risk and report aggregation | `backend/app/red_team/risk_scoring.py`; `backend/app/services/red_team_report.py` |

The permitted scheduler reference remains documented in `docs/research/scheduler-reuse.md`; the runtime does not import from that external folder.

### Execution boundary

| Responsibility | Implementation |
| --- | --- |
| Promptfoo target provider | `backend/promptfoo_bridge/provider.py` |
| Protected loopback server | `backend/app/red_team/bridge_server.py` |
| Private workspace and subprocess lifecycle | `backend/app/red_team/runner.py` |
| One leased run job, suite persistence and encrypted import | `backend/app/workers/red_team_worker.py` |
| Dispatch and interrupted-run recovery | `backend/app/queue/dispatcher.py`; `backend/app/queue/recovery.py` |
| Protected application execution | `backend/app/services/protected_prompt_service.py`; `backend/app/services/provider_service.py` |
| Content retention | `backend/app/services/content_service.py` |

Raw targets use Promptfoo built-in providers. Protected targets alone use the loopback bridge, and policy verdicts require a protected run ID issued by that bridge.

### API and persistence

- `backend/app/schemas/red_team.py`: exact Promptfoo draft/edit/launch/clone schemas and the 200 target-call cap.
- `backend/app/services/red_team_service.py`: tenant validation, preview, CRUD, one-job launch, cancel, clone/suite reuse, result/report/detail/export reads.
- `backend/app/api/routes/red_team.py`: `/api/red-team` transport.
- `backend/app/db/indexes.py`: one run-job fence, suite and case uniqueness indexes.
- `docs/API_CONTRACTS.md`: Promptfoo-only public contract.

### Frontend

- Transport: `Frontend/src/services/redTeam/redTeamService.js`.
- Page and polling: `Frontend/src/pages/RedTeamPage.jsx`; `Frontend/src/hooks/useRedTeamTest.js`.
- Editor and preview: `Frontend/src/features/red-team/TestEditor.jsx`; `ConfigPreview.jsx`; `attackEstimate.js`.
- Active run: `TestList.jsx`; `RunProgress.jsx`.
- Report: `ReportSummary.jsx`; `PluginTable.jsx`; `StrategyBreakdown.jsx`; `ComplianceTabs.jsx`; `ReportStates.jsx`.
- Results: `ResultsTable.jsx`; `AttackDetailDialog.jsx`.
- Shared tokens/styles: `Frontend/src/features/red-team/red-team.css`; `Frontend/src/pages/red-team.css`; existing `Frontend/src/components/ui/` primitives.

There is one Red Team API client, one report aggregate, one results table/detail implementation and no legacy report branch. The Impeccable detector reported no findings on the changed UI targets.

### Operations and verification

- Safe legacy archive: `backend/scripts/archive_legacy_red_team.py` (dry-run default; `--apply` requires a new owner-only output file).
- Unit fixtures: `backend/tests/fixtures/fake_promptfoo.py`; `backend/tests/fixtures/promptfoo/`.
- Browser acceptance: `Frontend/tests/red-team.spec.js`; `Frontend/tests/fixtures/red-team-api.js`; `Frontend/playwright.redteam.config.js`.
- Mongo gates: `backend/tests/integration/test_red_team_promptfoo_api.py`; `test_red_team_promptfoo_worker.py`; `test_red_team_promptfoo_pipeline.py`.
- Per-spec additions: `specs-promptfoo/inventory/01-*.md` through `21-verification-pass.md` where applicable.

No legacy archive apply, deployment, provider call or hosted-generation smoke was performed during automated verification.
