# Spec 10 — promptfoo runner (port of run_redteam)

**Status:** Done
**Depends on:** Spec 04, Spec 05
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/runner.py`, `backend/tests/unit/test_promptfoo_runner.py`, `backend/tests/fixtures/fake_promptfoo.py`, `specs-promptfoo/inventory/10-promptfoo-runner.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `backend/app/red_team/config_builder.py`, `backend/app/red_team/results_parser.py`, `backend/tests/unit/test_queue_resilience.py`

## Goal

Run one live promptfoo test as a subprocess, porting the scheduler's `run_redteam`. Log in to promptfoo Cloud, run `promptfoo redteam run` on the config (or `promptfoo redteam eval` on a stored suite for a clone), report phases and progress while it runs, hand back the final results JSON, and support cancellation, timeouts and cleanup.

## Scope

- The untracked local-fixture `runner.py` and `fake_promptfoo.py` in the working tree (network namespace, canned two-case comparison) are replaced entirely.
- `PromptfooRun(binary, workspace_root, config, *, cloud_host, cloud_api_key, env, suite=None, concurrency=2, timeout_seconds=7200, clock, sleep)`. `config` is spec 04's dict built for this run's workspace. `binary` defaults to `<repo>/node_modules/.bin/promptfoo` (spec 01).
- Workspace: a new private directory (mode 0700) under `workspace_root`, holding `home/` (`PROMPTFOO_CONFIG_DIR`), the config file and promptfoo's outputs. Remove it after `finished` unless `keep_workspace=True` (tests only); it holds keys and the bridge token.
- `events()` yields, in order:
  - `phase("logging_in")`. Run `auth login` with spec 04 `cloud_login_args` and the spec 04 environment. A non-zero exit or no "Successfully logged in" → `finished("failed", …, "promptfoo_auth_failed")`, with the key redacted from captured output.
  - First run (`suite` is None): write `promptfooconfig.yaml` (spec 04 `to_yaml`), yield `phase("generating")`, then start `<binary> redteam run -c promptfooconfig.yaml --no-progress-bar -j <concurrency>`.
    - No `-o`: promptfoo sends both the suite and the results to `-o`. The suite goes to the default `redteam.yaml` beside the config; results go to the config's `outputPath`.
    - No `--remote` (the Cloud login already makes generation remote). No `--strict` (one plugin failing to generate must not fail the full test run; spec 17 records per-plugin counts).
    - When `redteam.yaml` appears and parses, yield `suite_ready(sanitized_suite, test_count)` using spec 05 `sanitize_suite` and `count_suite_tests`, then `phase("evaluating")`. A `SuiteSecretError` cancels the run → `failed`/`suite_contains_secret`.
  - Clone (`suite` given): write `redteam.yaml` from spec 04 `build_clone_config` output, yield `phase("evaluating")`, run `<binary> redteam eval -c redteam.yaml --no-table --no-progress-bar -j <concurrency>`.
  - While evaluating: `progress(executed)` whenever spec 05 `count_progress` on `results.jsonl` increases (poll ≤ 1 s).
  - At exit: `phase("importing")`, then `finished(status, exit_code, error_code, output_tail, results_path)`.
    - Exit 0 or 100 with `results.json` present → `completed`. Exit 0 with no `results.json`, or stdout containing "No test cases generated" → `failed`/`no_tests_generated`. Any other exit → `failed`/`promptfoo_failed`.
    - `output_tail` is the last 4 KB of merged stdout/stderr (the scheduler merged them), plus on failure the newest `home/logs/promptfoo-error-*.log` tail (the scheduler copied `promptfoo-errors.log`). Keys, tokens and Cloud key are redacted from both.
- Process control: start every subprocess in its own process group with spec 04's environment and stdin closed. `cancel()` sends SIGTERM to the group, waits 10 s, then SIGKILL → `finished("cancelled", …)`. The overall timeout → cancel → `failed`/`timeout`. A missing binary → `failed`/`promptfoo_unavailable` and a missing key → `failed`/`promptfoo_api_key_missing`, both before any process starts.
- `backend/tests/fixtures/fake_promptfoo.py` is an executable test double for `auth login`, `redteam run` and `redteam eval`:
  - It reads the YAML config and writes `redteam.yaml` as promptfoo does, copying the whole input config including target keys, so the sanitizer is exercised. It writes one test per plugin × `numTests` × (basic + strategies).
  - For a `file://` target it imports that provider and calls `call_api` per test, so the real bridge is exercised; otherwise it fabricates harmless output.
  - It appends JSONL rows, then writes the final JSON shaped like `docs/research/promptfoo-integration.md` §3.
  - Behaviour switches come from environment variables: zero tests, login failure, exit code, delay per row, ignore SIGTERM.

## Explicit non-scope

- Mongo writes, leases, the bridge server, status updates and importing rows → spec 17.
- Interpreting rows into verdicts → spec 05.

## Reuse first

- Port `run_redteam` from `scheduler_umr/job_scheduler.py` (merged output, return codes 0/100, error-log capture), fixing defects 1, 2, 6 and 7 in `docs/research/scheduler-reuse.md`. Config, environment and login arguments come only from spec 04; suite and progress helpers from spec 05. Use injectable clock/sleep as in `test_queue_resilience.py`.

## Steps

1. Implement workspace, login, the two command paths, suite detection, progress polling, cancellation and cleanup.
2. Write the fake and the tests; tests set `binary` to the fake and never touch the network.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_runner.py` passes: a first run yields logging_in → generating → suite_ready (sanitized, count) → evaluating → progress… → importing → finished(completed) with the exact argv (no `-o`, no `--remote`) and environment given to the fake. [unit]
- [ ] Same file: a clone runs `redteam eval` with no generation; exit 100 is `completed`; exit 1 is `promptfoo_failed` with a redacted tail; zero tests is `no_tests_generated`; a suite with a hidden key is `suite_contains_secret`. [unit]
- [ ] Same file: `cancel()` during eval ends the whole process group within 11 s → `cancelled`; timeout → `timeout`; missing binary and missing key fail before any process starts; a failing login → `promptfoo_auth_failed`; the workspace is removed in every path. [unit]
- [ ] `grep -n "unshare\|run_fixture\|FixtureEvaluationError" backend/app/red_team/runner.py` returns nothing. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-23:** Replaced the fixture evaluator with the Promptfoo CLI lifecycle, private workspace, cancellation and safe output tail. Focused bridge/runner suite: 8 passed; full backend unit: 481 passed.
