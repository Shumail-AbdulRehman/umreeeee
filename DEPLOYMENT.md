# Deploy the API to Heroku

## GitHub repository

For a separate backend repository, upload **the contents of `backend/`** so that
`Procfile`, `.python-version`, `requirements.txt`, `app/`, and `scripts/` are at its root.
Include hidden configuration files, but never `.env`, `.venv`, database dumps, or model caches.
The app uses Python 3.12 and the `heroku/python` buildpack.

You can also deploy the complete project repository: its root Procfile changes into
`backend/`, and its root requirements file includes `backend/requirements.txt`.
Explicitly select `heroku/python`; no Node buildpack is needed for the API.

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
heroku ps:scale web=1 worker=1 dispatcher=1 --app YOUR-APP
```

`dispatcher` publishes persisted jobs; `worker` consumes them. Both are required for Red
Team execution and use separate dynos. Without these processes, Red Team jobs remain pending.
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
