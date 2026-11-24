# Spec 04 — promptfoo config and environment builder (port of create_yaml)

**Status:** Done
**Depends on:** Spec 02
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/config_builder.py`, `backend/tests/unit/test_config_builder.py`, `specs-promptfoo/inventory/04-promptfoo-config-and-environment-builder.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `backend/app/red_team/catalog.py`, `backend/app/services/llm_integration_service.py`, `docs/research/promptfoo-redteam.md`

## Goal

Turn a test (and, at launch, its frozen snapshot) into the promptfoo red-team config the UI promised, by porting the scheduler's `create_yaml` and `format_purpose`. Also build the clone config that re-evaluates a stored suite, a redacted preview for the editor, the Cloud login arguments and the subprocess environment. Pure functions only; writing files and running the CLI belong to spec 10.

## Scope

- Replace the committed local-fixture module entirely: `build_fixture_config`, `fixture_suite_id`, the canned cases and `PROMPTFOO_DISABLE_*REMOTE_GENERATION=true` must not survive.
- `provider_id(provider, model)` and `provider_config(integration, model, api_key, settings)` map an organization integration to a promptfoo built-in provider; use the pair for the raw target and the grader:
  - groq → `groq:<model>`; openai → `openai:chat:<model>`;
  - deepseek → `openai:chat:<model>` with DeepSeek's `apiBaseUrl`; anthropic → `anthropic:messages:<model>`;
  - gemini → `google:<model>`; ollama → `ollama:chat:<model>` with the integration base URL.
  - The key goes only in `config.apiKey`. Settings: `temperature` and `max_tokens` from the snapshot; the scheduler hard-coded 0.7 and 250.
  - Verify each id and config key name in `node_modules/promptfoo` and list them in the Log. Any other provider raises `unsupported_provider`.
- `build_redteam_config(test, snapshot, *, target_key, grader_key, workspace, bridge=None)` returns a dict mirroring `create_yaml`:
  - `description` = test name; `sharing: false`.
  - `prompts`: protected mode → `["{{prompt}}"]`. Raw mode with a non-empty frozen system instruction → one chat-message JSON prompt (system message, then user `{{prompt}}`), so raw and protected see the same instructions; otherwise `["{{prompt}}"]`.
  - `targets`, exactly one: raw → the built-in provider, label `<integration name> · <model> · raw`, `delay: 0`. Protected → `file://<repo>/backend/promptfoo_bridge/provider.py` with `config` {`url`, `token`, `run_id`, `timeout_seconds: 330`, `workers: 2`}. `bridge` is required in protected mode.
  - `redteam`: `purpose` via `format_purpose` (a dict becomes titled fenced blocks, a string is used as is), `numTests` = tests per plugin, `maxConcurrency: 2`, `injectVar: "prompt"`. `plugins` = one {`id`, `numTests`, `severity` from the catalog} per selected plugin; `strategies` = [{`id`}] for the selected strategies minus `basic` (verify in the Log that 0.126.0 adds `basic` by default). Never `redteam.provider`.
  - `defaultTest`: {`vars: {}`, `options`: {`transformVars: "{ ...vars, sessionId: context.uuid }"` (scheduler; gives the bridge a per-test session id), `provider` = grader}}.
  - `outputPath` = [`<workspace>/results.jsonl`, `<workspace>/results.json`]. Never an `-o` path; see the collision defect.
