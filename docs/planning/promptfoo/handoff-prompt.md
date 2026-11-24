You are implementing part of an approved spec set in this repository: /home/shumail/umer-FYP/FYP_Part_1 (git branch `promptfoo-redteam`; stay on it).

## Context

This is my own final-year project, an LLM-security product: FastAPI + MongoDB + RabbitMQ worker backend in `backend/`, React/Vite frontend in `Frontend/`. Its Red Team module is being migrated from an in-house engine to **promptfoo 0.126.0** (MIT, open-source LLM red-teaming tool) running inside the app.

The worker launches the promptfoo CLI:
- promptfoo Cloud generates the test cases;
- each test prompt is sent to MY OWN configured model through the app's own services (raw mode → provider directly, protected mode → my policy pipeline);
- my own Groq integration grades the replies.

The full design is in `specs-promptfoo/` and is approved and binding. Implement each spec exactly as written, including its live behaviour. If something in a spec is unclear or impossible as written, stop and report it instead of changing the scope.

Use “test launch,” “test case,” “test prompt,” and “case details” in product copy, following `specs-promptfoo/DESIGN-SYSTEM.md`. Use the technical identifiers specified by each contract.

## Read first

`specs-promptfoo/AGENT-GUIDE.md`, `README.md`, `00-promptfoo-decisions.md`, `ARCHITECTURE.md` (especially "Bridge contract", "Subprocess environment", "Invariants"), `INVENTORY.md`, `PROGRESS.md`, the `specs-promptfoo/inventory/*.md` fragments, and `docs/research/promptfoo-redteam.md`, `promptfoo-integration.md` and `promptfoo-local-probe.md`.

## Already done (do not redo)

Specs 00, 01, 02, 03, 12, 13, 14, 15. Specs 05, 06 and 07 were reopened on 2026-11-22 and must be re-implemented as now written. The committed code for 04 and 08 and the untracked `backend/app/red_team/runner.py` and `backend/tests/fixtures/fake_promptfoo.py` are local-fixture stand-ins and must be replaced.

## Reference implementation

Read `docs/research/scheduler-reuse.md` first. Every backend spec ports a named function of my scheduler at `/home/shumail/Downloads/scheduler_umr/scheduler_umr` (my code, I have permission to reuse it; read-only). Port its logic; never copy its hostnames, credentials, certificate paths, Teams webhooks, Mongo collections, `/home/...` paths or log files, and fix the defects listed in the research note.

## Your specs, in this dependency order

One at a time; finish and verify each before starting the next:

1. **07** client addendum (config preview, labels)
2. **08** bridge provider (protected mode)
3. **04** config builder (port `create_yaml`)
4. **05** results parser (port the `parse_redteam_json` row loop, suite sanitizer)
5. **06** report aggregation (port the `parse_redteam_json` aggregation)
6. **09** bridge server
7. **10** runner (port `run_redteam`)
8. **11** test editor and config preview
9. **16** service, schemas, routes, indexes, config preview
10. **17** worker and recovery (port `callback_func`)
11. **18** page integration
12. **19** remove the in-house engine. Write and test the archive script only; do NOT run it with `--apply`.
13. **20** e2e suite
14. **21** verification pass, except the live smoke, which Claude runs through the app API

## Rules

- Each spec's `Owns` line lists the only files you may create or edit. Also allowed:
  - append a dated `## Log` section to the spec;
  - set its `**Status:**` to Done once every `Done when` item is verified;
  - update its row in `specs-promptfoo/PROGRESS.md`;
  - write its inventory fragment `specs-promptfoo/inventory/<spec file name>`.
- Verify every promptfoo fact against the installed package in `node_modules/promptfoo` (repo root; install it with `npm ci`). Record what you checked in the spec's Log.
- Run every command in the spec's `Done when` and paste the real counts into the Log.
- Commands:
  - Backend unit tests: `cd backend && .venv/bin/python -m pytest -q tests/unit`
  - Backend compile check: `.venv/bin/python -m compileall -q app`
  - Frontend tests: `cd Frontend && npx vitest run`
  - Frontend lint: `npm run lint`
  - Frontend build: `npm run build`
- Automated tests use fakes only: no live promptfoo, providers or RabbitMQ.
  - Integration tests marked `[requires: MongoDB replica set]` run with `TEST_MONGODB_URL` (the MongoDB URL from `backend/.env`) and `TEST_MONGODB_DB_NAME=test_`; they create and drop throwaway `test_*` databases.
  - If that isn't possible, record them as skipped. Never report them as passed.
- Known temporary failures:
  - `Frontend/src/pages/RedTeamPage.test.jsx` expects old progress text until spec 18 updates it.
  - After spec 03, the `backend/tests/unit/test_red_team_report.py` cases that look up old framework ids (e.g. `owasp`) fail until spec 06 updates them. Spec 03 lists them in its Log; this is expected and not a blocker.
- Do NOT run `git commit` or `git add` (the sandbox cannot write `.git`). Leave each finished spec's changes in the working tree and continue with the next spec; Claude reviews and commits. Never touch `.env` files or `node_modules` contents.
- Secrets live only in `backend/.env` (`PROMPTFOO_API_KEY`, `PROMPTFOO_CLOUD_HOST`, encryption keys, MongoDB URL). Never print, log, commit or copy them into files. The promptfoo Cloud key is used only through `promptfoo auth login` inside the runner's private, per-run config directory (spec 10).
- For spec 21's live smoke, the human owner starts the stack (RabbitMQ: `sudo docker start sentinel-rabbit`; then the API, worker, dispatcher and recovery from `backend/`). Ask before running anything that needs `sudo`.

## After each spec

Give a short report: files changed, test counts, anything skipped and why.
