# Inventory fragment: spec 01 plugin catalog

### catalog-v3
`backend/app/red_team/catalog_v3.json` — version `synthetic-catalog-3`: 8 plugins (id, name, group, severity, description, evidence_type, scenario, 4-6 templates `{id, description, prompt}`), 8 strategies (id, name, group, description, effort), 5 controls (`ctl-1`..`ctl-5`). **Added by:** spec 01.

### plugins-loader
`backend/app/red_team/plugins.py` — pure loader and validator. Read-only registries `PLUGINS`, `STRATEGIES`, `CONTROLS` (id to frozen mapping; lists are tuples), `PLUGIN_IDS`, `STRATEGY_IDS`, `CONTROL_IDS`, `CATALOG_VERSION`, `CATALOG_SOURCE`; closed sets `SEVERITIES`, `GROUPS`, `EVIDENCE_TYPES`, `STRATEGY_GROUPS`, `EFFORTS`, `PLACEHOLDERS`; `get_plugin(id)`, `get_strategy(id)`, `load(path)`, `validate(data)`, `fill(text, values)`, `CatalogError(ValueError)` (raised at import for a bad catalog). **Added by:** spec 01.

How later specs use it:
- Placeholders: `scenario` and template/control `prompt` text may contain `{marker}`, `{refusal}`, `{answer}`. Spec 10 substitutes with `fill(text, values)` (do not use `str.format`; one prompt holds literal JSON braces).
- Spec 02: strategy ids/groups/effort come from `STRATEGIES`; ids `basic, base64, rot13, leetspeak, hex, roleplay, hypothetical, authority`.
- Spec 04: key framework maps by `PLUGIN_IDS`; severities in `PLUGINS[id]['severity']` (lowercase).
- Spec 05 / 11: `evidence_type` per plugin: prompt-extraction, direct-injection, harmful = `marker`; pii = `pii`; indirect-injection = `safe_summary`; tool-injection, excessive-agency = `tool_call`; hijacking = `off_topic`. Controls use evidence type `control` (not a plugin value). tool_call evidence = the payload token appears inside fictional call syntax `[[call <tool>(`…`)]]` in the reply; the token itself is in the sent prompt by design; a bare echo of the token is not evidence (spec 11). Template prompts never contain `[[call`; only scenarios define the syntax. harmful and hijacking scenarios tell the model to begin with `{marker}` if it complies.
- Spec 10: manifest rows copy `plugin_id`, `severity`, `template_id`, `evidence_type`, `scenario`.
- Spec 12 / 22: names, groups, descriptions and strategy metadata for capabilities and report rows.
**Added by:** spec 01.
