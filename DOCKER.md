# Run Averiq with Docker Compose

This runs the existing application: the React frontend behind unprivileged
nginx, FastAPI, MongoDB with a single-node replica set, RabbitMQ, the Red Team
worker, outbox dispatcher, lease recovery process, and a Mailpit email inbox.

## Start

Use Docker Engine/Desktop with the Compose plugin and permission to use its
daemon. Builds require internet access to container registries, npm and pip.
Node 24 and Python 3.12 are installed inside the images.

From the repository root, generate a private environment once:

    python3 docker/setup.py

If root .env already exists, it is deliberately left unchanged. Validate it:

    python3 docker/setup.py --check

The generator creates a signing secret, two distinct Fernet keys and a RabbitMQ
password. The root .env has mode 0600, is ignored by Git, and is excluded from
build contexts. The existing backend/.env is never read, changed or copied into
an image. Keep the generated keys with the data volumes: changing encryption
keys makes previously encrypted records unreadable.

Start the stack:

    docker compose config --quiet
    docker compose up --build -d
    docker compose ps

| Service | Local URL |
| --- | --- |
| Application | http://localhost:8080 |
| API documentation through nginx | http://localhost:8080/docs |
| API directly | http://localhost:8001/docs |
| Verification/invitation/recovery email inbox | http://localhost:8025 |
| RabbitMQ management | http://localhost:15672 |

RabbitMQ's username is averiq; its password is RABBITMQ_PASSWORD in the private
root .env. SMTP and MongoDB ports remain internal. Published ports bind to
localhost. Change APP_PORT, API_PORT, MAILPIT_PORT or RABBITMQ_UI_PORT in root
.env before starting if needed. Defaults avoid existing Vite 5173, API 8000
and MongoDB 27017 host processes.

**This is a separate local database.** Existing host/Atlas users, conversations
and integrations are not imported or modified. Create an account normally and
get its verification email in Mailpit. Importing existing data is a separate
backup-and-restore operation; preserve its original encryption keys.

## Processes and startup

| Service | Responsibility |
| --- | --- |
| frontend | Build Vite and serve static assets with nginx on 8080 |
| api | Existing FastAPI application, one Uvicorn process |
| mongo | MongoDB 8.0 with persistent database/config volumes |
| mongo-init | Initialize rs0 once, then wait for an elected primary |
| rabbitmq | Persistent broker and management interface |
| mailpit | Local SMTP delivery and persistent captured inbox |
| worker | Existing Promptfoo worker and protected-run bridge |
| dispatcher | Existing Mongo outbox publisher |
| recovery | Existing interrupted-lease recovery loop |
| model-download | Optional explicit download of pinned classifiers |

The API waits for the replica-set initializer and healthy broker. Other
application processes wait for API liveness. A Mongo ping alone does not
satisfy the transaction dependency. The initializer refuses to reconfigure an
incompatible existing volume. See the documented
[Compose dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/)
and [MongoDB initialization](https://www.mongodb.com/docs/manual/reference/method/rs.initiate/).

The backend image includes root promptfoo 0.126.0, Node 24 and the existing
Python bridge at the paths the app expects. Backend processes share one image
and matching signing/encryption configuration, and run as UID 10001. nginx uses
the upstream [unprivileged image](https://github.com/nginx/docker-nginx-unprivileged).
No runtime credentials become build arguments.

The browser calls /api on its own origin. nginx forwards the original path and
query to api:8000, including API docs/OpenAPI, and re-resolves the API after
container replacement. No Docker-only hostname enters the browser bundle.

## Red Team and local models

For hosted generation, set PROMPTFOO_API_KEY in root .env, then recreate:

    docker compose up -d api worker
    docker compose exec worker python -m scripts.check_promptfoo_runtime

Configure the target integration and Groq grader in the existing admin UI.
Building/starting the stack does not launch hosted tests or provider calls.
External DLP stays disabled unless explicitly configured. Mailpit captures
local email; it does not send to real inboxes.

CPU PyTorch and the existing optional classifier packages are included by
default. Weights are neither baked in nor downloaded on ordinary startup.
Download the application-configured pinned revisions explicitly:

    docker compose --profile models run --rm model-download
    docker compose restart api worker

The validator-models volume preserves weights. API and worker warm that cache
at startup. Missing classifiers remain unavailable under the existing policy
rules; no policy is bypassed to report readiness.

For a smaller image using deterministic rules/external detection only, set
INSTALL_LOCAL_ML=false in root .env and rebuild:

    docker compose up --build -d

The default ML build, native Promptfoo dependencies, infrastructure images and
weights need multiple gigabytes. Provide adequate disk/memory; do not clear
unrelated images or volumes.

For host-installed Ollama, configure the integration with
http://host.docker.internal:11434, the Compose-allowlisted origin. Ollama must
accept connections from Docker. Container localhost refers to that container.

## Operation and persistence

    docker compose logs -f api worker dispatcher recovery
    curl -f http://localhost:8080/api/health
    curl -f http://localhost:8080/api/ready

The container healthcheck measures API liveness. The separate readiness endpoint
also checks Mongo transactions, indexes and active-policy classifier availability,
so an administrator can still access the UI to correct an unready policy.

Schedule the existing retention cleanup periodically through your host scheduler:

    docker compose exec -T api python -m scripts.expire_content

Stop without deleting data:

    docker compose down

Database, broker, email and model data use named volumes. Normal shutdown and
rebuild preserve them. Do not use down --volumes unless you intend to erase this
stack's data. This is a localhost development/demo stack. Public production
deployment needs TLS, real SMTP and authenticated/restricted infrastructure.

## Verification

    python3 docker/setup.py --check
    docker compose config --quiet
    docker compose --profile models config --quiet
    python3 -m unittest discover -s docker/tests -p 'test_*.py' -v
    node --test docker/tests/replica-init.test.cjs

The 15 infrastructure tests pass: unique/private keys, overwrite/symlink
protection, invalid keys, shared service secrets, isolated database/broker
configuration, startup ordering, loopback ports, model opt-in and replica-set
initialization/restarts/failures. All six base image tags were verified against
Docker Hub registry manifests.
The existing frontend production build also passed with the same-origin /api
configuration used by its Dockerfile. All 258 protected application/dependency
files matched the snapshot taken before containerization.

**Actual image builds and container startup could not be verified here.** This
shell is denied access to /var/run/docker.sock; the local buildx configuration
also has a permission error. Passwordless sudo is unavailable; no host
permissions were changed. Only about 3.7 GB was free when inspected, which is
tight for the default ML stack. Run startup from a terminal with Docker access
and adequate free space.

No application source or dependency manifests were changed. Nothing was
committed or pushed.
