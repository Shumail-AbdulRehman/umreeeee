# Inventory fragment: spec 12 report aggregation

### report-v3
`backend/app/services/red_team_report_v3.py` — pure v3 report builder (no database, network or clock). `build_report(test, jobs, paired=None, previous=None) -> dict`; `paired`/`previous` are `(test, jobs)` or `{'test', 'jobs'}` and count only when that test is terminal. Helpers: `is_terminal(test)` (status in `red_team_report_service.TERMINAL_TEST_STATES`), `is_cancelled(test)` (status `cancelled` or `cancel_requested_at`), `outcome(job)` (`cancelled` by state first, else verdict, else `pending`), `round_half_up(value, places)`, `RISK_PLACES` 1, `RATE_PLACES` 3. Reads job `case_kind`, `plugin_id`, `strategy_id`, `severity`, `state`, `verdict`, `verdict_source`, `verdict_reason_code`; test `_id`, `status`, `mode`, `num_attacks`, `threshold_score`, `minimum_evaluable_fraction`, `plugins`, `strategies`, `cancel_requested_at`, `finished_at`. **Added by:** spec 12.

Payload (rates 0-1 floats to 3 decimals, risk to 1 decimal, half-up; levels and sorting from unrounded values; `rate` null when nothing decided):
- `provisional` bool: true while the test is not terminal; then `risk`, `threshold`, `compliance` are null and plugin `risk_score`/`level`/`worst_strategy` are null.
- `risk` {score, level, by_level{none,low,medium,high,critical}}.
- `attack_success` {rate, worked, decided, proven, judged}.
- `decided` {decided, adversarial, exact, judge, policy, defended, unsafe, inconclusive, errors, cancelled, pending} (`exact`/`judge`/`policy` split decided results by `verdict_source`).
- `threshold` {threshold, defended_rate, verdict `meets_threshold`|`below_threshold`|`insufficient_evidence`, coverage, minimum_coverage}.
- `plugins` [{id, name, severity, decided, worked, rate, risk_score, level, worst_strategy, worst_strategy_name}] by risk desc then name (provisional: rate desc, undecided last).
- `strategies` [{id, name, decided, worked, rate}] by rate desc (undecided last) then name; `basic` always listed.
- `compliance` [{framework, name, totals{total, mapped, failed, passed, not_tested}, controls[{key, id, name, status, worked, decided, reason}]}] in `frameworks.json` order; `controls` come straight from `frameworks.compliance`.
- `controls` {answered, blocked, inconclusive, error, cancelled, pending, total} (blocked = reason `control_blocked` or any control `fail`).
- `paired` {test_id, mode, status, risk, attack_success, plugin_rates{plugin_id: rate}} or null.
- `trend` {test_id, risk_score, risk_level, attack_success_rate, finished_at} or null.

How later specs use it:
- Spec 20 `report(db, test)`: load the test's jobs, the paired and previous tests with their jobs, call `build_report`, then add the reproducibility metadata and limitations (not produced here). `finished_at` and `test_id` pass through unserialized apart from `str(_id)`.
- Spec 22: v3 report route returns spec 20's result; legacy tests keep `red_team_report_service.score`.
- Specs 16/17: render the payload as is; percent = rate x 100 to 1 decimal; risk already 1 decimal.
