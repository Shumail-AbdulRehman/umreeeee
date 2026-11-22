# Red Team reuse inventory

Current tree, verified 2026-11-22. “Reference only” means read its conventions, not import legacy or live execution code. Existing paths below are not ownership grants. Record new reusable surfaces in `inventory/NN-<slug>.md`; only spec 21 folds them here.

## Provider and guardrail services

| Responsibility | Current path and symbols | Reuse boundary |
| --- | --- | --- |
| Model execution/result shape | `backend/app/services/provider_service.py` — `ProviderService.execute`, `ProviderResult`, `ProviderError` | Shape and errors as provenance only; never call from fixture code. |
| Admission lease | `backend/app/services/integration_admission.py` — `IntegrationAdmission.acquire`, `verify`, `heartbeat`, `release` | Lease pattern, not live admission. |
| Protected dispatch | `backend/app/services/protected_prompt_service.py` — `ProtectedPromptService.execute_protected`, `serialize_run` | Decision and redacted outcome shape reference only. No live protected dispatch. |
| Content retention | `backend/app/services/content_service.py` — `encrypt`, `decrypt`, `expire_content`, `shorten_retention` | Reuse encryption and retention boundaries; never put target text on a queue or in logs. |
| Admin primitives | `backend/app/services/admin_common.py` — `serialize`, `audit`, `transaction`, `find_tenant`, `check_version` | Keep tenant and version checking patterns. |

## Red Team domain

| Responsibility | Current path and symbols | Reuse boundary |
| --- | --- | --- |
| HTTP and tenant lookup | `backend/app/api/routes/red_team.py`, `backend/app/schemas/red_team.py`, `backend/app/services/red_team_service.py` — `TestConfig`, `TestEdit`, `RedTeamService._tenant`, `_find`, `_transaction` | Keep route/auth boundaries and scope reads. No successful live launch. |
| Legacy report/query reference | `backend/app/services/red_team_report_v3.py`, `backend/app/services/red_team_queries_v3.py` — `build_report`, `filter_query`, `paired_test`, `previous_test`, `csv_safe` | Reuse patterns, not imports. Removed by spec 19. |
| Legacy metadata reference | `backend/app/red_team/catalog_schema.py`, `backend/app/red_team/frameworks.py`, `backend/app/red_team/frameworks.json` | Validation and shape precedent only. Removed by spec 19. |
| Risk | `backend/app/red_team/risk_scoring.py` — `score_plugin`, `score_system`, `StrategyCounts` | Keep unchanged; call from new pure aggregate. |
| Index owner | `backend/app/db/indexes.py` — `ensure_indexes`; `backend/app/db/mongo.py` | Spec 16 alone edits red-team indexes; reuse database access primitives. |

## Queue and diagnostics

- `backend/app/queue/dispatcher.py` — `dispatch_once`, `heartbeat`; reference envelope and heartbeat shape, no dispatch added. `backend/app/queue/rabbit.py` is the incumbent broker layer and stays out of automated tests.
- `backend/app/queue/recovery.py` — `recover`; reuse fencing and state checks without replaying live jobs. `backend/app/workers/red_team_worker.py` — `_authority`, `_claim`, `_keep_alive`, `_finalize`, `process_job`; use existing lease patterns, not `_raw` or `_protected` executors.
- `backend/scripts/check_database.py` — standalone checker pattern. `backend/tests/integration/conftest.py` — `test_database` replica-set fixture. `backend/tests/unit/test_queue_resilience.py` — fake-driven failure cases.

## Frontend components and tokens

| Area | Current path | Reuse |
| --- | --- | --- |
| API/request tracking | `Frontend/src/services/api/client.js`, `Frontend/src/services/api/requestActivity.js`, `Frontend/src/services/redTeam/redTeamService.js` | `apiRequest`, `beginTrackedRequest`, `buildQuery`, `buildResultsQuery`, `downloadRedTeamExport`; no second client. |
| Page/polling | `Frontend/src/pages/RedTeamPage.jsx`, `Frontend/src/hooks/useRedTeamTest.js`, `Frontend/src/components/LoadingSurface.jsx` | Existing page route, `useRedTeamTest`, `InlineLoadingBar`; no new router/shell. |
| Draft/list/progress | `Frontend/src/features/red-team/TestEditor.jsx`, `Frontend/src/features/red-team/TestList.jsx`, `Frontend/src/features/red-team/RunProgress.jsx` | Adapt component props; retain layout and cancel dialog primitive. |
| Report drill-down | `Frontend/src/features/red-team/ReportSummary.jsx`, `Frontend/src/features/red-team/PluginTable.jsx`, `Frontend/src/features/red-team/StrategyBreakdown.jsx`, `Frontend/src/features/red-team/ComplianceTabs.jsx`, `Frontend/src/features/red-team/ResultsTable.jsx`, `Frontend/src/features/red-team/AttackDetailDialog.jsx`, `Frontend/src/features/red-team/ReportStates.jsx` | Adapt before adding new surfaces. |
| Primitives | `Frontend/src/components/ui/`, `Frontend/src/components/StatusBadge.jsx`, `Frontend/src/components/FieldErrors.jsx`, `Frontend/src/components/DataState.jsx`, `Frontend/src/components/Surface.jsx` | Shared Radix dialog, labelled input/textarea, button, semantic table, status and error patterns. |
| Label and formatting | `Frontend/src/features/red-team/labels.js`, `Frontend/src/lib/format.js` | `statusLabel`, `verdictLabel`, `severityLabel`, `formatNumber`, `formatPercent`, `formatDate`. |
| Tokens and screen source | `Frontend/src/index.css`, `Frontend/src/features/red-team/red-team.css`, `Frontend/src/pages/red-team.css`, `design/red-team/v3/` | Root tokens and existing `--rt-*` aliases. Follow `DESIGN-SYSTEM.md`; don't port prototype HTML/CSS literally. |
| Tests | `Frontend/vitest.config.js`, `Frontend/playwright.redteam.config.js`, `Frontend/tests/red-team.spec.js`, `Frontend/tests/fixtures/red-team-api.js` | Existing Testing Library/Vitest and isolated Chromium interception; only spec 20 owns browser suite changes. |
