# Agent guide: Red Team module

## Read before implementing

1. `PROGRESS.md` in this folder. It is the source of current state and outranks anything carried in from a previous session.
2. `ARCHITECTURE.md`, `DESIGN-SYSTEM.md`, `INVENTORY.md` and every fragment in `inventory/`.
3. Your spec, then every file in its `Reuses` line, then the approved screen it cites in `design/red-team/v3/`.
4. Root `DESIGN.md` and `PRODUCT.md` for product tone; root `specs/` is the finished Prompt Studio set and is not edited.

## One spec per session

Implement exactly the dispatched spec. Its `Explicit non-scope` is binding. Write only inside its `Owns` paths; anything else that needs changing becomes a Log line naming the spec that owns it.

## Workspace and publication

This is an existing, heavily dirty working tree with nested `backend/` and `Frontend/` git repositories. Preserve all pre-existing changes. Never `git add -A`, stash, reset, commit mixed changes, push, open issues or PRs, or deploy unless the user explicitly asks in that session. When the user authorizes GitHub work, follow `.ai/plan-project/references/github-workflow.md`: search before creating, title `Spec NN — <title>`, write `#<n>` into the header, one PR per spec, never merge your own PR. Otherwise `Issue` stays `—`. `gh` failures are logged, not fatal.

## Other specs run at the same time

Other sessions may be working in parallel. Do not edit `PROGRESS.md` rows or your own `**Status:**`; the lead records them. Record anything new and reusable in `specs-red-team/inventory/NN-<slug>.md`, never in `INVENTORY.md`.

## Model on the spec

The `**Model:**` tier is the sizing judgement. A spec that stalls is re-tiered upward and re-run, with a Log line.

## Verify before asserting

- Package claims: read `Frontend/package.json` or `backend/requirements*.txt`.
- Paths: resolve against the tree. Prior state: find the ancestor spec's `Done when`.
- Library symbols: check the installed package (`Frontend/node_modules`, `backend/.venv/lib/python3.12/site-packages`).
- Framework control names and IDs: `docs/research/red-team-frameworks.md`; never from memory.
- Never print secrets, `.env` values or API keys, including in test output.

## Reuse before creating

Search `INVENTORY.md`, `inventory/` and the code by responsibility first. Reuse `ProviderService`, `IntegrationAdmission`, `estimate_result_cost`, `encrypt`/`decrypt`, `serialize`, `audit`, the shadcn `ui/` primitives, `DataTable`-free semantic tables, `Modal`/`Dialog`, `FieldErrors`, `formatDate`/`formatNumber`/`formatPercent`.

## Design tokens are a closed list

Only tokens in `DESIGN-SYSTEM.md`. No raw colours outside it and `design/`. A genuinely missing token is added to `DESIGN-SYSTEM.md` in the same session, with a Log line.

## Unit tests prove every spec

Backend, from `backend/`:
- Single file: `.venv/bin/python -m pytest -q tests/unit/<file>.py`
- Whole unit suite: `.venv/bin/python -m pytest -q tests/unit`
- Integration file: the user chose the MongoDB server already configured in `backend/.env` (2026-11-11). Export the URL without printing it, and use the prefix `test_` (Atlas limits database names to 38 bytes; the fixture adds a 33-character suffix and creates and drops its own throwaway database, never the app database):
  `export TEST_MONGODB_URL="$(.venv/bin/python -c "from dotenv import dotenv_values; print(dotenv_values('.env')['MONGODB_URL'])")" TEST_MONGODB_DB_NAME=test_` then `.venv/bin/python -m pytest -q tests/integration/<file>.py`. Remote latency is real: the 11 legacy Red Team integration tests take about 3 minutes. After a run, confirm no `test_*` database is left behind. Never echo the URL, and never point tests at the app database name.
- Static: `.venv/bin/python -m compileall -q app scripts`

Frontend, from `Frontend/`:
- Single file: `npm run test:components -- <path-from-Frontend>`
- Whole unit suite: `npm test`
- Static: `npm run lint` (0 errors, 0 warnings) and `npm run build`. There is no typecheck command; do not invent one.

End to end: `npm run test:red-team` from `Frontend/`, written and run only by spec 24. The whole of both suites from clean runs only in spec 25.

## Acceptance tiers

`[static]` file, lint, compile, build · `[unit]` unit/component tests that ran · `[runtime]` one running process · `[e2e]` spec 24 only · `[suite]` spec 25 only · `[requires: X]` needs a named external service (MongoDB replica set, RabbitMQ, a live provider key). Every spec has a `[static]`; every code spec has `[unit]`.

## Before finishing

1. The spec's behaviour works within its scope and no `ARCHITECTURE.md` invariant is broken.
2. Every `[unit]` command ran in this session; real counts are in the Log.
3. Lint/compile and build pass.
4. The inventory fragment records what was created.
5. The Log states what could not be verified here (for example, integration tests skipped without MongoDB).

## When blocked

Record what was tried and the smallest decision needed in the spec Log, ask the lead to set `Blocked`, and stop. Do not guess past a data contract, tenant boundary or provider-call rule.
