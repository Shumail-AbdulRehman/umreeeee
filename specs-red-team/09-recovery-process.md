# Spec 09 — Continuous recovery process

**Status:** Done
**Depends on:** Spec 00
**Model:** Light — `claude-haiku-5-5` · `gpt-6-luna` · `gemini-3.5-flash-lite`
**Issue:** —
**Owns:** `Procfile`, `backend/Procfile`, `backend/DEPLOYMENT.md`
**Reuses:** `backend/app/queue/recovery.py`, `docs/DEEP_PROJECT_REVIEW_2026-10-11.md`

## Goal

Red Team jobs left running by a crashed worker are recovered continuously in deployment, not only when the web process restarts.

## Scope

- Add a `recovery` process to both Procfiles running the existing `python -m app.queue.recovery` loop (root Procfile changes into `backend/` like its other processes).
- Update the Red Team section of `backend/DEPLOYMENT.md`: the recovery process, why it is needed, the Heroku scale command including it, and that it shares the same MongoDB, broker and keys as the worker and dispatcher.
- Note in the deployment guide that the recovery loop prints a counts dictionary every 15 seconds and never replays an uncertain provider call.

## Explicit non-scope

- Changing what recovery does (the judging phase) → spec 23.
- Root `DEPLOYMENT.md` and Netlify config stay unchanged; confirmed by → spec 25.

## Reuse first

- Use the existing `__main__` loop in `app/queue/recovery.py`; do not write a new runner script.

## Steps

1. Add the process lines.
2. Update the deployment guide section.

## Done when

- [x] Both Procfiles declare `web`, `worker`, `dispatcher` and `recovery`, and the existing three lines are byte-identical to before. [static]
- [x] `backend/DEPLOYMENT.md` names the recovery process in the Red Team section and in the `heroku ps:scale` command. [static]
- [x] From `backend/`, `.venv/bin/python -c "import app.queue.recovery"` exits 0 with the test environment variables from `tests/conftest.py`, proving the entry point imports. [static]

## Log

- **2026-11-11**: Implemented. Appended one `recovery` line to each Procfile; the original three lines were checked byte-identical against a copy taken before editing (`cmp` on the first three lines of each file: identical). Root: `recovery: cd backend && python -m app.queue.recovery`. Backend: `recovery: python -m app.queue.recovery`.
- Red Team section of `backend/DEPLOYMENT.md` only: `heroku ps:scale` now includes `recovery=1`; added a paragraph covering why recovery is needed (crashed-worker jobs otherwise recovered only on web restart; confirmed in `backend/app/main.py` startup phase `startup_red_team_recovery`), the 15-second counts-dictionary output with its keys, shared MongoDB/broker/keys, and that uncertain provider calls are finalized as `execution_outcome_unknown` and never replayed. Diff vs. the prior file: one changed line and one added paragraph.
- Verification: `backend/` import check with the test environment variables exited 0 (`import app.queue.recovery`, no output). Importing did not start the loop (the `__main__` guard is untouched).
- Not verified here: the running loop against a live MongoDB/RabbitMQ (`[runtime] [requires: MongoDB, RabbitMQ]`); no Heroku deploy. Root `DEPLOYMENT.md`, `recovery.py` and tracker files were not touched.
