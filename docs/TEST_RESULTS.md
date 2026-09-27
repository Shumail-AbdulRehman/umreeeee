# Verification record — 24 September 2026

This file distinguishes checks actually run from the Phase 3 plan's acceptance targets. No live provider traffic, paid model calls, production data, or adversarial third-party target was used.

## Automated and browser checks

- Full backend regression on an ephemeral MongoDB 8.2.6 single-node replica set: `92 passed, 8 upstream deprecation warnings`. An earlier run found a transient write-conflict failure in the Phase 1 final-admin concurrent-demotion test (80 pass, 1 fail); the transaction retry was hardened and repeated full runs passed. The final report-metadata edit received a focused regression rerun after the full suite.
- Frontend ESLint and Vite production build passed after the final UI adjustments. Python `compileall` and `git diff --check` passed; repeat diff check at handoff.
- Chrome 150 on a separate synthetic organization and fake target metadata: authenticated Red Team page loaded with broker-offline warning; draft persisted and reopened; launch created 10 durable pending jobs (5 adversarial + 5 controls) without a broker/provider call. Cancellation moved all ten to terminal cancelled state; result pagination loaded ten rows; the print action invoked the browser print hook. At 1366×768, 1024×844, and 390×844, the page had zero document-level horizontal overflow and no page-level JavaScript error on the final size check. An earlier draft-save walkthrough uncovered a missing-progress render error; it was fixed before the successful reopen/launch check. The actual queue-to-provider/browser result workflow was not exercised because RabbitMQ was absent.
- UI audit script reported a generic false-positive scroll-animation check and generic style suggestions on `RedTeamPage.jsx`; no scroll animation is implemented. The page-level H1 is supplied by the shared `PageTitle` component. Visual screenshots were inspected at desktop and mobile widths. A mobile sideways-scroll hint was added for wide results tables.

## Phase 3 acceptance coverage

| IDs | Evidence / current result |
|---|---|
| T01–T03 | Tenant/role, draft/launch idempotency and one job set covered by Mongo/API tests. |
| T04–T06 | Fake broker outage/recovery and duplicate `process_job` delivery covered; live RabbitMQ confirm/consumer path not run. |
| T07–T13 | Shared admission, retry and authority/cancellation paths implemented. Expired pre-call, uncertain-call, and persisted-response recovery have focused tests. A two-worker plus workspace live-broker stress test remains unverified. |
| T14–T16 | Raw fake-provider path, protected policy output block with withholding/source segregation, and exact evaluator precedence tested. Live model behavior remains unmeasured. |
| T17–T20 | Score denominator/coverage fixtures, one threshold notification, formula/withheld/expired response export, and comparison mismatch tested. |
| T21–T22 | Persisted reload/launch, cancellation/results/print, and responsive page observed; hidden-tab/logout polling and full keyboard workflow were not fully automated. |

The Phase 3 completion gate in `implementation/PHASE_3_RED_TEAM_COMPLETION.md` is therefore **not yet signed off**. Missing live RabbitMQ and the listed multi-worker/keyboard-polling checks must not be disguised as passes. The earlier Phase 2 detector dataset/latency numbers, exact versions, and known misses are in `EVALUATION_RESULTS.md`. No Phase 3 model-accuracy or live-provider latency claim has been measured.
