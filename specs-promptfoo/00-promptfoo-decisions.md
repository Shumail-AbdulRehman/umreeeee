# Spec 00 — Red Team on promptfoo: decisions

**Status:** Done
**Depends on:** —
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** —
**Reuses:** `docs/planning/promptfoo/brief.md`, `docs/planning/promptfoo/intake.md`, `docs/research/scheduler-reuse.md`, `docs/research/promptfoo-redteam.md`, `docs/research/promptfoo-integration.md`, `docs/research/promptfoo-local-probe.md`, `design/red-team/v3/`

## Goal

Record every decision the promptfoo specs inherit, with what lost and why, so no implementing session re-decides them. Revised on 2026-11-22 to build the Red Team on the owner's working scheduler (`docs/research/scheduler-reuse.md`), following the supervisor's flow.

## Scope

**Flow (supervisor, binding).** The admin builds a red-team config in our UI, in the shape promptfoo supports; the worker runs `promptfoo redteam run` on that config; promptfoo's results JSON is converted into our report format and shown in the UI. Lost: the in-house engine; Option A (promptfoo as an external tool).

**Reuse the scheduler, do not re-invent.** The owner's scheduler (`scheduler_umr`, permission held) is the reference implementation. Its `create_yaml`/`format_purpose` become the config builder (spec 04), `run_redteam` the runner (spec 10), `callback_func` the worker flow (spec 17), `parse_redteam_json` the parser and report (specs 05, 06) and `FRAMEWORKS` the framework data (spec 03). Its eight documented defects are fixed, not copied. Lost: the earlier from-scratch parser, report and framework extraction (replaced by ports that keep the report payload the finished UI specs 13–15 render).

**Engine.** promptfoo `0.126.0` (MIT), pinned in the root `package.json`, invoked by absolute path `<repo>/node_modules/.bin/promptfoo` as a subprocess of the Python red-team worker. First run of a test: `redteam run` (generation and evaluation). A clone that reuses a stored suite: `redteam eval` on the stored tests. Lost: the scheduler's forked promptfoo build and nvm paths; the JS API.

**Test case generation through promptfoo Cloud.** The runner logs in inside each run's private `PROMPTFOO_CONFIG_DIR` with `promptfoo auth login --host <PROMPTFOO_CLOUD_HOST> --api-key <PROMPTFOO_API_KEY>` (verified headless, local probe "Cloud API-key login"); being logged in makes generation remote. No email-verification step. Lost: the scheduler's private generation server (`PROMPTFOO_REMOTE_GENERATION_URL`, company infrastructure); local generation (aligned models refuse; 0 tests in the probe).

**Grading: the organization's own integration**, chosen per test, set only as `defaultTest.options.provider`. Never `redteam.provider` (it would also generate follow-up prompts for multi-turn strategies) and never `OPENAI_API_KEY` in the subprocess. Lost: promptfoo hosted grading (sends target replies to promptfoo; the scheduler used it implicitly).

**Targets.** Raw mode uses promptfoo's built-in provider for the integration exactly as the scheduler does (`groq:<model>`, `openai:chat:<model>` …, key in the target `config`). Protected mode uses a small bridge: a standard-library Python provider forwarding each test prompt over loopback to a server inside the worker that calls `ProtectedPromptService.execute_protected` with the frozen policy snapshot. Lost: a bridge for raw mode (unneeded); promptfoo's `http` provider to `/api/prompts/run` (needs a user JWT, uses live rather than frozen policies, returns 202 polling).

**Verdict authority.** promptfoo PASS means the target defended. Protected-mode block outside `system_prompt` → `pass`/`policy`. Otherwise `gradingResult.pass` true → `pass`/`grader`, false → `fail`/`grader`; no `gradingResult` (error row) → `error`/`none` (scheduler rule).

**Raw versus protected.** The sanitized generated suite is stored once; a clone evaluates the same tests against its own target, so the paired report compares identical test cases. Pairing is by suite and promptfoo `testIdx`.

**Results.** The eval writes `results.jsonl` (streamed, used only for live progress counts) and `results.json` (final, imported once, scheduler style) through the config's `outputPath` list.

**Catalog.** The committed catalog from spec 02 (24 plugins, 15 strategies) stays the source of names, groups (the scheduler's "parent" category) and severities. Frameworks: all nine of the scheduler's (`nist_ai_rmf`, `eu:ai-act`, `owasp:llm`, `owasp:api`, `mitre:atlas`, `owasp:agentic`, `iso:42001`, `gdpr`, `dod:ai:ethics`).

**Limits.** Estimated target calls ≤ 200 per test; tests per plugin 1–10; eval concurrency 2; one promptfoo run per worker; run timeout 2 hours.

**Execution model.** One queue job per test. Existing outbox, lease fencing and recovery stay. Interrupted before the suite exists → requeue; after → finalize `failed`/`interrupted` (never replay target calls).

**Legacy data.** Old-engine tests are archived to JSON and deleted by a one-off dry-run-first script (spec 19).

**Deployment.** Local only for now. Heroku notes from spec 01 stay documentation.

**Design.** `design/red-team/v3/` remains the visual source. The editor adds a read-only "promptfoo config" preview (redacted YAML) so the admin sees the config the UI generated.

**Testing.** Pytest with fakes (fake `promptfoo` executable, fake services); Vitest + Testing Library; Playwright with intercepted APIs only in spec 20. One live smoke run through the app API in spec 21.

**Implementer.** Codex (`gpt-6.2-sol`) implements every open spec; Claude reviews and runs the spec 21 live smoke. Live behaviour is the scope.

## Explicit non-scope

- Writing the config builder → spec 04.
- Writing the parser and report → spec 05 and spec 06.
- Deleting the old engine → spec 19.

## Steps

1. Confirm each decision against `docs/research/scheduler-reuse.md`, the three promptfoo research files and the intake.
2. Leave this file as the record; a changed decision needs a new decision spec.

## Done when

- [x] Every decision names what lost and why, and matches the intake answers (rows 7–10 added 2026-11-22). [static]
- [x] `python3 .ai/plan-project/scripts/validate-specs.py specs-promptfoo` reports no errors for this file. [static]

## Log

- **2026-11-22**: Recorded the planner's decisions. This completed decision record has no implementation issue.
- **2026-11-22**: Revised for the scheduler-based flow (owner and supervisor): reuse `scheduler_umr`, `redteam run`, raw via built-in providers, protected via a small bridge, grader only in `defaultTest.options.provider`, scheduler frameworks.
