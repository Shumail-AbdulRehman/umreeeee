You are implementing part of an approved spec set in this repository: /home/shumail/umer-FYP/FYP_Part_1 (git branch `promptfoo-redteam`; stay on it).

## Context

This is my own final-year project, an LLM-security product: FastAPI + MongoDB + RabbitMQ worker backend in `backend/`, React/Vite frontend in `Frontend/`. Its Red Team module is being migrated from an in-house engine to **promptfoo 0.126.0** (MIT, open-source LLM red-teaming tool) running inside the app.

The worker launches the promptfoo CLI:
- promptfoo Cloud generates the test attacks;
- each attack is sent to MY OWN configured model through the app's own services (raw mode → provider directly, protected mode → my policy pipeline);
- my own Groq integration grades the replies.

This is authorized security testing of my own application. The full design is in `specs-promptfoo/` and is approved and binding. Implement it as written, including live behaviour. Do not stub, disable or narrow it. If you cannot implement something as written, stop and say exactly why; do not silently change scope.

## Read first

`specs-promptfoo/AGENT-GUIDE.md`, `README.md`, `00-promptfoo-decisions.md`, `ARCHITECTURE.md` (especially "Bridge contract", "Subprocess environment", "Invariants"), `INVENTORY.md`, `PROGRESS.md`, the `specs-promptfoo/inventory/*.md` fragments, and `docs/research/promptfoo-redteam.md`, `promptfoo-integration.md` and `promptfoo-local-probe.md`.

## Already done (do not redo)

Specs 00, 01, 03, 05, 07, 12. Check `PROGRESS.md`; specs 13, 14 and 15 may also have been completed since this prompt was written.

## Your specs, in this dependency order

One at a time; finish and verify each before starting the next:

1. **02** plugin and strategy catalog
2. **04** config and environment builder
3. **06** report aggregation
4. **08** bridge provider
5. **09** bridge server
6. **10** promptfoo runner
7. **11** test editor
8. **16** service, schemas, routes, indexes
9. **17** worker and recovery
10. **13**, **14**, **15**, only if `PROGRESS.md` still shows them Not started
11. **18** page integration
12. **19** remove the in-house engine. Write and test the archive script only; do NOT run it with `--apply`.
13. **20** e2e suite
14. **21** verification pass, including the live smoke run

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
- Known temporary failure: `Frontend/src/pages/RedTeamPage.test.jsx` expects old progress text until spec 18 updates it.
- After each spec passes, commit only that spec's files with the message `Red team promptfoo: spec NN <title>`. No force-push, rebase or branch changes. Never commit `.env` files or `node_modules`.
- Secrets live only in `backend/.env` (`PROMPTFOO_API_KEY`, `PROMPTFOO_CLOUD_HOST`, encryption keys, MongoDB URL). Never print, log, commit or copy them into files. The promptfoo Cloud key is used only through `promptfoo auth login` inside the runner's private, per-run config directory (spec 10).
- For spec 21's live smoke, the human owner starts the stack (RabbitMQ: `sudo docker start sentinel-rabbit`; then the API, worker, dispatcher and recovery from `backend/`). Ask before running anything that needs `sudo`.

## After each spec

Give a short report: files changed, test counts, anything skipped and why.
