# Red Team on promptfoo — architecture

Derived on 2026-11-22 from the code, `docs/research/promptfoo-*.md` and spec 00. Paths are relative to the repo root.
This set replaces the in-house engine described in `specs-red-team/`; that folder becomes history.

## Runtime picture

```
Red Team page ──HTTP──▶ FastAPI (routes/red_team.py → RedTeamService)
                              │ launch: one red_team_jobs row (kind "run") in the Mongo outbox
dispatcher ──▶ RabbitMQ {v, job_id, test_id, generation} ──▶ red-team worker (Python)
worker ─┬─ starts BridgeServer (127.0.0.1:<random port>, per-run bearer token)
        └─ runs promptfoo CLI (Node subprocess, own process group)
             1. redteam generate  (hosted generation, account email preset)  → suite file → red_team_suites
             2. redteam eval      (target = bridge provider; grader = org integration) → results.jsonl / results.json
promptfoo ─▶ backend/promptfoo_bridge/provider.py (stdlib only) ─POST loopback─▶ BridgeServer
BridgeServer ─▶ raw: ProviderService.execute  |  protected: ProtectedPromptService.execute_protected (frozen snapshot)
             └─ records the attack execution in red_team_attacks
worker tails results.jsonl ─▶ results parser ─▶ red_team_attacks verdicts ─▶ finalize test ─▶ report (pure aggregation)
```

## Folder structure

```
package.json, package-lock.json        spec 01: promptfoo 0.126.0 pinned, engines.node 24.x, no build script
backend/promptfoo_bridge/
  __init__.py, provider.py              spec 08: promptfoo target provider, standard library only
backend/app/red_team/
  risk_scoring.py                       kept unchanged (promptfoo formula port)
  promptfoo_catalog.json                spec 02: curated plugins/strategies with names, groups, severity, remote flag
  catalog.py                            spec 02: load + validate the catalog, expose registries
  promptfoo_frameworks.json             spec 03: extracted framework → plugin mapping
  framework_compliance.py               spec 03: load mapping, compliance status (old frameworks.py deleted by spec 19)
  config_builder.py                     spec 04: test document → promptfoo config + subprocess environment
  results_parser.py                     spec 05: promptfoo result rows → attack verdict updates
  bridge_server.py                      spec 09: loopback HTTP server that executes attacks
  runner.py                             spec 10: promptfoo subprocess orchestration
backend/app/services/
  red_team_report.py                    spec 06: pure report aggregation from a test + attacks (old red_team_report_v3.py / red_team_report_service.py / red_team_queries_v3.py deleted by spec 19)
  red_team_service.py                   spec 16 (rewritten): create/edit/launch/clone/cancel/reads
backend/app/workers/red_team_worker.py  spec 17 (rewritten around one run job)
backend/app/queue/recovery.py           spec 17 (run-job phases)
backend/scripts/
  extract_promptfoo_catalog.py          spec 02
  extract_promptfoo_frameworks.py       spec 03
  archive_legacy_red_team.py            spec 19
Frontend/src/services/redTeam/redTeamService.js   spec 07
Frontend/src/features/red-team/*                  specs 07, 11-15 (adapted components; LegacyReport.jsx and editorSummary.js removed by spec 19)
Frontend/src/pages/RedTeamPage.jsx                spec 18
```

## Layer boundaries

| Layer | Owns | Never does |
| --- | --- | --- |
| `catalog.py`, `framework_compliance.py`, `config_builder.py`, `results_parser.py`, `red_team_report.py`, `risk_scoring.py` | Pure data transforms | Database, network, subprocess, clock |
| `promptfoo_bridge/provider.py` | Forward one promptfoo call to the bridge, map the reply to promptfoo's provider response | Import anything from `app`, talk to MongoDB or an LLM |
| `bridge_server.py` | Authenticate the call, execute it through existing services, record it | Grade, spawn processes |
| `runner.py` | Workspace, environment, subprocess lifecycle, cancellation, tailing output | Execute attacks, write reports |
| Worker / recovery | Lease, phases, start/stop bridge + runner, persist, finalize | Parse promptfoo internals directly (always via `results_parser`) |
| `red_team_service.py` + routes | Tenant checks, validation, transactions, queries, DTOs | Run promptfoo, call providers |
| Feature components | Present props, raise callbacks | Call services or `fetch` |
| `RedTeamPage.jsx` | Routing inside the page, loading, mutations, polling | Re-implement component markup |

## Data model (intent level)

**`red_team_tests`** — `engine: "promptfoo"`; `name`; `purpose` (2-2000 chars, the application description given to promptfoo); target `integration_id` + `model`; `mode` raw|protected; `subject_user_id`; `plugins` (1-20 catalog ids); `strategies` (0-8 catalog ids; `basic` always implied); `tests_per_plugin` 1-10; `grader` {integration_id, model}; `threshold_score`; `suite_id` (null until generated; a clone inherits it); `promptfoo_version`; `status` draft|queued|generating|running|completed|partially_failed|failed|cancelling|cancelled; `failure_reason`; `counts` {planned, executed, graded}; `config_snapshot` at launch (target, prompt settings, policy snapshots, grader provider, catalog metadata); existing audit fields, `version`, `execution_revision`, `comparison_group_id`, timestamps.

