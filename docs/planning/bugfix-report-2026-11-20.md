# Bugfix report — 2026-11-20

1. **RabbitMQ publisher** (`backend/app/queue/rabbit.py:30`). A successful publish previously raised when Pika returned `None`. It now succeeds, and broker exceptions still propagate. `test_rabbit_publisher.py` covers both results and verifies compact JSON, routing, mandatory delivery, and message properties.
2. **Queue resilience** (`backend/app/queue/dispatcher.py:68`, `backend/app/queue/recovery.py:141`). A transient heartbeat or recovery error previously stopped the corresponding process. The dispatcher now uses its reconnect path, and recovery logs the exception type and waits 15 seconds between iterations. `test_queue_resilience.py` verifies that both loops continue after `AutoReconnect`.
3. **Model discovery** (`backend/app/services/llm_integration_service.py:31`, `:198`, `:209`, `:228`, `:239`). All four discovery fetchers now send `Sentinel-LLM-Security/1.0` as the `User-Agent`, replacing urllib's default on these requests. `test_model_discovery_headers.py` captures the requests and verifies the agent and existing authentication values.
4. **Provider errors** (`backend/app/services/provider_service.py:32`, `:54`, `:147`, `:201`). Previously generic errors can now include sanitized identifiers from the first 8 KiB of decoded error body, and empty replies can include a short finish reason. `test_provider_error_detail.py` covers quota and authentication identifiers, credential and free-text exclusion, sanitization, bounded reads, fallback messages, retry headers, and empty replies.
5. **Red Team v3 scoring** (`backend/app/red_team/evidence.py:105`). Scenario-only blocks previously counted as defended attacks or blocked controls. Matches only on `system_prompt` now produce `error / none / harness_text_block` for both case kinds and are excluded from scoring. New cases in `test_red_team_evidence.py:200` verify that outcome and confirm that mixed input matches and response-text matches still count as policy blocks.

## Verification

| Command | Output summary |
| --- | --- |
| `.venv/bin/python -m pytest -q tests/unit` | `485 passed, 8 warnings in 9.70s` |
| `.venv/bin/python -m pytest -q tests/integration` | `116 skipped, 8 warnings in 7.27s` |
| `.venv/bin/python -m compileall -q app` | Exit 0 with no output |
| `npx vitest run --no-cache` | `Test Files  19 passed (19)` · `Tests  214 passed (214)` · `Duration  13.15s` |

The unit run includes 21 new cases. The first run exposed an integer-versus-enum comparison in the new RabbitMQ assertion. The assertion now checks the enum's integer value. Existing assertions were preserved. Pytest warnings were dependency deprecations. `TEST_MONGODB_URL` was unset, so all integration tests skipped. Vitest caching was disabled to avoid frontend cache writes.

## Scope check

Compared `git diff --stat` and `git status --porcelain` with the before-snapshots in `/tmp/bugfix`. A file hash and mode comparison also covered paths with pre-existing changes and untracked files. Only the six allowed application files, five allowed test files, and this report changed. `git diff --check` passed. Verification used fakes and skipped database-backed tests under the plan's live-state rules.
