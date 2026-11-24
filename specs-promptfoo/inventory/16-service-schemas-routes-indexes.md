# Spec 16 reuse inventory

- `RedTeamService._tenant`, `_find` and `_transaction`: retained tenant and transaction boundaries.
- Promptfoo catalog, config builder, framework compliance and report modules are the single pure transform sources.
- `red_team_attacks` and `red_team_suites` indexes are added beside the existing durable run-job outbox indexes.
