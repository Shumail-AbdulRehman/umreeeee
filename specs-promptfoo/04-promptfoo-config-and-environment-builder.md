# Spec 04 — promptfoo config and environment builder

**Status:** In progress
**Depends on:** Spec 02
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** `backend/app/red_team/config_builder.py`, `backend/tests/unit/test_config_builder.py`, `specs-promptfoo/inventory/04-promptfoo-config-and-environment-builder.md`
**Reuses:** `backend/app/red_team/catalog.py`, `backend/app/schemas/integrations.py`, `INVENTORY.md#provider-and-guardrail-services`

## Goal

Pure functions that turn a launched test (its document and frozen snapshot) into everything promptfoo needs for a real red-team run: the red-team config, the grader provider, the account file and the subprocess environment. Writing files and running the CLI belong to spec 10.

## Scope

- `build_redteam_config(test, snapshot, bridge)` returns a plain dict that spec 10 serialises to YAML. `bridge` carries `url`, `token`, `run_id`. The dict holds: `description` (test name); `targets` with exactly one entry whose id is `file://<repo>/backend/promptfoo_bridge/provider.py`, label `<integration name> · <model> · <mode>`, and `config` {url, token, run_id, timeout_seconds 330} plus `workers: 1` (research `promptfoo-integration.md` §1a: one persistent Python worker); `redteam` {`purpose` = test purpose, `plugins` = one entry per selected plugin with `numTests` = tests_per_plugin and `severity` from the catalog, `strategies` = the selected strategies minus `basic` (basic is always included by promptfoo, research `promptfoo-redteam.md` §4; verify and state in the Log), `injectVar: prompt`, `provider` = the grader provider}; `defaultTest.options.provider` = the same grader provider so grading stays on the organization integration (research §6).
- `grader_provider(integration, model, api_key)` maps the organization integration to a promptfoo provider entry with the key inside the entry's `config` (never in env): groq → `groq:<model>`; openai → `openai:chat:<model>`; deepseek → openai-compatible chat with `apiBaseUrl` of DeepSeek; anthropic → `anthropic:messages:<model>`; gemini → `google:<model>`; ollama → `ollama:chat:<model>` with the integration base URL. Verify every provider id against the installed package `node_modules/promptfoo` (spec 01 installs it) and record what you checked in the Log; an unsupported provider raises a typed error the service turns into 422.
- `cloud_login_args(host, api_key)` returns the argument list for `promptfoo auth login --host <host> --api-key <key>` and `cloud_login_redacted(...)` the same with the key as `***` (local probe, "Cloud API-key login": an env var alone is not enough; a login inside the run's private `PROMPTFOO_CONFIG_DIR` is). Host defaults to `https://www.promptfoo.app` (`PROMPTFOO_CLOUD_HOST`). An empty key raises `promptfoo_api_key_missing`.
- `subprocess_env(base_env, workspace, python_executable, repo_root)` returns a new mapping exactly per ARCHITECTURE "Subprocess environment": start from `PATH`, `HOME`, `LANG` only; set `PROMPTFOO_CONFIG_DIR`, the disable flags, `PROMPTFOO_CACHE_ENABLED=false`, `FORCE_COLOR=0`, `PROMPTFOO_PYTHON`, `PYTHONPATH=<repo>/backend`; drop `OPENAI_API_KEY`, `CI`, `GITHUB_ACTIONS`, `BUILD_NUMBER`, `PROMPTFOO_DISABLE_REMOTE_GENERATION`, `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` even if present in `base_env` (hosted generation is required, spec 00).
- `config_hash(test)` — stable SHA-256 over purpose, sorted plugins with their counts, sorted strategies and promptfoo version; independent of target, mode and grader so a raw test and its protected clone hash the same.
- `redact(config)` returns a copy with every `token`/`apiKey` replaced by `***` for logs and exports.

## Explicit non-scope

- Writing the workspace files and running the CLI → spec 10.
- Choosing which plugins and strategies exist → spec 02.
- Decrypting the grader integration key and loading the snapshot → spec 16 (launch) and spec 17 (worker).

## Reuse first

- Plugin/strategy ids, severities and validation come from `backend/app/red_team/catalog.py` (spec 02); do not hard-code lists here.
- Provider names match `SUPPORTED_PROVIDERS` in `backend/app/services/llm_integration_service.py`.

## Steps

1. Read research `promptfoo-redteam.md` §§2, 4, 6, 7 and `promptfoo-integration.md` §§1a, 4 for the exact keys.
2. Implement the pure functions with typed errors (`unsupported_grader_provider`, `promptfoo_api_key_missing`, `invalid_config`).
3. Write the tests, then run the whole backend unit suite.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_config_builder.py` passes: target id points at the bridge provider with url/token/run_id and `workers: 1`; plugins carry `numTests` and catalog severity; `basic` is not duplicated; grader set in both `redteam.provider` and `defaultTest.options.provider`. [unit]
- [ ] Same file: each of the six provider mappings produces the verified id with the key only inside `config`; an unsupported provider raises `unsupported_grader_provider`. [unit]
- [ ] Same file: `subprocess_env` contains `PROMPTFOO_CONFIG_DIR`, `PROMPTFOO_CACHE_ENABLED=false`, `PROMPTFOO_PYTHON`, `PYTHONPATH` and none of `OPENAI_API_KEY`, `CI`, `GITHUB_ACTIONS`, `PROMPTFOO_DISABLE_REMOTE_GENERATION` even when the base env had them. [unit]
- [ ] Same file: `config_hash` is equal for raw vs protected and different when a plugin count changes; `redact` hides token and apiKey; an empty key raises `promptfoo_api_key_missing`. [unit]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]

## Log

### 2026-11-22 — Local fixture scope

- The owner requested an isolated local evaluation with fixed harmless cases, synthetic data and mock providers. Implemented a two-case suite shared across raw and protected mock modes, a stable suite ID and an allowlisted subprocess environment built without inheriting credentials. Hosted generation, Cloud login, integration-backed grading and the HTTP bridge target remain outside this local deliverable. The original acceptance items remain open.
- Root `npm ci` added 579 packages and audited 580 (0 vulnerabilities reported). Checked installed `node_modules/promptfoo/package.json` (0.126.0), CLI `eval` config options in `dist/src/main.js`, the exact-match assertion, Python provider worker configuration, and the environment reads for the private config directory, cache, remote generation, telemetry, update and sharing flags.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit/test_config_builder.py` returned **7 passed**. `.venv/bin/python -m pytest -q tests/unit` returned **598 passed, 8 warnings**. `.venv/bin/python -m compileall -q app` exited **0**. No MongoDB criterion in this spec.
