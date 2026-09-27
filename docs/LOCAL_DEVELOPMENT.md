# Local development and demonstration

This is a local application guide, not a deployment guide. Verified toolchain on 24 September 2026: Python 3.12.3, Node 24.14.1, npm 11.11.0, Chrome 150. Backend packages are pinned in `backend/requirements.txt`, `requirements-dev.txt`, and `requirements-ml.txt`; frontend versions are locked in `Frontend/package-lock.json`.

## Prerequisites

Use a MongoDB replica set: configuration/launch/finalization rely on transactions. A standalone MongoDB process is insufficient. Use a dedicated test database for automated tests. RabbitMQ is required for actual Red Team job execution; a draft and durable launch can be created while it is offline, but jobs stay pending. The local queue name must begin with `sentinel.`. Do not purge a shared RabbitMQ queue. No Docker, RabbitMQ server, or live provider was available in the verification workspace.

From `backend`, create `.venv`, install `requirements-dev.txt`, copy `.env.example` to `.env`, and fill `MONGODB_URL`, `MONGODB_DB_NAME`, `SECRET_KEY`, and two different Fernet keys (`INTEGRATION_ENCRYPTION_KEY`, `CONTENT_ENCRYPTION_KEY`). Generate each key with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Never commit `.env` or reuse the test keys. Set `RABBITMQ_URL`, `RED_TEAM_QUEUE_NAME`, `INTEGRATION_REQUESTS_PER_MINUTE` (1–60, default 6), `RED_TEAM_EXECUTION_LEASE_SECONDS` (default 120), and `RED_TEAM_MAX_ATTEMPTS` (maximum 3). Set `ALLOWED_OLLAMA_ORIGINS` for local Ollama; provider URLs are allowlisted.

Use a local SMTP capture server or approved SMTP account and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_EMAIL`, `SMTP_USE_TLS`, and optionally username/password. Registration/invitation cannot be completed from a delivery-failure path; the API does not reveal codes. `docs/VALIDATORS.md` describes downloading/warming the pinned semantic models. Keyword, regex, and deterministic PII rules do not require those model weights. A protected test cannot launch if its selected active policies require an unavailable validator.

## Processes

Run each command in its own terminal. From `backend`:

```bash
.venv/bin/uvicorn app.main:app --reload
.venv/bin/python -m app.queue.dispatcher
.venv/bin/python -m app.workers.red_team_worker
.venv/bin/python -m scripts.reconcile_red_team
```

From `Frontend`:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`; FastAPI OpenAPI is at `http://127.0.0.1:8000/docs`. Check `/api/health` for process liveness and `/api/ready` for Mongo/readiness. The Red Team capabilities endpoint reports TCP reachability and recent worker/dispatcher heartbeats as hints, not delivery guarantees. Start with one worker; prefetch is 1. The dispatcher publishes only IDs from durable Mongo job rows. Run `.venv/bin/python -m scripts.expire_content` periodically to remove expired prompt/run response ciphertext. It does not delete result metadata.

For an optional isolated synthetic tenant, set a private `DEMO_ADMIN_PASSWORD` of at least 12 characters and run `.venv/bin/python -m scripts.seed_demo --slug sentinel-demo-<unique> --email admin-<unique>@example.test` to preview, then repeat with `--apply`. This command creates one verified demo administrator; it does not reset existing data, create a provider, or send a real request. Alternatively, register normally through the UI and verify through the configured SMTP inbox. Mark any fake provider used for the demonstration clearly as fake. The script's password must not be shared or reused.

## Checks and troubleshooting

Run `TEST_MONGODB_URL='mongodb://127.0.0.1:27017/?replicaSet=rs0' TEST_MONGODB_DB_NAME=test_sentinel_phase3 .venv/bin/python -m pytest -q tests` from `backend`, using your actual dedicated replica-set URL. From `Frontend`, run `npm run lint` and `npm run build`. Without `TEST_MONGODB_URL`, database tests skip. Do not point tests at an application database.

If launch shows pending dispatch, confirm RabbitMQ is reachable, the dispatcher is running, and its queue/vhost permissions are valid. If jobs are published but not progressing, check worker heartbeat and run the reconciler; do not manually republish arbitrary messages. A provider timeout after dispatch becomes an unknown-outcome error and is not automatically replayed. A workspace 429 can mean this integration is occupied by a test; respect `Retry-After` or choose a different integration. On invalid provider credentials/model, fix the integration and clone a new test rather than editing a launched test. If `/api/ready` fails, fix MongoDB replica-set availability first. If semantic validators are unavailable, follow `VALIDATORS.md`; do not lower a policy silently to force a green result.

Legacy database upgrades are separate from local development. Follow `backend/README.md` for backup-first Phase 1/2 migration; no real legacy migration was signed off here.
