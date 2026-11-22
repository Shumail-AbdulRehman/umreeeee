# Inventory fragment: spec 07 editor summary

### editor-summary
`Frontend/src/features/red-team/editorSummary.js` — `computeEditorSummary({plugins, strategies, testsPerPlugin, judge, capabilities})`. Pure, no React, no fetch. `plugins` and `strategies` are id arrays (strategies must exclude `basic`; a stray `basic` is ignored). `capabilities` is the capabilities response and may be partial; missing `max_attacks` (100), `max_tests_per_plugin` (10), `requests_per_minute` (6) and `control_count` (5) fall back to those defaults. Returns `{attacks, controls, modelCalls, judgeCalls, minutes, coverage, blocking, maxAttacks, maxTestsPerPlugin}`, where `coverage` is `[{id, name, covered, total}]` in `capabilities.frameworks` order, `blocking` is `null` or one message string, and `judgeCalls` is 0 without a judge. **Added by:** spec 07.

How spec 14 uses it:
- Call on every editor change with the selected plugin ids, selected strategy ids, the tests-per-plugin value and the judge toggle, passing the capabilities object from props. Do not recompute attacks or minutes in the component.
- Render `attacks`, `modelCalls`, `judgeCalls` (show "about N" as an estimate when judge is on, "None" when off), `minutes` ("about N min") and `coverage` rows ("covered of total").
- Disable the launch button when `blocking` is a non-null string, and show that string as the warning. Its messages name the live `maxAttacks`, so the server limit and the UI stay in step.
- Coverage is distinct control ids per framework from the selected plugins' `frameworks` maps. Use `total` from the framework list; it is 0 only when the capabilities response had no frameworks list.
