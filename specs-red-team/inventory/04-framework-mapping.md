# Inventory fragment: spec 04 framework mapping

### frameworks-data
`backend/app/red_team/frameworks.json` — four frameworks `owasp` (10, LLM01-LLM10), `atlas` (16 tactics, `id` null), `nist` (21 Measure controls), `eu` (14). Each control: `key` (unique slug), `id` (display id or null), `name`, `plugins` (subset of the eight spec 00 ids), optional `reason_not_testable`. Mapped plugins: OWASP 5 of 10, ATLAS 6 of 16, NIST 18 of 21, EU 12 of 14; `harmful` maps only to NIST 2.6 and ATLAS Resource Development and Impact. **Added by:** spec 04.

### frameworks-module
`backend/app/red_team/frameworks.py` — pure. `framework_catalog()` returns `[{id, name, total, controls[{key,id,name,plugins}], plugins{plugin_id: [control keys]}}]`; `compliance(plugin_counts)` with `{plugin_id: {"decided": n, "worked": n}}` (a key present means the plugin is selected) returns `{framework_id: {id, name, total, failed, passed, not_tested, controls[{key,id,name,status,worked,decided,reason}]}}` sorted failed, passed, not_tested (stable); `covered_controls(selected_plugins, framework_id)`; `load_frameworks()`; `PLUGIN_IDS`; `FrameworkDataError`. **Added by:** spec 04.

How later specs use it:
- Spec 07: put `framework_catalog()` into the capabilities `frameworks` list; editor coverage counts come from `plugins[plugin_id]` and `covered_controls`.
- Spec 12: build `plugin_counts` from decided/worked per plugin; also add the cross-check that every mapped id exists in `plugins.PLUGINS` (not done here).
- Spec 17: render `compliance(...)[fw]["controls"]`; ATLAS `id` is null, show the name only. `reason` is the text for not tested rows.
- Spec 22: export may reuse the same `compliance` result.
