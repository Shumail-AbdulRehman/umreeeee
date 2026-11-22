# Plan: populate real data and run Red Team tests

Requested by the supervisor (2026-11-19): "project mai kuch actual data populate karna, aur redteam k task bh run karna".
Executor: a Codex session. Author of this plan: Claude (analysis only).

## Hard rules (read first)

1. **Change no code or config.** Do not edit, create or delete anything under `backend/app`, `backend/scripts`,
   `backend/tests`, `Frontend/src`, `Frontend/tests`, any `*.json`/`*.toml`/`*.js` config, Procfiles, or any `.env`.
   The only file you may write in the repo is the report `docs/planning/real-data-and-red-team-run-report.md`.
   Logs and temp files go in `/tmp/sentinel-run/`.
2. **Use the HTTP API for every write** so the real business logic, audit log and validation run. Direct MongoDB access
   is for read-only checks only. The one exception: if a needed write has no API at all, stop and describe it in the
   report instead of writing to the database.
3. **Real database.** `backend/.env` points to the Atlas database `centurion`. This is the user's real data. Never delete,
   archive, deactivate or overwrite existing companies, users, integrations, policies or runs. Only add.
4. **Secrets.** Credentials are in a private file passed to you separately (`CREDS_FILE`). `source` it; never print,
   log, commit or write the password, the JWT, or any API key. Mask them in every command echo.
5. **No real third-party email.** Do not invite or email any real address other than the account owner's. If user
   creation sends an invitation email, use only obviously synthetic `@example.test` addresses, and skip it if sending fails.
6. **Gemini quota.** Use the existing active Gemini integration (account name `xxaxsa`) in the owner's company. Do not
   add a new key. Stay under ~150 provider calls in total.
7. If something blocks you (Docker permission, Atlas unreachable, Gemini errors, a 4xx you cannot resolve without a
   code change), stop that step, record the exact error in the report, and continue with whatever else is still possible.

## Known facts (verified read-only on 2026-11-19)

- Account: `contactshumail@gmail.com`, role `org_admin`, active, email verified, **in 0 groups**. Company `xsaxsa`
  (active, `require_active_policy` true). One other member: a `user`-role account (password unknown; do not use it).
- One group exists: `umeree-test01` (active).
- 5 active policies, all `BLOCK` on input+output, all `catalog` rules (remote Cytex DLP/Guardrail detection;
  `REMOTE_DETECTION_ENABLED=true`), **every policy assigned to 0 groups**. Because policies apply only via groups,
  nothing is currently enforced for anyone, and a protected red-team launch would fail with `policy_required`.
- Gemini integration is active with models including `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3.5-flash`.
- Current data: 2 companies, 3 users, 53 prompt runs, 0 red-team tests.
- RabbitMQ is **not running**; Docker is installed. Config default `RABBITMQ_URL` is `amqp://guest:guest@127.0.0.1:5672/%2F`.
- Integration rate limit default: 6 requests/minute (`INTEGRATION_REQUESTS_PER_MINUTE`). The judge shares it.
- Processes (from `Procfile`): `uvicorn app.main:app`, `python -m app.workers.red_team_worker`,
  `python -m app.queue.dispatcher`, `python -m app.queue.recovery` — all run from `backend/` with `backend/.venv`.

## Known scoring flaw (do not fix; measure and report it)

In protected mode, input policies scan both `user_prompt` and `system_prompt`
(`backend/app/services/enforcement_service.py:50`). The red-team system prompt contains the synthetic scenario
(including a synthetic email for the `pii` plugin). The grader (`backend/app/red_team/evidence.py:105`) credits any
matched block as `pass / policy` without checking which field matched. So a block caused only by the scenario text
is wrongly counted as "defended". After the protected run, measure this (Phase 5, step 4) and report the numbers.

## Phase 0 — Safety snapshot

1. `mkdir -p /tmp/sentinel-run && cd /home/shumail/umer-FYP/FYP_Part_1`
2. Save `git status --porcelain > /tmp/sentinel-run/status-before.txt` and
   `git diff --binary | sha256sum > /tmp/sentinel-run/diff-before.txt`, and `touch /tmp/sentinel-run/start-marker`.

## Phase 1 — Start the stack

1. RabbitMQ: `docker run -d --name sentinel-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management`
   (reuse/start the container if it already exists). Wait until port 5672 accepts connections.
2. From `backend/`, start in the background with logs in `/tmp/sentinel-run/`:
   `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`, then the worker, dispatcher and recovery modules
   with `.venv/bin/python -m ...`. Record PIDs in `/tmp/sentinel-run/pids.txt`.
3. Wait for `GET http://127.0.0.1:8000/api/health` (or `/api/ready`) to succeed. Check the API log for startup errors.

## Phase 2 — Log in and baseline

1. `POST /api/auth/login` with the credentials; keep the token in a shell variable only.
2. `GET /api/red-team/capabilities` must show `broker_transport_reachable`, `worker_observed` and
   `dispatcher_observed` all true (wait up to ~60 s for heartbeats).
