# Inventory fragment: spec 22 service and API

`TestConfig` / `TestEdit` support plugins (inferred if plugins is supplied), strategies,
tests_per_plugin and optional `JudgeConfig`; legacy categories/num_attacks remain.
V3 totals are derived and field errors have actionable paths. Plain is always added.
`RedTeamService` freezes plugin severities, strategy metadata and judge provider/prices
at launch, rechecking the tenant and enabled model. Clone preserves format and group.
V3 read methods locally import spec 20 queries to avoid cycles. Detail/list `summary`
contains risk/attack_success/decided/threshold; model_calls sums persisted attempt_number (including rate-limit retries),
judge_calls sums judge.attempts. Legacy score is unchanged.
Capabilities adds plugins with mappings, strategies, frameworks, judge support and limits;
legacy version fields are named explicitly. Results route adds plugin/strategy/source.
Indexes cover company/test/plugin_id, strategy_id and verdict_source.
API contract additions live in docs/API_CONTRACTS.md.
