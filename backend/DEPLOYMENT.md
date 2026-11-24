# Deploy the API to Heroku

## GitHub repository

For a separate backend repository, use **the contents of `backend/`** so that
`Procfile`, `.python-version`, `requirements.txt`, `app/`, `promptfoo_bridge/`, and
`scripts/` are at its root. Copy the project-root `package.json`, `package-lock.json`,
`.node-version`, and `app.json` into that repository root for Promptfoo.
Include hidden configuration files, but never `.env`, `.venv`, database dumps, or model caches.
The app uses Python 3.12 and the `heroku/python` buildpack.

You can also deploy the complete project repository: its root Procfile changes into
`backend/`, and its root requirements file includes `backend/requirements.txt`.
Configure both buildpacks for the release that includes Promptfoo.

## Services and configuration

1. Provision a transaction-capable MongoDB deployment, such as MongoDB Atlas. Configure
   its network access so Heroku can reach it and use a database user with access to the
   application database. Localhost MongoDB cannot be reached from Heroku.
2. Configure SMTP for verification, invitations and password resets. Production startup
   requires `SMTP_HOST` and `SMTP_FROM_EMAIL`; most providers also require credentials.
3. Create a Heroku app. In Settings > Config Vars, enter values from
   `.env.production.example`. That file is a reference, not automatically loaded.
4. Set `FRONTEND_APP_URL` and `CORS_ORIGINS` to the actual Netlify HTTPS origin, without
   a trailing slash, path, or wildcard. Multiple CORS origins are comma-separated.
   This controls browser access and the URLs sent in emails.
5. Set `SECRET_KEY` to at least 32 random characters. Set distinct Fernet keys for
   `INTEGRATION_ENCRYPTION_KEY` and `CONTENT_ENCRYPTION_KEY`.

For a **new database**, generate these locally using the installed backend environment:

```sh
python -c 'import secrets; print(secrets.token_urlsafe(48))'
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Paste outputs directly into Heroku Config Vars. For an **existing database**, retain its
original integration/content encryption keys instead of generating new ones. A new
integration key cannot decrypt existing provider credentials; a new content key cannot
decrypt retained prompts. Keep these keys stable across releases and all dynos.

## Deploy from GitHub

1. Under Deploy, select GitHub and connect the repository/branch.
2. Deploy the branch after setting Config Vars. Enable automatic deploys if desired.
3. Enable one `web` process under Resources. Its Procfile binds to Heroku's `$PORT` on
   `0.0.0.0`; do not set PORT yourself or use `--reload`.
4. Use the actual URL from Heroku's Open app button (hostnames can contain a suffix).
5. Check `https://YOUR-ACTUAL-HOST/api/health` and `/api/ready`. Both should return 200.
   `/` is not an application page. `/docs` exposes the API documentation.
6. On Netlify set `VITE_API_BASE_URL=https://YOUR-ACTUAL-HOST/api`, then deploy the frontend.

The database is external and persistent; deploying code does not copy local data.
A new database needs organization signup, users/groups, integrations, and policy catalogs.
Import the real DLP/Guardrail catalogs using the existing import workflow, then assign checks
to groups and users. Do not seed production with synthetic demo accounts. Existing database
migrations are deliberate backup-first operations; the Procfile does not run them automatically.

Policy assignment is optional for administrator accounts in Prompt Studio. Both
`org_admin` and `super_admin` can send messages without an applicable input policy;
the organization's `require_active_policy` setting still applies to regular users.
Any applicable policies continue to enforce their checks on administrator messages.
Admins can optionally choose groups under **Users → My policy groups** to use their
assigned policies. Creating a group alone does not assign the administrator to it.

## DLP, Guardrail and local models

For managed remote catalogs set `REMOTE_DETECTION_ENABLED=true` and supply
`DLP_DETECTION_API_KEY`; the detector services must be reachable from Heroku. Leaving remote
detection disabled does **not** bypass active catalog policies: validation fails closed.
The bundled deployment installs deterministic validators but not local PyTorch/model weights.
Active local `prompt_injection` or `toxicity` rules require a separately provisioned ML
runtime and pinned model cache. Do not enable those rules until that runtime is ready.

Heroku's filesystem is ephemeral. Uploading model weights to a one-off dyno does not make
those weights available to web or worker dynos. Large local ML deployments need a separate
build/runtime plan; this configuration is intended for remote catalogs and cloud LLMs.
Ollama on your laptop is also not reachable from the deployed API.

## Red Team background processes

Provision hosted RabbitMQ and set its supplied TLS `amqps://...` URL as `RABBITMQ_URL`.
If an add-on provides a differently named variable, copy that value into `RABBITMQ_URL`.
Use the same MongoDB, encryption keys and broker for all processes. Then enable:

```sh
heroku ps:scale web=1 worker=1 dispatcher=1 recovery=1 --app YOUR-APP
```

`dispatcher` publishes persisted jobs; `worker` consumes them. Both are required for Red
Team execution and use separate dynos. Without these processes, Red Team jobs remain pending.

`recovery` runs `python -m app.queue.recovery` as its own dyno. It checks durable job
state every 15 seconds and reports `dispatch_reset`, `generating_requeued`,
`interrupted_failed`, and `parent_reconciled`. A job that loses its worker before a
suite is available can be requeued. An interrupted evaluation is closed as failed
with the reason `interrupted`, keeping imported rows.

### promptfoo runtime (Red Team engine)

