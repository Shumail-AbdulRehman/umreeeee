# Spec 20 inventory — end-to-end acceptance

- `Frontend/tests/red-team.spec.js`: nine intercepted-browser cases covering draft/preview/launch, runtime failure, active phases/cancel, report/compliance, result detail, protected clone, exports, recovery, reduced motion and narrow layout.
- `Frontend/tests/fixtures/red-team-api.js`: Promptfoo 0.126.0 catalog-backed API fixture; every unexpected API request fails and no external route is allowed.
- `Frontend/playwright.redteam.config.js`: isolated Chromium build/preview harness with failure traces and screenshots.
- `backend/tests/integration/test_red_team_promptfoo_pipeline.py`: isolated transaction-backed raw generation and protected-clone evaluation through the fixed fake binary and real bridge; asserts encryption, retention, suite reuse and paired reporting.
- `backend/tests/integration/conftest.py`: creates and drops a uniquely suffixed `test_*` database and supplies only fake provider/CLI dependencies.

Results on 2026-11-23: browser 9 passed; Mongo pipeline 1 passed.
