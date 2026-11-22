# Inventory fragment: spec 19 report states

### report-states
`Frontend/src/features/red-team/ReportStates.jsx` — presentational banners and disclosures; import `./red-team.css`; no API calls. **Added by:** spec 19.
- `CancelledBanner({finished, total, onClone})` — `role="note"`, "Cancelled after N of M attacks"; button "Clone and run again" only when `onClone` is given.
- `FailedBanner({errorCode, total, onAction, actionLabel = 'Open Integrations'})` — `role="alert"`. Codes: `authentication` (provider rejected the integration's credentials), `rate_limited`, `timeout`, `unavailable`, `invalid_model`, `execution_outcome_unknown`; anything else (or missing) gets a generic cause.
- `NoJudgeNote({undecided, onClone})` — `role="note"`; undecided results are inconclusive and left out of the score; button "Clone with a judge".
- `MethodDisclosure()` — closed `<details>` with attack success, risk (open promptfoo scoring model) and judged explanations.
- `Limitations()` — synthetic evidence, provider variation, not proof of safety.

### legacy-report
`Frontend/src/features/red-team/LegacyReport.jsx` — default export `LegacyReport({test})`. Earlier-format banner, compliance/attack-success/coverage metrics, threshold line, controls, `AnalyticsChart` by category, category table, legacy scoring text. Reads `test.score` legacy fields and test metadata only. Uses existing `admin-*` and `red-team-*` classes from the app stylesheet.

How spec 21 uses them: when the test has no v3 report fields render `LegacyReport` (and delete `ScoreSummary` from `RedTeamPage.jsx`); on `cancelled` render `CancelledBanner` above results; on `failed` render `FailedBanner` with the most common error code and an action that opens Integrations; render `NoJudgeNote` when no judge was used and undecided > 0; place `MethodDisclosure` and `Limitations` at the foot of the report.
