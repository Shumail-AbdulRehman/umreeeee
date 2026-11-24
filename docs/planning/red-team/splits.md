# Red Team feature-to-spec split

2026-11-11.

| Feature | Specs |
| --- | --- |
| Test case generation | 01 catalog, 02 strategies, 10 manifest |
| Grading | 11 exact evidence, 05 judge prompt/parse, 23 worker judge phase |
| Scoring and compliance | 03 risk, 04 frameworks, 12 aggregation |
| API | 20 read-side queries, 22 service/schemas/routes/indexes |
| UI | 06 foundation, 07 summary math, 08 client and polling, 13-19 views, 21 page |
| Operations | 09 recovery process |
| Proof | 24 e2e, 25 verification |

## Rejected splits

- **One "service and API" spec for reads and writes.** Too large for one session; split into 20 (new read module) and 22 (the only editor of `red_team_service.py`), keeping single ownership of the hot file.
- **Judge inside the grader.** The grader stays pure (11); calls belong to the worker (23) so leases and admission stay in one place.
- **Report math inside the service.** Kept pure (12) so it is unit-testable without MongoDB and reusable by export.
- **One component spec for the whole report.** Split by boundary (16 summary and tables, 17 compliance, 18 results and dialog, 19 states) so four sessions run in parallel.
- **Tokens in `Frontend/src/index.css`.** Rejected to keep the root theme untouched; aliases live in the feature stylesheet (06).
- **Separate polling-fix spec.** Merged into 08, the single owner of the hook, to avoid two owners of one file.
