# Spec 02 reusable surfaces

| Path | Surface | Contract |
| --- | --- | --- |
| `backend/app/red_team/catalog.py` | `PLUGINS`, `STRATEGIES`, `GROUPS`, `SEVERITIES`, `PROMPTFOO_VERSION` | Read-only mappings keyed by ID and the ordered group and severity vocabularies. Plugin rows expose `id`, `name`, `description`, `group`, `severity` and `remote_only`. Strategy rows expose `id`, `name`, `description`, `remote_only`, `multi_turn`, `cases_per_seed` and `target_calls_per_test`. |
| `backend/app/red_team/catalog.py` | `validate_catalog(data)` | Validates decoded catalog data and returns a pair of immutable registries. Raises `ValueError` for invalid metadata. |
| `backend/app/red_team/catalog.py` | `plugin_label(plugin_id)`, `strategy_label(strategy_id)` | Return a display name for a current ID and preserve the original text for an unknown historical ID. |
| `backend/app/red_team/catalog.py` | `estimated_target_calls(plugins, strategies, tests_per_plugin)` | Estimate target calls from distinct plugin and strategy IDs. Includes `basic` once. Each selected strategy adds `cases_per_seed × target_calls_per_test` calls per seed. Raises `ValueError` for unknown selections. |
| `backend/app/red_team/promptfoo_catalog.json` | Generated metadata | Versioned plugin and strategy display data from the pinned package. |
| `backend/scripts/extract_promptfoo_catalog.py` | `extract(package=PACKAGE)`, CLI `--check` | Reproduce or verify the static catalog from the installed promptfoo package. |
