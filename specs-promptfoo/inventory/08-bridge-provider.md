# Spec 08 reusable surfaces

- `backend/promptfoo_bridge/provider.py` exposes Promptfoo's `call_api(prompt, options, context)` contract for the two fixed synthetic cases. It returns canned raw or protected outputs and rejects every other case.
- The provider imports no application or networking modules. Its mock response table replaces the HTTP bridge for the local fixture evaluation.
