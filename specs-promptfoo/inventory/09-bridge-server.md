# Spec 09 reuse inventory

- `BridgeServer`: loopback-only authenticated protected-run target server with per-key de-duplication.
- `make_executor`: adapter from the bridge contract to `ProtectedPromptService.execute_protected`.
- `backend/tests/unit/test_bridge_server.py`: real loopback coverage through the Promptfoo Python provider.
