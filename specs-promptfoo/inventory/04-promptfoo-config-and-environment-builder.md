# Spec 04 reusable surfaces

- `backend/app/red_team/config_builder.py` builds a fresh two-case Promptfoo configuration for the raw or protected mock response table. `fixture_suite_id()` identifies the shared inputs and assertions.
- `subprocess_env(workspace, python_executable)` builds an isolated child environment from fixed settings. The runner supplies the operating-system network isolation.
- The local builder accepts no provider URLs, plugin selectors, custom assertions, credentials or free-form prompts.