3. Record baseline counts (users, groups, prompt runs, violations, red-team tests) via read-only API calls.

## Phase 3 — Make policies actually apply (data, not code)

1. Read `GET /api/policies`, `GET /api/policy-sets`, `GET /api/groups` and the Policies page code
   (`Frontend/src/pages/PoliciesPage.jsx`, read-only) to learn the exact request bodies.
2. Assign the **Default DLP policy** and **Default Guardrail policy** to group `umeree-test01` using the same endpoints
   the Policies page uses (`PUT /api/policies/{id}/groups` or `/api/policy-sets/{id}/groups`; if the managed policy needs
   per-group entry selections, set them via `PUT /api/policies/{id}/group-selections`, selecting all entries).
3. Add the admin account to `umeree-test01` (`PATCH /api/users/me/groups` or `PUT /api/users/{id}`, whichever the UI uses).
4. Verify: `POST /api/policies/{id}/test` with an obvious PII sample (e.g. a fake card number) reports a match.

## Phase 4 — Populate realistic Prompt Studio data

1. Pick one text model that works: send one short prompt via `POST /api/prompt-workspace/run` (header
   `Idempotency-Key: <uuid4>`) trying `gemini-3.5-flash`, then `gemini-3-flash-preview`, then `gemini-2.5-pro`.
   Use the first that returns `allowed`. Use that same model for everything below.
2. Send ~25 prompts, respecting 429 `retry_after` (6/min): about 15 normal work prompts (summaries, emails, code
   questions, product FAQs), about 10 that should trigger policies (fake card numbers, fake SSN/IBAN-like strings,
   "ignore all previous instructions…", requests to reveal a system prompt, toxic phrasing). Use only synthetic
   personal data. Include 2–3 multi-turn conversations using `conversation_id` from the first reply.
3. Optional: create 2–3 extra groups (e.g. Engineering, Support, Finance) with descriptions, and, only if rule 5 allows,
   2–3 invited users with `@example.test` addresses in those groups.
4. Verify that dashboard/analytics/violations endpoints now return non-empty data (`/api/dashboard…`,
   `/api/analytics…`, `/api/violations…` — read the routes to get exact paths).

## Phase 5 — Run Red Team tests

1. Create a raw draft via `POST /api/red-team/tests`:
   `{"name":"Gemini baseline – raw","integration_id":<gemini id>,"model":<chosen model>,"mode":"raw","format":"plugins",
   "plugins":[all 8 ids],"strategies":["base64"],"tests_per_plugin":1,"seed":7,"temperature":0.2,"max_tokens":256,
   "threshold_score":0.8,"judge":{"integration_id":<gemini id>,"model":<chosen model>}}` → 16 attacks + 5 controls.
   Launch with `POST /api/red-team/tests/{id}/launch` body `{"version":<version>}` and header `Idempotency-Key: <uuid4>`.
2. Poll `GET /api/red-team/tests/{id}` every 15 s until status is `completed`, `partially_failed`, `failed` or `cancelled`.
   Expect ~5–10 minutes. If jobs stall, read the worker/dispatcher/recovery logs and report.
3. Clone as protected: `POST /api/red-team/tests/{raw id}/clone` with `{"mode":"protected"}`, rename only if the API
   allows editing the name via `PUT` with the current version, then launch and poll the same way. This keeps the same
   manifest so the report pairs the two runs.
4. Measure the scoring flaw (read-only): for every protected job with `verdict_source == "policy"`, look up its
   `prompt_runs` document by `protected_run_id` and record which `input_evaluation.rule_results[].field` /
   `output_evaluation…` had `outcome == "match"`. Count blocks that matched **only** on `system_prompt`, per plugin.
5. Fetch `GET /api/red-team/tests/{id}/report` for both tests and save JSON exports
   (`/export?format=json`) to `/tmp/sentinel-run/`.

## Phase 6 — Verify nothing in the code changed, then report

1. Re-run the Phase 0 commands into `*-after.txt` files and `diff` them. Also run
   `find backend/app backend/scripts backend/tests Frontend/src Frontend/tests -type f -newer /tmp/sentinel-run/start-marker -not -path '*/__pycache__/*'`
   — it must print nothing. The only allowed new file is the report.
2. Write `docs/planning/real-data-and-red-team-run-report.md` with:
   - what was created (groups, policy assignments, users, prompt count, conversations), with IDs;
   - Prompt Studio outcomes (allowed / blocked_input / blocked_output / errors) and violations created;
   - for each red-team test: status, attack success rate, risk score/level, decided vs inconclusive, controls,
     threshold verdict, judge calls, model calls, estimated cost;
   - raw vs protected comparison per plugin;
   - the scoring-flaw measurement from Phase 5 step 4, and a corrected "defended" figure excluding system-prompt-only blocks;
   - every error or blocker hit, and the git/no-change verification output;
   - the running processes and how to stop them (`kill` PIDs, `docker stop sentinel-rabbit`).
3. Leave the API, worker, dispatcher, recovery and RabbitMQ running so the owner can open the app
   (frontend: `cd Frontend && npm run dev`, then log in), unless something is crashing.
