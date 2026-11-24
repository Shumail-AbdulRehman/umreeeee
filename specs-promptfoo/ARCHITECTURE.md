# Red Team on promptfoo — architecture

Derived on 2026-11-22 from the code, `docs/research/scheduler-reuse.md`, `docs/research/promptfoo-*.md` and spec 00. Paths are relative to the repo root. This set replaces the in-house engine described in `specs-red-team/`; that folder is history. The owner's scheduler (`/home/shumail/Downloads/scheduler_umr/scheduler_umr`, read-only) is the reference implementation every backend spec ports from.

## Runtime picture (supervisor's flow)

```
Red Team page ── editor builds the test ──HTTP──▶ FastAPI (routes/red_team.py → RedTeamService)
      ▲            GET …/config-preview ◀── spec 04 build_redteam_config (redacted YAML)
      │          launch: one red_team_jobs row (kind "run") in the Mongo outbox
      │   dispatcher ──▶ RabbitMQ {v, job_id, test_id, generation} ──▶ red-team worker (port of callback_func)
      │   worker: claim lease → load test + frozen snapshot → decrypt target + grader keys
      │           protected only: start BridgeServer (127.0.0.1:<random>, per-run token)
      │           spec 04 config ─▶ spec 10 PromptfooRun (own workspace, own process group)
      │             1. promptfoo auth login (Cloud API key)       inside <ws>/home
      │             2a. first run : promptfoo redteam run  -c <ws>/promptfooconfig.yaml   (generate + eval)
      │             2b. clone     : promptfoo redteam eval -c <ws>/redteam.yaml            (stored suite, no generation)
      │             eval writes outputPath [<ws>/results.jsonl (progress), <ws>/results.json (final)]
      │   target, raw       : promptfoo built-in provider (groq:/openai:chat:/…) → the model
      │   target, protected : backend/promptfoo_bridge/provider.py ─POST loopback─▶ BridgeServer
      │                       ─▶ ProtectedPromptService.execute_protected (frozen snapshot)
      │   grader            : defaultTest.options.provider = organization integration
      │   worker: sanitized suite → red_team_suites; results.json → spec 05 rows → red_team_attacks
      └── report: spec 06 build_report (port of parse_redteam_json aggregation) ◀── GET …/report
```

## Folder structure

```
package.json, package-lock.json        spec 01 (done): promptfoo 0.126.0 pinned
backend/promptfoo_bridge/
  __init__.py, provider.py              spec 08: protected-mode target provider, standard library only
backend/app/red_team/
  risk_scoring.py                       kept unchanged (port of promptfoo riskScoring.ts, from the scheduler)
  promptfoo_catalog.json, catalog.py    spec 02 (done): plugins/strategies, groups, severity
  scheduler_frameworks.json             spec 03: the scheduler's FRAMEWORKS, ported as data
  framework_compliance.py               spec 03: scheduler control/framework status rules
  config_builder.py                     spec 04: port of create_yaml/format_purpose + environment
  results_parser.py                     spec 05: port of the scheduler row rules + suite sanitizer
  bridge_server.py                      spec 09: loopback server for protected mode
  runner.py                             spec 10: port of run_redteam (subprocess lifecycle)
backend/app/services/
  red_team_report.py                    spec 06: port of the scheduler aggregation into the report payload
  red_team_service.py                   spec 16: create/edit/preview/launch/clone/cancel/reads
backend/app/workers/red_team_worker.py  spec 17: port of callback_func around one run job
backend/app/queue/recovery.py           spec 17: run-job phases
backend/scripts/
  port_scheduler_frameworks.py          spec 03
  archive_legacy_red_team.py            spec 19
Frontend/src/features/red-team/*        specs 07, 11–15 (ConfigPreview.jsx: spec 11)
Frontend/src/pages/RedTeamPage.jsx      spec 18
```

## Layer boundaries

