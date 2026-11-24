# Reusing the owner's promptfoo scheduler (scheduler_umr)

Read by Claude on 2026-11-22. Source (read-only, outside the repo): `/home/shumail/Downloads/scheduler_umr/scheduler_umr/`.
The owner holds permission to reuse this code in the FYP ("i have permision of it"). It is a working production
red-team scheduler built on promptfoo. The supervisor's required flow is the same flow it implements:

> The user builds a red-team config in our UI, in the shape promptfoo supports; we run `promptfoo redteam` with that
> config; the JSON promptfoo produces is converted into our own format and shown in the UI. (Owner, 2026-11-22,
> translated from Roman Urdu.)

Nothing from this folder is copied verbatim into the repo. Specs port its **logic** into the app's modules, without its
hostnames, credentials, certificate paths, Teams webhooks, Mongo collections or hard-coded `/home/...` paths. Its
`redteam_err.log` contains a live webhook URL; never copy any log file.

## What each file is

| File | What it does | Used by the redesign |
| --- | --- | --- |
| `job_scheduler.py` | Red-team worker. `callback_func(body)`: load the request document, set status "In Progress", decrypt the target account, map model ids, `create_yaml(data)`, `run_redteam(yaml, id)`, `parse_redteam_json(json)`, save results, update `next_scan`. | **Yes**: worker flow (spec 17), config (spec 04), runner (spec 10). |
| `utils/runner.py` | `parse_redteam_json(path, namespace, request_id, scan_time, last_scan)`: classifies every result row, tallies per plugin / strategy / category, ASR, risk score, framework control status, compliance summary, trend `delta()`. | **Yes**: parser (spec 05) and report (spec 06). |
| `utils/constants.py` → `FRAMEWORKS` | 9 frameworks, controls → mapped plugin ids with names and severity: `nist_ai_rmf` (21 controls), `eu:ai-act` (14), `owasp:llm` (10), `owasp:api` (10), `mitre:atlas` (6), `owasp:agentic` (10), `iso:42001` (7), `gdpr` (7), `dod:ai:ethics` (5) (counts verified 2026-11-23). | **Yes**: framework data (spec 03). The rest of the file (servers, passwords, cert paths) is never read into the repo. |
| `utils/risk_scoring.py` | Python port of promptfoo `riskScoring.ts`. | Already ported as `backend/app/red_team/risk_scoring.py` (credited). Unchanged. |
| `eval_scheduler.py`, `utils/eval_runner.py` | Plain `promptfoo eval` jobs (not red team). | Only the pattern "re-run a stored test file with `eval`" (clone reuse, spec 10). |
| `batch_scheduler.py` | DLP batch detection over email. | No. |
| `classes/rabbit_mq.py`, `utils/mongo_connection.py`, `utils/teams_alert.py` | Their broker, DB and alert plumbing. | No: the app already has `queue/`, `db/`, audit and notifications. |
| `bak_*`, `utils/back_runner.py`, `utils/bak_runner_8_may.py`, `utils/json_parser_after_scan.py` | Older copies of the same logic. | No: `utils/runner.py` is the current version. |

## The scheduler's config (`create_yaml`)

- `description` = target name; `prompts` = `"{{prompt}}"`; one entry in `targets`: `id` = `<redteam_service>:<model>`
  (bedrock: `bedrock:<model>`), `label`, `config` = `{temperature 0.7, max_tokens 250, apiKey}`, `delay`.
- `redteam`: `numTests`, `maxConcurrency`, `plugins` = `[{id, config?}]` (per-plugin config only for non-empty values),
  `strategies` = `[{id, config?}]` likewise, `purpose` formatted by `format_purpose` (a dict becomes `Title:` + fenced
  value blocks; a string is used as is, written as a YAML block scalar), optional `testGenerationInstructions`.
- `defaultTest`: `{vars: {}, options: {transformVars: '{ ...vars, sessionId: context.uuid }'}}`.
- `outputPath` = the results JSON path. Written with ruamel (`width 4096`, block scalars kept).

## The scheduler's run (`run_redteam`)

`node <promptfoo>/dist/src/main.js redteam run --remote --verbose --no-cache -c <yaml> --output <id>.json`,
stdout+stderr merged and streamed; return codes `0` and `100` are success; anything else marks the scan `Error` and
copies `promptfoo-errors.log`. Generation is pointed at the company's own server through
`PROMPTFOO_REMOTE_GENERATION_URL` / `PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT`; the FYP uses promptfoo Cloud login
instead (spec 00), so those two variables are never set.

## The scheduler's parser (`parse_redteam_json`)

Per row of `results.results`:
- `gradingResult` present → `pass` = `gradingResult.pass`, reason = `gradingResult.reason`, response key `output`,
  score = row `score`. Absent → error row: reason = row `error`, response key `error`, score `-1`.
- Metadata = row `metadata`, else `testCase.metadata`; a row with neither is skipped. Plugin = `pluginId`; strategy =
  `strategyId` default `basic`; severity from metadata.
- Kept per row: plugin, strategy, pass, reason, id, `testIdx`, `latencyMs`, `response.tokenUsage`, `failureReason`,
  prompt (`prompt.raw`), response, score, first assertion's `metric` and `type`, plus the metadata keys.
