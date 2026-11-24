# Spec 18 inventory — Red Team page integration

- `Frontend/src/pages/RedTeamPage.jsx`: Promptfoo-only editor, launch, active run, report, results, detail, clone, cancel and export composition.
- `Frontend/src/hooks/useRedTeamTest.js`: queued/generating/running/cancelling polling with stale response and unmount fences.
- `Frontend/src/features/red-team/ConfigPreview.jsx`: redacted YAML loading/error/stale display.
- `Frontend/src/pages/RedTeamPage.test.jsx` and `Frontend/src/hooks/useRedTeamTest.test.jsx`: request identity, polling, loading, retry and stable launch key coverage.

The legacy report branch has no caller.
