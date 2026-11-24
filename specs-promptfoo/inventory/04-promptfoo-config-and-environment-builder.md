# Spec 04 reusable surfaces

- `backend/app/red_team/config_builder.py` builds a fresh two-case Promptfoo configuration using the built-in `echo` provider and exact-match assertions. Raw and protected modes share the same case inputs and assertions, identified by `fixture_suite_id()`. Passing a workspace adds JSONL and JSON output paths.
- `subprocess_env(workspace, python_executable)` builds an isolated child environment from fixed settings. The runner supplies the operating-system network isolation.
- The local builder accepts no provider URLs, plugin selectors, custom assertions, credentials or free-form prompts.
- `config_preview(test, snapshot_or_draft)` renders the selected local demo mode as YAML. `redact(config)` masks credential fields, URLs and workspace paths before display.
- `format_purpose(purpose)` formats titled sections, `to_yaml(config)` represents multiline text as literal scalars, and `config_hash(test)` fingerprints generation inputs independently of the target and grader.
- From `backend/`, `.venv/bin/python -m app.red_team.runner` evaluates both mock modes in a private network namespace and prints the verdict counts.