Red Team scans run the pinned promptfoo CLI (`promptfoo` `0.126.0` in the repository-root `package.json`) as a
subprocess of `worker`. Locally: run `npm ci` in the repository root (Node 24; `.node-version`), then
`cd backend && python -m scripts.check_promptfoo_runtime` — it must report `"available": true` and
`"cloud_key_configured": true`.

Configuration (backend `.env` or Heroku config vars):

- `PROMPTFOO_API_KEY` — the owner's promptfoo Cloud user API token. The worker runs
  `promptfoo auth login --host <PROMPTFOO_CLOUD_HOST> --api-key <key>` inside a private per-run config directory before
  generating test cases. Login requires no email verification. Keep the key out of version control.
- `PROMPTFOO_CLOUD_HOST` — optional, defaults to `https://www.promptfoo.app`.

On Heroku Cedar, Node must build first and Python last so the slug contains
`node_modules/.bin/promptfoo`. The root `app.json` records this order for new apps
and Review Apps. For an existing app, inspect its buildpacks and add Node if
Python is its only buildpack:

```sh
heroku buildpacks --app YOUR-APP
heroku buildpacks:add --index 1 heroku/nodejs --app YOUR-APP
```

Keep any other required buildpacks in the list and leave Python last. Set
`PROMPTFOO_API_KEY` and `RABBITMQ_URL` in Heroku Config Vars before deploying the
branch. After the first release, enable the processes described above. The
recommended worker size is Standard-2X (1 GB) on a compatible paid tier:

```sh
heroku ps:type worker=standard-2x --app YOUR-APP
```

Verify the pinned runtime after release. The checker reports only whether a
Cloud key is configured. It performs a local version check and does not
authenticate to Promptfoo Cloud:

```sh
# Combined repository
heroku run --app YOUR-APP 'cd backend && python -m scripts.check_promptfoo_runtime'
# Standalone backend repository
heroku run --app YOUR-APP 'python -m scripts.check_promptfoo_runtime'
```

Look for `available: true`, version `0.126.0` and `cloud_key_configured: true`.

Normal Prompt Studio runs do not require RabbitMQ. The application also needs periodic
content cleanup: schedule `python -m scripts.expire_content` through Heroku Scheduler
(or `cd backend && python -m scripts.expire_content` for the complete repository).
Read endpoints enforce content expiry even before cleanup runs.

## Request duration and troubleshooting

Prompt Studio currently executes synchronously. Heroku's router times out requests after
30 seconds without a response, so the production example lowers provider timeout to 15s
and each policy stage to 4s. These leave headroom but are not an end-to-end deadline:
slow databases, load or network trickling can still exceed the router limit. Long generations
need an asynchronous job flow, not a larger provider timeout. After an uncertain request,
check run history before submitting again because the original call may still incur cost.

Guardrail plugins may use LLM grading. A harmless diagnostic check on October 11, 2026
reported about 15 seconds of server processing, so the four-second limits are suitable
only for fast checks. `detector_timeout` / `stage_timeout` mean the check did not finish,
not that the prompt passed or violated a policy. For local diagnosis, the bounded maximums
are `REMOTE_DETECTION_TIMEOUT_SECONDS=30` and `VALIDATION_STAGE_TIMEOUT_MS=30000`.
Do not treat those values as a Heroku fix: multiple input fields, provider execution and
output checks can exceed the router deadline. Slow remote checks need background execution
and polling before using longer limits in production.

`detector_invalid_response` with Guardrail violations was also caused by the original
adapter rejecting the service's `pass: false` grades. Deploy the `cytex-findings-v2`
adapter to accept that format while continuing to reject incomplete/error responses.

- Boot failure: inspect `heroku logs --tail --app YOUR-APP`; check production Config Vars.
- Readiness 503: check MongoDB connectivity, transactions and active local model readiness.
- Browser CORS failure: use the exact Netlify origin in `CORS_ORIGINS`.
- Credential decryption failure: restore the original encryption key or re-save provider
  credentials under the new key. Retained content needs its original content key.
- Missing input policy: assign an active input policy to the signed-in user's active group.
- Unknown price: a model may lack LiteLLM catalog pricing; set its integration price override.

## Platform references

- [Heroku Python runtime](https://devcenter.heroku.com/articles/python-runtimes)
- [Procfile process types](https://devcenter.heroku.com/articles/procfile)
- [Request timeouts](https://devcenter.heroku.com/articles/request-timeout)
- [Ephemeral dyno filesystem](https://devcenter.heroku.com/articles/dynos#ephemeral-filesystem)

## Safe MongoDB diagnostics

Startup logs now show each database phase (`startup_connection`, `startup_transactions`,
`startup_indexes`, `startup_run_recovery`, `startup_red_team_recovery`). A failure emits
`MongoDB diagnostic phase=... reason=... code=... hint=...` without printing the URI,
password, server messages or application data. Common reasons distinguish authentication,
permissions, DNS, TLS, connection timeouts, unsupported transactions, duplicate records and
index conflicts. Network timeouts cannot conclusively prove an Atlas IP-access problem.
Readiness probes log failures too, throttling identical diagnostics to once per minute;
the public endpoint still returns only ready/unavailable.

After deploying, copy the `MongoDB diagnostic` line from Heroku logs for troubleshooting.
You can also run a read-only probe in the actual Heroku environment:

```sh
heroku run python -m scripts.check_database --app YOUR-APP
```

For the combined repository use:

```sh
heroku run 'cd backend && python -m scripts.check_database' --app YOUR-APP
```

This command checks authentication and a read-only transaction. It does not create indexes,
change records, or contact model providers. Index-creation failures are diagnosed by the
normal startup/readiness checks instead. Never paste Config Vars or raw credentials into logs.
