# Spec 21 inventory — verification pass

## Observed on 2026-11-23

- Promptfoo checker: binary present, version `0.126.0`, Node major `24`, Cloud key configured, runtime available.
- Backend unit: `481 passed` in 25.67 s.
- Frontend component suite: `298 passed` in 16.24 s (one unrelated clipboard timing failure on the first parallel run; immediate isolated full rerun passed).
- Red Team Chromium acceptance: `9 passed` in 38.8 s.
- Mongo Promptfoo integration selection: API 2 passed, worker/recovery 2 passed, pipeline 1 passed against temporary transaction-backed `test_*` databases. The broader focused backend selection was 26 passed in 79.73 s.
- `python -m compileall -q app`, archive `py_compile`, frontend lint and production build passed.
- Spec validator: 22 specs, 0 errors, 52 non-blocking warnings.
- Impeccable detector on changed UI targets: no findings.

## Unmet external gates

- Clean installs were not repeated in a fresh worktree; the existing pinned root, backend virtual environment and frontend install were used.
- The live raw/protected paired smoke was not launched. Although the Promptfoo Cloud key, Groq models and verified organization users exist, RabbitMQ and the API/dispatcher/worker/recovery processes were not running. No direct database launch or substitute flow was used.
- No archive `--apply` or deployment action was performed.

These are recorded as unmet prerequisites, not passing criteria.
