# Sentinel AI API — local setup

The API uses MongoDB only. Use a local single-node replica set or an existing transaction-capable MongoDB connection. The former `app.db` JSON store is migration input, not an application fallback. A process can report `/api/health` as live while `/api/ready` reports 503 if MongoDB is unavailable.

1. Create the local environment: `python3 -m venv .venv` and `.venv/bin/pip install -r requirements-dev.txt`.
2. Copy `.env.example` to `.env` and configure `MONGODB_URL`, `MONGODB_DB_NAME`, a random `SECRET_KEY` (at least 32 characters), and two **distinct** Fernet keys: `INTEGRATION_ENCRYPTION_KEY` and `CONTENT_ENCRYPTION_KEY`. Generate each with `.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Do not commit `.env`.
3. Configure `SMTP_HOST` and `SMTP_FROM_EMAIL` for a local SMTP sink before signing up or inviting people. Set `SMTP_USE_TLS=false` if that sink does not support STARTTLS; SMTP login credentials are optional. Codes and invitation links are never printed to the console or returned by the API.
4. If upgrading an existing database, first create and verify a backup. Run `.venv/bin/python -m scripts.migrate_phase1 --dry-run`; resolve reported conflicts. Then run `.venv/bin/python -m scripts.migrate_phase1 --apply --backup-confirmed`. For an old JSON `app.db`, add `--source-json /absolute/path/to/app.db` to both commands. The source file is never modified.
5. To activate semantic injection or toxicity policies, install CPU PyTorch with `.venv/bin/pip install 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cpu`, then `.venv/bin/pip install -r requirements-ml.txt`, and pre-download/warm the pinned models as described in [VALIDATORS.md](../docs/VALIDATORS.md). Deterministic keyword, regex, and PII policies work without model weights.
6. Before upgrading existing prompt history, back up the database and run `.venv/bin/python -m scripts.migrate_phase2` for a dry run, then `--apply --backup-confirmed`. The migration encrypts retained legacy text and removes expired text without inventing policy outcomes. Run `.venv/bin/python -m scripts.expire_content` periodically to remove expired ciphertext; read endpoints enforce expiry even before cleanup. The startup reconciler only marks stale processing runs interrupted; it never calls a provider again.
7. Start locally with `.venv/bin/uvicorn app.main:app --reload`. Check `/api/health` and `/api/ready` separately.

For tests, set `TEST_MONGODB_URL` and `TEST_MONGODB_DB_NAME` to a dedicated test prefix such as `test_sentinel_phase1`. The integration fixture adds a random suffix, creates only that new database, and drops only that fixture-created database. Run `.venv/bin/python -m pytest -q tests`. Unit tests run without MongoDB; integration tests skip without a test URL. Never point test configuration at the application database.

Super Admin promotion is a local command: `.venv/bin/python -m scripts.bootstrap_super_admin --user-id <existing-active-verified-user-id>` for a dry run, then repeat with `--apply` after confirming the ID. This revokes the account's existing sessions. There is no HTTP bootstrap route.

Active policies now evaluate ordinary Prompt Studio requests. The application blocks matching input before contacting the provider, withholds matching or unchecked output, and persists safe decisions, incidents, and analytics. A submitted prompt needs a UUID `Idempotency-Key` header. Actual security accuracy depends on selected rules and local model readiness; review [VALIDATORS.md](../docs/VALIDATORS.md) and [EVALUATION_RESULTS.md](../docs/EVALUATION_RESULTS.md).

For Phase 3 Red Team local processes, synthetic demo setup, broker troubleshooting, and the current verification boundary, use [LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md) and [TEST_RESULTS.md](../docs/TEST_RESULTS.md). RabbitMQ delivery has not yet been exercised on a live broker in this workspace.

## Heroku deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) and `.env.production.example` for GitHub deployment,
production configuration, encryption-key continuity, background processes and platform limits.
