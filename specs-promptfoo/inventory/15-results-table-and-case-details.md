# Spec 15 reuse inventory

| Path | Surface | Contract |
| --- | --- | --- |
| [ResultsTable.jsx](../../Frontend/src/features/red-team/ResultsTable.jsx) | `ResultsTable` | Controlled results and paging. On `onFilterChange(next)`, apply the four filter keys (`plugin`, `strategy`, `verdict`, `verdict_source`) and reset the page to 1 together. Pass `loading`, `error` and optional `onRetry` for the result read. `onView(id, { input })` identifies the result and keyboard or pointer activation. |
| [ResultsTable.jsx](../../Frontend/src/features/red-team/ResultsTable.jsx) | `VerdictBadge` | Existing badge for a verdict and source. Uses the shared label registry for graded and unscored results. |
| [AttackDetailDialog.jsx](../../Frontend/src/features/red-team/AttackDetailDialog.jsx) | `AttackDetailDialog` | Controlled through `result`, `loading`, `error` and `onClose`. Pass the row action’s `input`, the test `mode`, and `graderModel` from the test configuration if the result lacks `grader_model`. The result carries authorized `prompt` and `response_text`, retention flags, policy evidence and optional `paired` result. |
| [ReportStates.jsx](../../Frontend/src/features/red-team/ReportStates.jsx) | `CancelledBanner`, `FailedBanner` | Cancellation takes `finished`, `total` and optional `onClone`. Failure takes `failureReason` from the test’s `failure_reason` and optional `onAction`/`actionLabel`. |
