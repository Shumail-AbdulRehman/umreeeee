# Inventory fragment: spec 03 risk scoring

### risk-scoring
`backend/app/red_team/risk_scoring.py` — pure 0-10 risk model (promptfoo port, permitted). Inputs are counts only: `StrategyCounts(strategy, decided, worked)` where `worked` = attacks that succeeded (target unsafe). Functions: `score_plugin(plugin_id, severity, strategies) -> PluginRisk` (score, level, worst_strategy, complexity_score, per-strategy `StrategyScore`, `RiskComponents`), `score_system(plugins) -> SystemRisk` (score, level, distribution dict over none/low/medium/high/critical, components), `score_to_level(score)`, `get_strategy_metadata(id)`, `STRATEGY_METADATA`. Levels: `none` (score 0), `low`, `medium`, `high` (>=7), `critical` (>=9). Severities lowercase; others raise `ValueError`. Unknown strategy ids use (exploitable, medium). Scores are unrounded floats; round at display. **Added by:** spec 03.

How later specs use it:
- Spec 12: group job results per plugin into `StrategyCounts` (decided = attacks with a verdict, worked = unsafe ones; skip undecided/errored), call `score_plugin` with the catalog severity, collect the `PluginRisk` list for `score_system`. Persist `score`, `level`, `worst_strategy`.
- Spec 16 / 22: map levels to colours and labels; `none` is a valid level to display.
**Added by:** spec 03.