- `build_clone_config(test, snapshot, suite, *, target_key, grader_key, workspace, bridge=None)`: the same base config plus the stored sanitized suite's `tests`, its `redteam` (merged under the base), and its `defaultTest.metadata`. promptfoo evaluates these tests without generating.
- `to_yaml(config)` serialises with PyYAML `safe_dump`: insertion order, width 4096, multi-line strings as literal blocks (the scheduler's ruamel intent).
- `config_preview(test, snapshot_or_draft)` returns the YAML with every key, token and bridge URL replaced by `***` and paths by `<workspace>`. This is what the editor shows.
- `redact(config)`, `cloud_login_args(host, api_key)` / `cloud_login_redacted(...)` (`auth login --host … --api-key …`, host default `https://www.promptfoo.app`, empty key → `promptfoo_api_key_missing`), `subprocess_env(base_env, workspace, python_executable, repo_root)` exactly per ARCHITECTURE "Subprocess environment", and `config_hash(test)` (SHA-256 over purpose, sorted plugins with counts, sorted strategies and promptfoo version; independent of target, mode and grader).

## Explicit non-scope

- Writing the workspace and running the CLI → spec 10.
- Decrypting keys and loading the snapshot → spec 16 (launch) and spec 17 (worker).

## Reuse first

- Port `create_yaml`/`format_purpose` from `scheduler_umr/job_scheduler.py` as summarized in `docs/research/scheduler-reuse.md` (drop the bedrock branch, hard-coded paths, Teams alerts and file writes).
- Plugin/strategy ids and severities come from `catalog.py`; provider names match `SUPPORTED_PROVIDERS` in `llm_integration_service.py`.

## Steps

1. Read the scheduler functions and the research sections named above; confirm each promptfoo key in the installed package.
2. Implement the functions with typed errors (`unsupported_provider`, `promptfoo_api_key_missing`, `bridge_required`, `invalid_config`).
3. Write the tests, then run the backend suite.

## Done when

- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_config_builder.py` passes: raw config has the built-in target with the key only in `config`, `prompts`, `redteam` (purpose, numTests, plugins with severity, strategies without `basic`, injectVar) and both `outputPath` entries; no `redteam.provider` anywhere; the grader is in `defaultTest.options.provider` with `transformVars`. [unit]
- [x] Same file: the protected config targets the bridge provider with url/token/run_id and refuses a missing bridge; the clone config carries the suite's tests; `to_yaml` round-trips through `yaml.safe_load`; `config_preview` contains no key, token or path. [unit]
- [x] Same file: all six provider mappings and `unsupported_provider`; `subprocess_env` drops `OPENAI_API_KEY`, `CI`, both remote-generation disable flags and both scheduler generation URLs, and sets `PROMPTFOO_CACHE_ENABLED=false`; `config_hash` is equal for raw vs protected; an empty Cloud key raises. [unit]
- [x] `grep -n "fixture\|DISABLE_REMOTE_GENERATION\": \"true\|DISABLE_REDTEAM_REMOTE_GENERATION\": \"true" backend/app/red_team/config_builder.py` returns nothing. [static]
- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

- **2026-11-22**: A local-fixture subset was committed (`26ac31e`: two canned cases, remote generation disabled). It does not meet this spec and is replaced; 7 tests then.
- **2026-11-22**: Planner rewrite for the scheduler port (spec 00 revision): built-in raw target, protected bridge, grader only in `defaultTest`, `outputPath` list, clone config, redacted preview.
- **2026-11-23**: Added redaction, YAML serialization, purpose formatting, configuration hashing and a preview of the local synthetic suite. Focused builder tests: 12 passed. Backend unit suite: 638 passed. App compile check passed. The live generation and target configuration remain pending. The fixture-removal check still reports the local builder and its isolation flags.
- **2026-11-23**: The offline demo now serializes the configuration as YAML, uses the installed Promptfoo 0.126.0 `echo` provider, and imports the final JSON through the current result parser. The preview redacts both configured output paths. `cd backend && .venv/bin/python -m app.red_team.runner` returned one raw pass, one raw failure, and two protected passes in an isolated network namespace. Builder tests: 13 passed. Backend unit suite: 639 passed. App compile check passed. Live generation and target configuration remain open.
- **2026-11-23** (Claude; Codex declines live-execution code): rewrote `config_builder.py` as the scheduler port. Verified in installed `node_modules/promptfoo`: provider ids `groq:<m>`, `openai:chat:<m>`, `anthropic:messages:<m>`, `google:<m>`, `ollama:chat:<m>`, OpenAI-compatible `config.apiBaseUrl`/`apiKey`; `basic` is added by default so it is omitted from `strategies`; `outputPath` accepts a string list. 19 focused tests pass; whole unit suite 645 passed; compileall exit 0; the fixture/remote-disable grep is clean.
