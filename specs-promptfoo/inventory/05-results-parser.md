# Spec 05 reusable surfaces

All symbols are in `backend/app/red_team/results_parser.py`.

| Symbol | Contract |
| --- | --- |
| `parse_jsonl_line(line)` | Normalize one newline-terminated result into a `ResultRow`. Returns `None` for an incomplete line. |
| `parse_final_json(payload)` | Normalize `results.results` into a list of `ResultRow` values in artifact order, preserving repeats. |
| `ResultRow` | Normalized result identity, labels, content, grade, error code and nullable measurements. `prompt` is the rendered prompt and `output` is response text or serialized JSON. |
| `decide(row, bridge_record)` | Resolve a `Verdict` with `verdict` and `verdict_source` fields. Pass `None` for a missing or rejected row. A protected block uses the bridge record's `decision` and matched `policy_evidence` rule results. |
| `Verdict` | Named tuple with the decision (`pass`, `fail` or `error`) and its source (`policy`, `grader` or `none`). |
| `count_suite_tests(suite_text)` | Count inline entries in the suite's YAML `tests` list. |
| `ArtifactParseError` | Parsing exception with a payload-free diagnostic suitable for logging. |
