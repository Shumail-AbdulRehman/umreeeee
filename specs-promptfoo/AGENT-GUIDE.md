# Agent guide — Red Team on promptfoo

## Read before implementing

1. Read `README.md` (including Known gaps), then `PROGRESS.md` for status and the last handoff.
2. Read `00-promptfoo-decisions.md` and `ARCHITECTURE.md`; they are binding (live hosted generation, the bridge, real target calls through the app, organization grader). Then read `DESIGN-SYSTEM.md`, `INVENTORY.md` and the landed fragments in `inventory/`.
3. Read only your assigned spec's scope, reuses and dependency `Done when` sections. For UI work read the cited approved screens, repository `DESIGN.md` and `PRODUCT.md` for tone. Research citations are the source for promptfoo facts; automated tests never run a live scan (spec 21's smoke is the only live run).

## One spec per session

Use a fresh session per spec: Codex `gpt-6.2-sol` for all specs except 04, 08, 09, 10, 16, 17 and 21, which Claude implements; Claude reviews every spec. Tier is sizing, not permission to override scope. Open only after consumed dependencies are `Done`. Write only `Owns` paths (plus the spec's own implementation Log); a coordination or cross-owner finding is not permission to edit another file.

Use an isolated worktree and check `git status` first. Preserve unrelated work. Do not stash, reset, stage broad changes, create issues/PRs, push or deploy without explicit authorization. If authorized, use `.ai/plan-project/references/github-workflow.md`: search before opening one issue, record its real `#<n>`, one focused PR, never merge your own. Otherwise leave `Issue: —`.

## Parallel work and reuse

- `ARCHITECTURE.md` names the hot files; use the authoritative `Owns` header and the spec's scope for the actual edit. Do not update status or tracker rows as a parallel coder; the lead marks verified and merged units `Done`.
- Search `INVENTORY.md`, its linked paths, and fragments before creating anything. Verify symbols, module exports, package pins, and prior-state assumptions against the tree or an ancestor's accepted output. Keep one local inventory fragment per spec. Only spec 21 folds the registry.
- UI components consume props and callbacks, not the API. Use shared app primitives, approved screen layouts and existing CSS tokens only. No raw colors, prototype code, new tokens, or inaccessible custom replacements. Cover keyboard and reduced motion in the numbered spec's tests.

## Commands and isolation

| Purpose | From | Command |
| --- | --- | --- |
| Focused backend tests | `backend/` | `.venv/bin/python -m pytest -q tests/unit/<file>.py` |
| Whole backend unit suite | `backend/` | `.venv/bin/python -m pytest -q tests/unit` |
| Backend static gate | `backend/` | `.venv/bin/python -m compileall -q app`; use the spec's additional script compile when applicable |
| Focused frontend tests | `Frontend/` | `npx vitest run <file>` |
| Whole frontend unit suite | `Frontend/` | `npx vitest run` |
| Frontend static gates | `Frontend/` | `npm run lint` then `npm run build` |
| Browser acceptance (20 and 21 only) | `Frontend/` | `npm run test:red-team` |
| Backend acceptance (20 and 21 only) | `backend/` | `.venv/bin/python -m pytest -q tests/integration/test_red_team_promptfoo_pipeline.py` |

For Mongo integration only, use the earlier Red Team test-database rule: the configured server in `backend/.env`, never the application database. From `backend/`, privately set `TEST_MONGODB_URL` and `TEST_MONGODB_DB_NAME=test_` using the prior `specs-red-team/AGENT-GUIDE.md` method (no echo, shell tracing or credential logging). `backend/tests/integration/conftest.py` appends the 33-character suffix, checks transactions, and drops the unique 38-byte database at teardown. Verify only your own generated database was removed; never bulk-delete by prefix. Skip and log if the URI/replica set is unavailable; do not tick the check. Never edit `.env`.

No automated test runs real promptfoo, calls a provider/hosted grader, reaches RabbitMQ or sends real notifications. Root `--version` is a standalone identity check only. Use synthetic data, fake clock/recorder/providers, the fixed fixture executable and intercepted API as specified. Do not carry auth tokens, Cloud API key, real content, `.env` values, keys, target URLs, or encrypted production data into tests, fixtures, subprocesses, reports, browser traces, PRs or logs. Never add a test-only mode switch to the production API or worker. No manual live smoke under this handoff.

## Before finishing

- Run focused tests, whole touched unit suite and static closing checks. `[static]` inspection/compile/lint/build; `[unit]` unit/component or specified focused integration proof; `[runtime]` local process check; `[e2e]` only 20; `[suite]` only 21; `[requires: …]` names real prerequisites.
- Check only proven criteria. Append the first dated `## Log` entry in your numbered implementation spec with commands, counts, failures, paths and handoff; don't create empty logs. Record a reusable surface or “none” in your own fragment.
- If a dependency, prerequisite or unowned file blocks completion, record the exact result and owner. Do not silently expand scope, introduce a live bridge, or mark a skip as a pass. The lead updates `PROGRESS.md` and statuses.
