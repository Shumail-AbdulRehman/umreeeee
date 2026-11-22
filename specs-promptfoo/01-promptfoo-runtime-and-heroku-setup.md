# Spec 01 — promptfoo runtime and Heroku setup

**Status:** Not started
**Depends on:** Spec 00
**Model:** Light — `claude-haiku-5-5` · `gpt-6.2-sol` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `package.json`, `package-lock.json`, `.node-version`, `DEPLOYMENT.md`, `backend/DEPLOYMENT.md`, `backend/scripts/check_promptfoo_runtime.py`, `backend/tests/unit/test_check_promptfoo_runtime.py`, `specs-promptfoo/inventory/01-promptfoo-runtime-and-heroku-setup.md`
**Reuses:** `Procfile`, `backend/Procfile`, `backend/scripts/check_database.py`, `DEPLOYMENT.md`, `backend/DEPLOYMENT.md`

## Goal

Install the pinned promptfoo runtime the worker executes, add a runtime checker the API and worker use, and document the Heroku changes needed to run it in production.

## Scope

- Root package: private, exact `promptfoo` dependency `0.126.0`, Node engine `24.x`, no root build or postinstall scripts. Generate the lockfile on Linux. Align `.node-version` with the Node engine; `.gitignore` already excludes `node_modules/`.
- Checker resolves the repository-relative binary independently of working directory, reports installed version and Node major, and gives only a masked present/missing indication for `PROMPTFOO_API_KEY`. A missing binary is reported separately from a mismatched version or an unparseable check. A configured email is not an assertion of verification.
- In both deployment docs retain existing Python web/worker process definitions. Write the deployment steps: `heroku buildpacks:add --index 1 heroku/nodejs` before `heroku/python`; scale the worker to Standard-2X (Node ≈315 MiB plus the Python worker); set `PROMPTFOO_API_KEY` and have the owner click promptfoo's verification email once; compressed slug ceiling 1000 MB, promptfoo ≈130 MB; promptfoo is invoked by absolute path `<repo>/node_modules/.bin/promptfoo` because the Procfile does `cd backend`. Procfile process lines stay as they are. Expose the checker's logic as an importable function (`runtime_status()`) used by spec 16 capabilities/launch and spec 17.

## Explicit non-scope

- Evaluation process lifecycle (fake only) → spec 10.
- Capability DTO and health presentation → spec 16 and spec 12.

## Reuse first

- Follow `backend/scripts/check_database.py` as a standalone diagnostic pattern; do not reuse its database connection path.
- Use `docs/research/promptfoo-local-probe.md` § Install footprint and `docs/research/promptfoo-integration.md` §§5–6 for measured versus estimated deployment figures; see `docs/research/promptfoo-redteam.md` §7 for the recorded verification requirement.

## Steps

1. Add the root manifest and Linux lockfile; keep the frontend's independent install and build unchanged.
2. Write the diagnostic with a bounded version-only probe, an injectable fake executable for tests, and sanitized failure output.
3. Update the two deployment docs with the Heroku steps, env vars and `PROMPTFOO_API_KEY` and `PROMPTFOO_CLOUD_HOST` (the owner's promptfoo Cloud user API token; no email verification step). Do not deploy from the implementing session.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_check_promptfoo_runtime.py` passes: fake version match, wrong version, missing binary, bad Node major and masked API key (including no raw value on failure). [unit]
- [ ] From repo root `npm ci` succeeds and `node_modules/.bin/promptfoo --version` reports `0.126.0`; this is a version check only. [static]
- [ ] Both deployment docs list `heroku/nodejs` first and `heroku/python` second, and neither Procfile changes. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes; log the count. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/check_promptfoo_runtime.py` pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]
