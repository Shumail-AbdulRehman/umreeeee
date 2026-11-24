from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from uuid import uuid4

from app.red_team.bridge_server import BridgeServer, _map_run
from promptfoo_bridge.provider import call_api


def _context():
    return {
        "vars": {"sessionId": "session-1"},
        "test": {"metadata": {"pluginId": "pii:direct", "strategyId": "basic"}},
    }


def _options(url, token, run_id):
    return {"config": {"url": url, "token": token, "run_id": run_id, "timeout_seconds": 2}}


def _allowed(run_id="protected-1"):
    return {
        "output": "safe reply",
        "token_usage": {"prompt": 2, "completion": 3, "total": 5},
        "cost": "0.001",
        "latency_ms": 4,
        "guardrails": None,
        "metadata": {"decision": "allowed", "protected_run_id": run_id, "policy_evidence": []},
    }


def test_allowed_round_trip_bad_token_and_cancelled_request():
    calls = []
    server = BridgeServer(lambda request: calls.append(request) or _allowed(), lambda: False, "run-1")
    url, token = server.start()
    try:
        assert url.startswith("http://127.0.0.1:")
        assert call_api("hello", _options(url, "wrong", "run-1"), _context()) == {
            "error": "Bridge authentication failed"
        }
        reply = call_api("hello", _options(url, token, "run-1"), _context())
        assert reply["output"] == "safe reply"
        assert reply["tokenUsage"] == {"prompt": 2, "completion": 3, "total": 5}
        assert reply["metadata"]["decision"] == "allowed"
        assert len(calls) == 1
    finally:
        server.stop()

    cancelled = BridgeServer(lambda request: calls.append(request), lambda: True, "run-2")
    url, token = cancelled.start()
    try:
        assert call_api("hello", _options(url, token, "run-2"), _context()) == {"error": "Run cancelled"}
        assert len(calls) == 1
    finally:
        cancelled.stop()


def test_blocked_input_maps_policy_evidence_and_issued_run_id():
    mapped = _map_run({
        "status": "blocked_input",
        "id": "protected-2",
        "estimated_cost_usd": "0.001",
        "error_message": "blocked",
        "input_evaluation": {"rule_results": [
            {"field": "system_prompt", "outcome": "match", "rule_id": "ignore", "policy_name": "System"},
            {"field": "user_prompt", "outcome": "match", "rule_id": "r1", "policy_name": "Secrets"},
        ]},
    })
    assert mapped["cost"] == 0.001
    calls = 0

    def execute(_request):
        nonlocal calls
        calls += 1
        return mapped

    server = BridgeServer(execute, lambda: False, "run-3")
    url, token = server.start()
    try:
        reply = call_api("blocked", _options(url, token, "run-3"), _context())
        assert reply["guardrails"] == {
            "flagged": True,
            "flaggedInput": True,
            "flaggedOutput": False,
            "reason": "blocked",
        }
        assert reply["metadata"]["policy_evidence"] == [
            {"field": "user_prompt", "outcome": "match", "rule_id": "r1", "policy_name": "Secrets"}
        ]
        assert server.issued_run_ids() == {"protected-2"}

        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(
                lambda _: call_api("blocked", _options(url, token, "run-3"), _context()),
                range(2),
            ))
        assert replies[0] == replies[1] == reply
        assert calls == 1
    finally:
        server.stop()


def test_rate_limit_and_unexpected_exception_are_safe():
    rate = BridgeServer(
        lambda _request: {"error": "Provider rate limit reached.", "rate_limited": True},
        lambda: False,
        "run-4",
    )
    url, token = rate.start()
    try:
        reply = call_api("secret prompt", _options(url, token, "run-4"), _context())
        assert "rate limit" in reply["error"].lower()
        assert "secret prompt" not in reply["error"]
    finally:
        rate.stop()

    failed = BridgeServer(lambda _request: (_ for _ in ()).throw(RuntimeError("secret prompt")), lambda: False, "run-5")
    url, token = failed.start()
    try:
        reply = call_api("secret prompt", _options(url, token, "run-5"), _context())
        assert reply == {"error": "Bridge unavailable"}
        assert "secret prompt" not in str(reply)
    finally:
        failed.stop()
