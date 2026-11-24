# Spec 08 reusable surfaces

- `backend/promptfoo_bridge/provider.py` exposes `call_api(prompt, options, context)` for the protected-mode Promptfoo target. It sends the authenticated bridge request using the run ID, `context.vars.sessionId`, test metadata and a deterministic UUID5 idempotency key.
- The provider is standalone Python. It maps the worker's loopback response to Promptfoo fields, including policy metadata and guardrails, and returns sanitized errors.
- `backend/tests/unit/test_promptfoo_bridge_provider.py` verifies the request and response contract with a loopback HTTP stub and checks isolated import.
