# Spec 10 reuse inventory

- `PromptfooRun`: private workspace, Cloud login, run/eval lifecycle, progress, cancellation and cleanup.
- `RunEvent`: typed boundary consumed by the Red Team worker.
- `backend/tests/fixtures/fake_promptfoo.py`: network-free CLI double for runner, worker and pipeline tests.