**`red_team_suites`** — `company_id`, `test_id` that generated it, `promptfoo_version`, `config_hash`, `suite_text` (the generated promptfoo test file, ≤ 5 MB), `test_count`, `by_plugin`, `by_strategy`, `created_at`. Read by clones; never edited.

**`red_team_jobs`** — one per launched test, `kind: "run"`; existing outbox fields (state, dispatch_state, dispatch_generation, lease token/expiry, next_attempt_at, attempt history); `phase` claimed|generating|evaluating|importing|finished; `exit_code`; `error_code`.

**`red_team_attacks`** — one per promptfoo test result, unique on (`test_id`, `test_idx`, `repeat_index`): `company_id`, `plugin_id`, `strategy_id`, `severity`, `goal` (if promptfoo provides one); `prompt_ciphertext`, `response_ciphertext` (Fernet via `content_service`, honouring retention), `decision` allowed|blocked_input|blocked_output|error (from the bridge), `policy_evidence` (matched rule results outside `system_prompt`), `prevention_stage`; `verdict` pass|fail|error|pending, `verdict_source` policy|grader|none, `grader_reason` (≤ 1000 chars); `latency_ms`, token counts, `estimated_cost_usd`; `idempotency_keys`; `protected_run_id`; timestamps.

**Report payload** — keeps the current v3 report shape (`risk`, `attack_success`, `decided`, `threshold`, `plugins`, `strategies`, `compliance`, `controls` removed, `paired`, `trend`, `provisional`) plus `engine` {name, version, suite_id, generated_tests}, so spec 15's components change as little as possible.

## Bridge contract (shared by specs 08 and 09)

- Request: `POST /attack` on `127.0.0.1:<port>`, header `Authorization: Bearer <run token>`, JSON `{run_id, test_idx, repeat_index, plugin_id, strategy_id, prompt, idempotency_key}`; the provider derives `idempotency_key` as uuid5 of run id, test index, repeat index and the SHA-256 of the prompt, so promptfoo retries reuse it and each multi-turn turn differs.
- Response: `{output, error, token_usage {prompt, completion, total}, cost, latency_ms, guardrails {flagged, flagged_input, flagged_output, reason} | null, metadata {decision, attack_id}}`; HTTP 429 with a body containing "rate limit" when admission is busy past 120 s (promptfoo retries those); 409 when the run is cancelled; 401 for a bad token.
- The provider maps that to promptfoo's response keys (`output`, `error`, `tokenUsage`, `cost`, `guardrails`, `metadata`).

## Subprocess environment (built by spec 04, applied by spec 10)

`PROMPTFOO_CONFIG_DIR=<workspace>/home`, `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`, `PROMPTFOO_DISABLE_SHARING=true`, `PROMPTFOO_CACHE_ENABLED=false`, `FORCE_COLOR=0`, `CI` and similar CI variables explicitly removed (they replace the account email with a placeholder, `docs/research/promptfoo-redteam.md` §7), `PROMPTFOO_PYTHON=<worker sys.executable>`, `PYTHONPATH=<repo>/backend`, grader credentials via provider config (never `OPENAI_API_KEY`), `PATH` minimal. The account email is written into `<workspace>/home/promptfoo.yaml` before launch.

## Invariants (violating one is a defect)

1. Every target call goes through `ProviderService` (raw) or `ProtectedPromptService.execute_protected` (protected) with `IntegrationAdmission`; nothing else calls the target model.
2. The bridge listens on 127.0.0.1 only, for one run, with a fresh random token, and stops when the run ends.
3. RabbitMQ messages carry only `{v, job_id, test_id, generation}`.
4. An uncertain run is never replayed automatically; target calls are de-duplicated by idempotency key.
5. Exit codes 0 and 100 mean "eval completed"; 1 means failed; 0 generated tests is a failure (`no_tests_generated`) even with exit 0.
6. Cancellation sends SIGTERM to promptfoo's process group; already-imported results are kept.
7. Report risk, compliance and threshold exist only for terminal tests; running tests show provisional attack success.
8. Raw and protected tests in one comparison group share one `suite_id`.
9. `OPENAI_API_KEY` is never set in the promptfoo subprocess environment; API keys never appear in logs, config files left on disk after the run, or API responses.
10. Tenant scoping stays in `RedTeamService._tenant`; grader and target integrations must belong to the organization and be active.
11. Pure modules stay pure (see layer table); feature components never call services.
12. Raw colour values appear only in `DESIGN-SYSTEM.md` and `design/`.
13. Single owners for shared files: spec 16 alone edits `red_team_service.py`, `schemas/red_team.py`, `routes/red_team.py`, `db/indexes.py` (red-team part) and `docs/API_CONTRACTS.md`; spec 17 alone edits the worker and `recovery.py`; spec 18 alone edits `RedTeamPage.jsx` and `pages/red-team.css`; spec 01 alone edits root `package.json`, Procfiles and `DEPLOYMENT.md`; spec 19 alone deletes old engine files.

## Test seams

Pure modules: direct unit tests. Runner and worker: a fake `promptfoo` executable placed first on `PATH`/passed as the binary path, which writes a suite file, appends JSONL rows, honours SIGTERM and returns chosen exit codes. Bridge: real loopback server with fake `ProviderService` / `ProtectedPromptService`. Service/API: existing `test_database` fixture (skips without `TEST_MONGODB_URL`). Frontend: Testing Library from props; page test mocks `redTeamService.js`; Playwright intercepts every `/api` call (spec 20).
