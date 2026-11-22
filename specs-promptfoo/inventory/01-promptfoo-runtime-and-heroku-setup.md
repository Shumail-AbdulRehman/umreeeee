# Inventory — spec 01

- `package.json`, `package-lock.json` (repo root): pinned `promptfoo` `0.126.0`, `engines.node` `24.x`; `npm ci` installs `node_modules/.bin/promptfoo`.
- `.node-version` (repo root): `24`.
- `backend/scripts/check_promptfoo_runtime.py`:
  - `runtime_status(binary=None, env=None, run=subprocess.run, timeout=20)` → `{binary_present, expected_version, version, version_ok, node_major, node_ok, cloud_key_configured, cloud_host, available, error}`, where `error` ∈ `binary_missing`, `version_unreadable`, `version_mismatch`, `node_unsupported`. It never includes the key.
  - Also exposes `default_binary()`, `PINNED_VERSION`, `DEFAULT_CLOUD_HOST` and `REPO_ROOT`.
  - CLI: `cd backend && python -m scripts.check_promptfoo_runtime`, which exits 0 only when available and the key is configured.
- Env vars: `PROMPTFOO_API_KEY` and `PROMPTFOO_CLOUD_HOST` (documented in `backend/DEPLOYMENT.md#promptfoo-runtime-red-team-engine`).
