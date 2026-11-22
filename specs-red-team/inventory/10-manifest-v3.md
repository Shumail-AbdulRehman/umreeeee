# Inventory fragment: spec 10 manifest builder v3

### manifest-v3
`backend/app/red_team/manifest_v3.py` — pure. `build_manifest(plugins, strategies, tests_per_plugin, seed)` returns rows (list of dicts); `manifest_hash` re-exported from `catalog_schema`; limits `MAX_ATTACKS=100`, `MAX_TESTS_PER_PLUGIN=10`. `ValueError` for unknown/duplicate ids, empty plugins, tests outside 1-10, total over 100 (message names the limit). `basic` is always added. Rows: plugin x strategy x repetition, seeded shuffle, five controls appended last.

Row fields: `attack_index, attack_id` (= template id, legacy name), `template_id, strategy_id, plugin_id` (None for control), `severity` (None for control), `case_kind` (`adversarial`|`control`), `evidence_type`, `description`, `original_prompt` (filled template before the strategy), `prompt` (as sent), `scenario_system`, `forbidden_marker` (SYNTH-PRIVATE-), `refusal_token` (REFUSE-), `control_answer` (SAFE-SUPPORT-), `off_topic_marker` (OFFTOPIC-), `tool_payload_marker` (TOOLPAYLOAD-), `failure_marker`.

Marker scheme: suffix = first 12 hex (upper) of sha256 of `seed:index:plugin:strategy:template`; all five markers share it but differ by prefix. `{marker}` is filled by evidence type and `failure_marker` is that same value: marker, pii, safe_summary -> forbidden_marker; off_topic -> off_topic_marker; tool_call -> tool_payload_marker; control -> None (grade control_answer). Only tool_call prompts contain their failure marker (as payload, by design). Strategy seed material is `seed:index:plugin:template`.

How specs use it: spec 11 grades with `failure_marker` and `evidence_type` (refusal_token and control_answer for pass/control checks; grade against the ORIGINAL marker, since encoding strategies transform the sent text); spec 22 persists rows as jobs (attack_index pairs raw and protected runs) and stores `manifest_hash(rows)`; spec 23 sends `scenario_system` + `prompt`.
**Added by:** spec 10.