| Layer | Owns | Never does |
| --- | --- | --- |
| `catalog.py`, `framework_compliance.py`, `config_builder.py`, `results_parser.py`, `red_team_report.py`, `risk_scoring.py` | Pure data transforms | Database, network, subprocess, clock |
| `promptfoo_bridge/provider.py` | Forward one protected test prompt to the bridge; map the reply to promptfoo's provider response | Import `app`, talk to MongoDB or a model |
| `bridge_server.py` | Authenticate, de-duplicate and evaluate protected test prompts through `ProtectedPromptService` | Grade, spawn processes, store case results |
| `runner.py` | Workspace, login, subprocess lifecycle, cancellation, timeout, progress counting, cleanup | Evaluate test prompts, parse verdicts, write Mongo |
| Worker / recovery | Lease, phases, keys, bridge + runner lifecycle, persistence, finalize | Interpret promptfoo rows directly (always via `results_parser`) |
| `red_team_service.py` + routes | Tenant checks, validation, transactions, queries, DTOs, config preview | Run promptfoo, call providers |
| Feature components | Present props, raise callbacks | Call services or `fetch` |

## Data model (intent level)

**`red_team_tests`**: `engine: "promptfoo"`; `name`; `purpose` (20–2000 chars, promptfoo `redteam.purpose`); target `integration_id` + `model`; `mode` raw|protected; `subject_user_id` (protected); `plugins` (1–20 catalog ids); `strategies` (0–8 catalog ids; `basic` implied); `tests_per_plugin` 1–10; `grader` {integration_id, model}; `threshold_score`; `suite_id` (null until generated; a clone inherits it); `promptfoo_version`; `status` draft|queued|generating|running|completed|partially_failed|failed|cancelling|cancelled; `failure_reason`; `counts` {planned, executed, graded}; `config_snapshot` at launch; audit fields, `version`, `execution_revision`, `comparison_group_id`, timestamps.

**`red_team_suites`**: `company_id`, `test_id` that generated it, `promptfoo_version`, `config_hash`, `suite` (sanitized: `tests`, `redteam` without providers, `defaultTest.metadata`; no keys, tokens, targets or `outputPath`; ≤ 5 MB), `test_count`, `by_plugin`, `by_strategy`, `created_at`. Read by clones; never edited.

**`red_team_jobs`**: one per launched test, `kind: "run"`; existing outbox fields; `phase` claimed|generating|evaluating|importing|finished; `exit_code`; `error_code`.

**`red_team_attacks`**: one per promptfoo result row, unique on (`company_id`, `test_id`, `test_idx`, `repeat_index`): `plugin_id`, `strategy_id`, `severity`, `prompt_ciphertext`, `response_ciphertext` (Fernet via `content_service`, retention honoured), `decision` allowed|blocked_input|blocked_output|error|none, `policy_evidence`, `protected_run_id`, `verdict` pass|fail|error, `verdict_source` policy|grader|none, `grader_reason` (≤ 1000 chars), `assert_type`, `assert_metric`, `latency_ms`, token counts, `cost_usd`, timestamps.

**Report payload**: unchanged keys the finished UI renders (`risk`, `attack_success`, `decided`, `threshold`, `plugins`, `strategies`, `compliance`, `paired`, `trend`, `provisional`, `engine`) plus additive `categories` and `severity_counts` from the scheduler port.

## Bridge contract (protected mode only; specs 08 and 09)

- Request: `POST /attack` on `127.0.0.1:<port>`, `Authorization: Bearer <run token>`, JSON `{run_id, session_id, plugin_id, strategy_id, prompt, idempotency_key}`. `session_id` is the `sessionId` var the config's `defaultTest.options.transformVars` sets per test case (scheduler); `idempotency_key` = uuid5 over run id, session id and SHA-256 of the prompt, so promptfoo retries reuse it and each multi-turn turn differs.
- Response: `{output, error, token_usage {prompt, completion, total}, cost, latency_ms, guardrails {flagged, flagged_input, flagged_output, reason} | null, metadata {decision, protected_run_id, policy_evidence [{field, outcome: "match", rule_id, policy_name}]}}`; 409 when the run is cancelled; 401 bad token; 400 invalid input; 429 "rate limit" when the policy pipeline reports rate limiting.
- The provider maps that to promptfoo's response keys (`output`, `error`, `tokenUsage`, `cost`, `latencyMs`, `guardrails`, `metadata`). promptfoo copies `response.metadata` and `guardrails` into the result row, which is how spec 05 sees the policy decision.

