# Spec 17 inventory — worker and recovery

- `backend/app/workers/red_team_worker.py`: one leased Promptfoo run job, authority and credential checks, protected bridge lifecycle, suite persistence, encrypted import, cancellation and transactional finalization.
- `backend/app/queue/recovery.py`: pre-generation replay boundary and interrupted evaluation/import finalization.
- `backend/tests/unit/test_red_team_worker_promptfoo.py`: parser/import, policy issuance fence, suite accounting, credential and message boundaries.
- `backend/tests/integration/test_red_team_promptfoo_worker.py`: transaction-backed raw/protected-clone worker acceptance plus pre-generation and interrupted-run recovery.
- `backend/tests/integration/conftest.py`: isolated `test_*` database and fixed fake-binary pipeline fixture shared with spec 20.

No per-case evaluator or judge path remains in the worker.

Mongo acceptance on 2026-11-23: 2 passed.
