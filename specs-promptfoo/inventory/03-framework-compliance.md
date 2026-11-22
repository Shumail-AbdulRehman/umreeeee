# Spec 03 reusable surfaces

| Path | Symbol | Contract |
| --- | --- | --- |
| `backend/app/red_team/framework_compliance.py` | `load_frameworks()` | Return a defensive copy of the four frameworks with app IDs, promptfoo IDs, and upstream-ordered controls and plugin labels. |
| `backend/app/red_team/framework_compliance.py` | `framework_catalog(offered_plugins)` | Return capabilities with each framework's control count and an index of control keys for every offered plugin ID. |
| `backend/app/red_team/framework_compliance.py` | `covered_controls(selected_plugins, framework_id)` | Return mapped control keys for the app framework ID (`owasp`, `nist`, `atlas`, or `eu`). An unknown ID raises `UnknownFrameworkError`, a `ValueError`. |
| `backend/app/red_team/framework_compliance.py` | `compliance(plugin_counts, *, selected_plugins, offered_plugins)` | Return control counts and statuses by framework. Input counts are `{plugin_id: {"decided": n, "worked": n}}` over decided rows, where `worked` means the attack succeeded. Explicit selections govern tallying, including historical selections. Current offerings distinguish coverage gaps. |
| `backend/app/red_team/promptfoo_frameworks.json` | Generated framework metadata | Source artifact for the loader. Contains four frameworks and 61 controls from the installed promptfoo 0.126.0 mappings. |
| `backend/scripts/extract_promptfoo_frameworks.py` | `extract(package=PACKAGE)`, CLI `--check` | Read the pinned package's static metadata and reproduce or verify the JSON offline. |
