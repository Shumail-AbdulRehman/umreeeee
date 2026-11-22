# Spec 10 — promptfoo runner

**Status:** Not started
**Depends on:** Spec 04, Spec 05
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/runner.py`, `backend/tests/unit/test_promptfoo_runner.py`, `backend/tests/fixtures/fake_promptfoo.py`, `specs-promptfoo/inventory/10-promptfoo-runner.md`
**Reuses:** `backend/app/red_team/config_builder.py`, `backend/tests/unit/test_queue_resilience.py`

## Goal

Run a real promptfoo red-team scan as a subprocess: write the workspace, generate the attack suite with promptfoo's hosted generation (unless a stored suite is reused), evaluate it against the bridge target with the organization grader, stream results while they are produced, support cancellation and timeouts, and clean up.

## Scope

- `PromptfooRun(binary, workspace_root, config, account_yaml, env, suite_text=None, concurrency=2, timeout_seconds=7200)`; `binary` defaults to `<repo>/node_modules/.bin/promptfoo` (spec 01), overridable for tests.
- `events()` is a generator yielding, in order: `phase("generating")` (only when `suite_text` is None), `suite_ready(text, test_count)`, `phase("evaluating")`, `result_row(raw_json_line)` for each new line of `results.jsonl` as it appears (research `promptfoo-integration.md` §3: rows are appended as each test finishes), `phase("importing")`, `finished(status, exit_code, error_code, stderr_tail)`.
- Workspace: a new private directory (mode 0700) under `workspace_root` per run containing `home/promptfoo.yaml` (account email from spec 04), `promptfooconfig.json` (spec 04 config serialised as JSON; promptfoo accepts `.json` configs — confirm with `--help`/docs for 0.126.0 and note it in the Log), `redteam.yaml` (the suite).
- Generate: `<binary> redteam generate -c promptfooconfig.json -o redteam.yaml --strict` (verify `--strict` exists in 0.126.0; research `promptfoo-redteam.md` §1). Read the suite back, count tests with spec 05 `count_suite_tests`; 0 tests → `finished("failed", …, "no_tests_generated")` even when the exit code is 0 (local probe). When `suite_text` is given, write it as `redteam.yaml` and skip generation; the suite must also carry the current target config, so regenerate the target section from `config` before eval (document the method in the Log).
- Eval: `<binary> redteam eval -c redteam.yaml -o results.jsonl -o results.json --no-table --no-progress-bar -j <concurrency>`; exit 0 and 100 → `completed`, 1 → `failed` with `promptfoo_failed`; any other code → `failed`.
- Process control: start each subprocess in its own process group with the env from spec 04, stdout/stderr captured to files (bounded tail of 4 KB kept, with tokens, keys and the account email redacted); `cancel()` sends SIGTERM to the group, waits 10 s, then SIGKILL; after cancel `finished("cancelled", …)`. Overall timeout → cancel and `failed`/`timeout`. Missing binary → `failed`/`promptfoo_unavailable`; missing email → `failed`/`account_email_missing` before any process starts.
- After `finished`, delete the workspace (it holds the bridge token and grader key) unless `keep_workspace=True` (tests only).
- `backend/tests/fixtures/fake_promptfoo.py`: an executable test double that accepts the same two commands, writes a small suite and JSONL rows shaped like the research §3 examples (reuse spec 05 fixtures when present), sleeps between rows when asked, exits with a chosen code, writes 0 tests on request and honours SIGTERM.

## Explicit non-scope

- Mongo writes, leases, the bridge server and status updates → spec 17.
- Interpreting rows into verdicts → spec 05.

## Reuse first

- Suite counting uses spec 05 `results_parser.count_suite_tests`.
- Config, account file and environment come only from spec 04 (`config_builder.py`); do not rebuild env here.
- Follow the signal and timing style of `backend/tests/unit/test_queue_resilience.py` for deterministic tests (injectable sleep/clock).

## Steps

1. Implement workspace creation, the two commands, JSONL tailing (read new complete lines only), cancellation and cleanup.
2. Write the fake executable and the tests; tests set `binary` to the fake and never call the network.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_promptfoo_runner.py` passes: the happy path yields generating → suite_ready (count) → evaluating → rows → importing → finished(completed) in order, with the exact commands and env passed to the fake. [unit]
- [ ] Same file: exit 100 is `completed`; exit 1 is `failed` with a redacted stderr tail that contains no token, key or email; 0 generated tests is `no_tests_generated`. [unit]
- [ ] Same file: `suite_text` skips generation; `cancel()` during eval terminates the whole process group within 11 s and yields `cancelled`; timeout yields `timeout`; missing binary and missing email fail before any process starts. [unit]
- [ ] Same file: the workspace directory is removed after success, failure and cancellation. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]
