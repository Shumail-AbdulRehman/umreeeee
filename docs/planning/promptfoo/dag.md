# Red Team on promptfoo — dependency graph (2026-11-22 scheduler redesign)

An edge `A → B` means B consumes A. Waves and the critical path are in `specs-promptfoo/README.md`; the validator's computed schedule is in `validator.md`.

| Edge | Consumer uses |
| --- | --- |
| 00 → 01, 07, 08 | Decisions: pin, flow, labels, bridge contract |
| 01 → 02, 03 | Installed promptfoo pin (catalog metadata; runtime context for the framework port) |
| 01 → 16 | `runtime_status()` for capabilities and launch refusal |
| 02 → 04 | Catalog ids and severities for `redteam.plugins` |
| 02 → 05 | Catalog severity fallback for rows |
| 02 → 06, 16 | Labels, groups (categories), estimates, cap |
| 03 → 06, 16 | Scheduler framework data and `compliance()` |
| 04 → 10 | Config dict, `to_yaml`, clone config, login args, environment |
| 04 → 16 | `provider_id` validation, `config_preview`, `config_hash` |
| 05 → 10 | `sanitize_suite`, `count_suite_tests`, `count_progress` |
| 05 → 17 | `parse_results_json`, `decide` |
| 06 → 16 | `build_report` |
| 07 → 11–15, 18 | Client calls (incl. config preview) and labels |
| 08 → 09 | Provider module and bridge contract |
| 09 → 17 | `BridgeServer`, `make_executor`, `issued_run_ids` |
| 10 → 17 | `PromptfooRun` events and `fake_promptfoo.py` |
| 16 → 17 | Snapshot, job and suite shapes, service helpers |
| 11–15 → 18 | Components composed by the page |
| 16, 17, 18 → 19 | Replacement callers exist before legacy deletion |
| 01–19 → 20 | Every user flow and the pipeline |
| 00–20 → 21 | Every earlier Done-when, plus the live smoke |
