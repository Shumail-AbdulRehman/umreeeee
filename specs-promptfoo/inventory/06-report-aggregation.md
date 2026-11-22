# Spec 06 reusable surfaces

| Path | Symbol | Contract |
| --- | --- | --- |
| `backend/app/services/red_team_report.py` | `build_report(test, attacks, paired=None, previous=None)` | Build the report DTO from a stored test and iterable of stored attack rows. Rates are fractions over decided rows. Engine provenance uses the recorded version, suite ID, planned count and grader model. |
| `backend/app/services/red_team_report.py` | `build_report` comparison inputs | Pass paired and previous runs as `(test, attacks)` or a mapping with `test` and `attacks` keys. `previous` also accepts a built report with test metadata. The caller supplies the eligible records. |
| `backend/app/services/red_team_report.py` | `build_report` paired payload | A terminal raw and protected pair must share a suite ID and at least one test index and repeat. `matched` counts all shared cases. `decided` counts the shared cases with a decision on both sides and is the denominator for both rates. `delta_pp` is protected minus raw in percentage points. |