## Subprocess environment (built by spec 04, applied by spec 10)

Start from `PATH`, `HOME`, `LANG` only. Set `PROMPTFOO_CONFIG_DIR=<ws>/home`, `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`, `PROMPTFOO_DISABLE_SHARING=true`, `PROMPTFOO_CACHE_ENABLED=false` (the eval half of `redteam run` forces `cache: true`, so `--no-cache` alone is not enough), `FORCE_COLOR=0`, `PROMPTFOO_PYTHON=<worker sys.executable>`, `PYTHONPATH=<repo>/backend`. Remove `OPENAI_API_KEY`, `CI`, `GITHUB_ACTIONS`, `BUILD_NUMBER`, `PROMPTFOO_DISABLE_REMOTE_GENERATION`, `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION`, `PROMPTFOO_REMOTE_GENERATION_URL`, `PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT`. Model keys live only inside provider `config` entries of the workspace config file, which is deleted with the workspace.

## Invariants (violating one is a defect)

1. Protected-mode target calls go only through `ProtectedPromptService.execute_protected` with the frozen snapshot. Raw-mode calls go from promptfoo's built-in provider straight to the integration's model, as the scheduler does; nothing else calls the target.
2. The bridge exists only for protected runs, listens on 127.0.0.1 only, uses a fresh random token, and stops when the run ends.
3. RabbitMQ messages carry only `{v, job_id, test_id, generation}`.
4. An uncertain run is never replayed automatically; protected calls are de-duplicated by idempotency key.
5. Exit codes 0 and 100 mean "eval completed"; any other code is `promptfoo_failed`; no `results.json` or zero generated tests is `no_tests_generated` even with exit 0.
6. Cancellation sends SIGTERM to promptfoo's process group, SIGKILL after 10 s; already-imported results are kept.
7. Risk, compliance and threshold exist only for terminal tests; running tests show provisional counts.
8. Raw and protected tests in one comparison group share one `suite_id`; a clone with a suite never generates.
9. No API key, bridge token or Cloud key appears in logs, stored suites, API responses, the config preview or files left after the run. `OPENAI_API_KEY` is never in the subprocess environment; `redteam.provider` is never set.
10. Tenant scoping stays in `RedTeamService._tenant`; target and grader integrations belong to the organization and are active.
11. Pure modules stay pure (see layer table); feature components never call services.
12. Raw colour values appear only in `DESIGN-SYSTEM.md` and `design/`.
13. Single owners: spec 16 alone edits `red_team_service.py`, `schemas/red_team.py`, `routes/red_team.py`, `db/indexes.py` and `docs/API_CONTRACTS.md`; spec 17 alone edits the worker and `recovery.py`; spec 18 alone edits `RedTeamPage.jsx` and `pages/red-team.css`; spec 19 alone deletes old engine files.
14. Nothing from `scheduler_umr` is copied verbatim: no hostnames, credentials, certificate paths, webhooks, Mongo collection names or `/home/...` paths.

## Test seams

Pure modules: direct unit tests with synthetic promptfoo JSON shaped like `docs/research/promptfoo-integration.md` §3. Runner and worker: the fake executable `backend/tests/fixtures/fake_promptfoo.py` (spec 10) implements `auth login`, `redteam run` and `redteam eval`: it reads the config, writes `redteam.yaml`, appends JSONL rows, writes the final JSON, honours SIGTERM and returns chosen exit codes. For protected runs it calls the configured bridge provider module for each test, so the real bridge is exercised. Bridge: real loopback server with a fake `ProtectedPromptService`. Service/API: `test_database` fixture (skips without `TEST_MONGODB_URL`). Frontend: Testing Library from props; Playwright intercepts every `/api` call (spec 20).
