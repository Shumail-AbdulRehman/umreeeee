# Spec 05 reusable surfaces

All symbols are in `backend/app/red_team/results_parser.py`.

| Symbol | Contract |
| --- | --- |
| `parse_results_json(text)` | Return `ParsedResults` with normalized rows in artifact order, selected promptfoo stats, first-prompt total latency and skipped counts by reason. |
| `ResultRow` | Test case identity, plugin and strategy, severity, prompt and response text, grade and reason, measurements, assertion details and bridge evidence. |
| `decide(row, issued_run_ids)` | Return a `Verdict` named tuple with `verdict` and `verdict_source`. A policy override requires a bridge-issued run ID and a matched rule outside the system prompt. |
| `count_progress(jsonl_text)` | Count newline-terminated results for progress. |
| `sanitize_suite(yaml_text)` | Keep the generated tests, red-team settings without the provider, default-test metadata and config hash for clone replay. |
| `count_suite_tests(suite)`, `suite_breakdown(suite)` | Count inline tests and return counts under `by_plugin` and `by_strategy` from sanitized suite metadata. |
| `ArtifactParseError`, `SuiteSecretError` | Payload-free artifact diagnostics. `SuiteSecretError` identifies a retained secret key or configured test provider. |