- Tallies (plugin, strategy, plugin×strategy, category, category×strategy): `total`, `passed`, `failed`, `error`.
  Failed rows add to a severity counter. ASR = `failed / total × 100`, rounded to 2.
- Risk: per plugin, every strategy with ASR > 0 becomes `StrategyTestResult(id, total, passed=failed,
  failed=passed)` (promptfoo's inverted convention) → `calculate_plugin_risk_score`; system and category scores via
  `calculate_system_risk_score` over plugin scores.
- Frameworks: per control, each mapped plugin that ran is `Failed` (any failed), `Error` (all rows errored) or `Passed`
  (any passed); control = Failed if any mapped plugin failed, else Passed if any passed, else Error; no mapped plugin ran
  → `Not Tested`. Framework status the same over controls. Compliance summary per framework: controls `total`,
  `failed`, `passed`, `not_tested`, `coverage = passed / total × 100`.
- Trend: `delta(curr, prev)` → `(pct, direction)` capped at 100, against the previous scan's stored scores.
- Totals: `stats` from promptfoo (`successes`, `failures`, `errors`, `tokenUsage`), `totalLatencyMs` from
  `prompts[0].metrics`, overall ASR = `failures / (failures + successes)`.

## Defects in the scheduler the redesign must not copy

1. **Output path collision.** In promptfoo 0.126.0 `doRedteamRun` passes `-o` both to generation (the suite file) and
   to the eval (`output: options.output ? [options.output] : undefined`; `node_modules/promptfoo/dist/src/main.js`
   `doRedteamRun`). The scheduler's `--output <id>.json` therefore writes the generated suite, then overwrites it with
   the results. It works by accident and loses the suite. Redesign: no `-o` on `redteam run`; the suite goes to the
   default `redteam.yaml` beside the config, results go to the config's `outputPath`.
2. **`--no-cache` is ignored by the eval half of `redteam run`.** `doRedteamRun` calls `doEval({...evalOptions, cache:
   true, ...})`. Use `PROMPTFOO_CACHE_ENABLED=false` in the environment instead (already in spec 04's environment).
3. **Secrets in the generated suite.** `redteam generate` writes `{...existingYaml, defaultTest, tests, redteam,
   metadata}`. The whole input config is copied, including `targets[].config.apiKey` and the grader's key. A stored
   suite must be sanitized (spec 05 `sanitize_suite`) before it is saved; the scheduler never stored suites.
4. **Inconsistent ASR denominators.** Per plugin/strategy ASR counts errors in the denominator; the overall ASR does
   not. Redesign: one rule everywhere: `failed / (passed + failed)`; errors are reported separately (decided by the
   owner's report shape, spec 06).
5. **`stats[_metadata.get("severity")] += 1` raises `KeyError`** when a row has no or an unexpected severity
   (`inferenceModelType` KeyErrors in `redteam_err.log` show the same pattern). Redesign: severity falls back to the
   catalog, then `medium`.
6. **"No test cases generated. Skipping scan."** exits `0` with no results file. The scheduler then fails at
   `load_json_file` with `FileNotFoundError` (two occurrences in `redteam_err.log`). Redesign: no results file or zero
   generated tests → `failed` / `no_tests_generated`.
7. Mutable global state (`yaml_path` fixed at `/home/proj-alpha/scheduler/promptfooconfig.yaml`) means two concurrent
   scans overwrite each other's config. Redesign: one private workspace per run.
8. The field name `complinace` (typo) is written next to `compliance`. Redesign: `compliance` only.

## promptfoo 0.126.0 facts checked on 2026-11-22 (installed package at the repo root)

- `promptfoo redteam run --help`: `-c`, `-o` ("Path to output file for generated tests. Defaults to redteam.yaml in
  the same directory as the configuration file"), `--no-cache`, `-j/--max-concurrency`, `--delay`, `--remote`,
  `--force`, `--no-progress-bar`, `--strict`, `-d`, `-v`.
- `promptfoo redteam eval --help`: `-c <paths...>`, `-o <paths...>` (csv, html, json, jsonl, …), `-j` (default 4),
  `--no-cache`, `--no-table`, `--no-write`, `--grader <provider>`, `--no-progress-bar`.
- `promptfoo auth login --help`: `-o/--org`, `-h/--host`, `-k/--api-key`, `-t/--team`.
- Config `outputPath` accepts a string or an array of strings (`dist/src/index.d.ts`). The eval path reads
  `cmdObj.output || fileConfig.outputPath` (`main.js`), so with no `-o` the config's list is used. JSONL outputs are
  appended per finished result and rewritten at the end (`docs/research/promptfoo-integration.md` §3).
- Grader choice: local when `defaultTest.options.provider` is set; `redteam.provider` must **not** be set, because it
  also generates test prompts for iterative or multi-turn strategies (`crescendo`, `goat`, `jailbreak:*`), where an aligned
  model refuses (`docs/research/promptfoo-redteam.md` §§0, 6). The earlier spec 04 put the grader in both places; that
  was wrong.
- Being logged in to promptfoo Cloud already makes generation remote; `--remote` is not needed and is not used.
