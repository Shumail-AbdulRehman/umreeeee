# Spec 03 reusable surfaces

| Path | Symbol | Contract |
| --- | --- | --- |
| `backend/app/red_team/framework_compliance.py` | `load_frameworks()` | Return a defensive copy of nine frameworks in scheduler order. Each control has a stable key equal to its scheduler ID and a list of plugin metadata. |
| `backend/app/red_team/framework_compliance.py` | `framework_catalog(offered_plugins)` | Return the framework metadata, the number of controls and an index of control keys for each offered plugin ID. |
| `backend/app/red_team/framework_compliance.py` | `covered_controls(selected_plugins, framework_id)` | Return mapped control keys in scheduler order. An unknown framework ID raises `UnknownFrameworkError`, a `ValueError`. |
| `backend/app/red_team/framework_compliance.py` | `compliance(plugin_counts, *, selected_plugins, offered_plugins)` | Summarize controls and coverage from per-plugin `passed`, `failed` and `errors` counts. Accepts legacy `decided` and `worked` counts. Failed takes precedence over passed. Controls with only errors are `not_tested` with a distinct reason. Coverage is the percentage of controls that passed. |
| `backend/app/red_team/scheduler_frameworks.json` | Generated framework metadata | Contains nine frameworks, 90 controls and their exact scheduler plugin mappings. |
| `backend/scripts/port_scheduler_frameworks.py` | `port_frameworks(path)` | Parse the scheduler's literal `FRAMEWORKS` assignment and project metadata with source provenance. Running the script with the input file regenerates the JSON. |
