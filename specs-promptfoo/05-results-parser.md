# Spec 05 — Results parser (port of the scheduler's row rules)

**Status:** Done
**Depends on:** Spec 02
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/results_parser.py`, `backend/tests/unit/test_results_parser.py`, `backend/tests/fixtures/promptfoo/`, `specs-promptfoo/inventory/05-results-parser.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `docs/research/promptfoo-integration.md`, `backend/app/red_team/catalog.py`

## Goal

Turn promptfoo's final results JSON into one normalized record per test case and repeat, using the owner's scheduler rules (`parse_redteam_json` row loop), with one unambiguous verdict. Also sanitize and count the generated suite so it can be stored without secrets.

## Scope

- `parse_results_json(text)` reads the eval output envelope (`results.results`, `results.stats`, `results.prompts`) and returns `ParsedResults` {`rows`, `stats` (promptfoo `successes`, `failures`, `errors`, `tokenUsage`, `durationMs`), `total_latency_ms` (`prompts[0].metrics.totalLatencyMs`), `skipped` (count by reason)}. Malformed JSON or a missing `results.results` raises `ArtifactParseError` with a reason that never echoes payload text.
- Per row, scheduler rules:
  - metadata = row `metadata`, else `testCase.metadata`; a row with neither is skipped (`no_metadata`).
  - plugin = `pluginId`; strategy = `strategyId`, default `basic`; severity = metadata `severity`, else the catalog default, else `medium`. The scheduler raised `KeyError` here; this must not.
  - `test_idx` = `testIdx`; `repeat_index` = `repeatIndex`, default 0; prompt = `prompt.raw`.
  - With a `gradingResult`: response = `response.output`, reason = `gradingResult.reason` (≤ 1000 chars), `passed` = `gradingResult.pass`. Without one: response = row `error`, reason = row `error`, the row is an error.
  - Also keep `latencyMs`, `response.tokenUsage` {prompt, completion, total, numRequests}, `cost`, `score`, `failureReason`, and the first assertion's `type` and `metric`.
  - From the bridge's response metadata (protected runs): `decision`, `protected_run_id`, `policy_evidence`, and `guardrails` flags.
- `decide(row, issued_run_ids)` returns `(verdict, source)`:
  - error row, or `gradingResult.metadata.graderError` present → `error`/`none`;
  - `decision` is `blocked_input`/`blocked_output`, `protected_run_id` is in `issued_run_ids` (runs the bridge issued in this run), and `policy_evidence` has a matched rule outside `system_prompt` → `pass`/`policy`;
  - `passed` true → `pass`/`grader`; false → `fail`/`grader`.
  - A `decision` without an issued run id is never policy authority.
- `count_progress(jsonl_text)` counts complete lines of the streamed `results.jsonl` (a trailing partial line is ignored). This is used only for live progress.
- `sanitize_suite(yaml_text)` uses `yaml.safe_load` and returns a dict holding only `tests`, `redteam` (without `provider`), `defaultTest.metadata` and `metadata.configHash`. It raises `SuiteSecretError` if any key named like `apiKey`, `api_key`, `token`, `secret`, `password`, `accessKeyId` or `secretAccessKey` remains anywhere, or if a test carries a `provider` with a `config` key. Also provide `count_suite_tests(suite)` and `suite_breakdown(suite)` → `by_plugin`, `by_strategy` (from each test's metadata).
- Remove the JSONL-row verdict path and the old bridge-record join; keep `ArtifactParseError`.

## Explicit non-scope

- Aggregation, risk and compliance → spec 06.
- Persistence, encryption and retention → spec 17.

## Reuse first

- Port the row loop of `parse_redteam_json` (`scheduler_umr/utils/runner.py`) as described in `docs/research/scheduler-reuse.md`. Do not port its Mongo writes, alerts or aggregation.
- Fixture rows follow the measured `EvaluateResult` fields in `docs/research/promptfoo-integration.md` §3; harmless placeholder text only.

## Steps

1. Replace the fixtures with a final-JSON sample: pass, fail, error row, graderError, metadata only in `testCase`, no metadata, multi-turn strategy, protected block with issued and unissued run ids, and a sample generated `redteam.yaml` with decoy keys in `targets` and `defaultTest.options.provider`.
2. Rewrite the module around those rules; keep it pure (catalog lookups are allowed, I/O is not).
3. Write the tests, then run the backend suite.

## Done when

- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_results_parser.py` passes: every fixture row classifies as the scheduler would; severity falls back without `KeyError`; graderError → error; policy authority only for an issued run id with a non-system-prompt rule; reason capped at 1000; malformed input raises without echoing content. [unit]
- [x] Same file: `sanitize_suite` strips `targets`, `outputPath`, `defaultTest.options` and `redteam.provider` from the sample, keeps every test, and raises `SuiteSecretError` for a key hidden inside a test; `count_suite_tests` and `suite_breakdown` match the sample; `count_progress` ignores a partial last line. [unit]
- [x] Fixtures contain no credentials, real dialogue or exploit payloads. [static]
- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-22**: First implemented (Codex) for a JSONL/bridge-record design; 37 tests.
- **2026-11-22**: Reopened by the planner: scheduler row rules on the final JSON, bridge metadata via promptfoo rows, suite sanitizer (spec 00 revision). Depends on spec 02 for severity fallback.

- **2026-11-23**: Ported the scheduler row loop into `results_parser.py`. Replaced the JSON and JSONL samples and suite YAML under `backend/tests/fixtures/promptfoo/` and updated `test_results_parser.py` and the inventory fragment. Reviewed fixture values for synthetic text and decoy values.
- Verified the installed `promptfoo/package.json` reports 0.126.0. The shipped `dist/src/index.d.ts` and final output writer in `util-D-qGdsMf.js` confirm the envelope, summary stats, first-prompt latency, result fields, response metadata, token usage and grader error marker. `evaluator-5tUcjTs8.js` confirms guardrail flag names and newline-terminated streaming writes. `main.js` confirms generated YAML copies the input and writes tests, default-test metadata, red-team settings and the config hash.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit/test_results_parser.py` returned 36 passed. `.venv/bin/python -m pytest -q tests/unit` returned 605 passed and the same five pre-existing report failures listed in spec 03. Those are owned by spec 06. `.venv/bin/python -m compileall -q app` exited 0. No integration checks were required.
- **2026-11-23**: After spec 06 corrected the framework lookups, the full backend unit gate reran with 620 passed, 0 failures and 8 warnings.
- **2026-11-23** (lead review, Claude): re-ran focused tests and the whole unit suite (620 passed). Spot-checked: policy verdict only for an issued run id with a non-`system_prompt` `outcome: match` rule; error row → error/none; `sanitize_suite` drops targets, keys and outputPath and catches a key hidden in a test.
