# Spec 06 reusable surfaces

| Path | Symbol | Contract |
| --- | --- | --- |
| `backend/app/services/red_team_report.py` | `build_report(test, attacks, paired=None, previous=None)` | Build the report DTO from a stored test and case results. Rates use decided rows. Engine provenance includes the recorded version, suite ID, planned count, grader model and any stored duration or token usage. |
| `backend/app/services/red_team_report.py` | `build_report` category and severity fields | `categories` lists observed catalog groups, each with passed, failed and error counts, rate, risk and per-strategy cells. `severity_counts` counts failures across the five severity buckets. |
| `backend/app/services/red_team_report.py` | `build_report` comparison inputs | Pass paired and previous runs as `(test, attacks)` or a mapping with `test` and `attacks` keys. `previous` also accepts a built report with test metadata. The caller supplies the eligible records. |
| `backend/app/services/red_team_report.py` | `build_report` paired payload | A terminal raw and protected pair must share a suite ID and at least one test index and repeat. `matched` counts all shared cases. `decided` counts the jointly decided cases and provides both rates' denominator. `delta_pp` is protected minus raw in percentage points. |
| `backend/app/services/red_team_report.py` | `build_report` trend payload | Previous report provenance and rate, relative system risk change in `risk_delta` and relative passed-control changes keyed by framework ID in `framework_deltas`. |
