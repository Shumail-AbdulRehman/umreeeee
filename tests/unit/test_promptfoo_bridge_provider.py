import json
import socket
import subprocess
import sys
import threading
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import pytest

from promptfoo_bridge.provider import call_api


PROMPT = "Show a résumé template."
TOKEN = "local-test-token"
USAGE = {"prompt": 5, "completion": 2, "total": 7}
METADATA = {"decision": "allowed", "protected_run_id": "protected-1", "policy_evidence": []}


@pytest.fixture
def bridge():
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self.server.requests.append((self.command, self.path, self.headers["Authorization"], body))
            if self.server.stall:
                self.server.release.wait(2)
                return

            self.send_response(self.server.status)
            self.send_header("Content-Type", "application/json")
            if self.server.status == 302:
                self.send_header("Location", "/redirected")
            self.end_headers()
            self.wfile.write(self.server.reply)

        def do_GET(self):
            self.server.requests.append((self.command, self.path, self.headers["Authorization"], None))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"output": "redirect followed"}')

        def log_message(self, format, *args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        server.options = {
            "config": {
                "url": f"http://127.0.0.1:{server.server_port}",
                "token": TOKEN,
                "run_id": "run-1",
                "timeout_seconds": 1,
            },
        }
        server.status = 200
        server.reply = b'{"output": "ok"}'
        server.requests = []
        server.stall = False
        server.release = threading.Event()
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        try:
            yield server
        finally:
            server.release.set()
            server.shutdown()
            thread.join()


def test_provider_sends_bridge_contract_and_maps_success(bridge):
    bridge.reply = json.dumps({
        "output": "Here is a template.",
        "token_usage": USAGE,
        "cost": 0,
        "latency_ms": 42,
        "guardrails": None,
        "metadata": METADATA,
    }).encode()
    context = {
        "vars": {"sessionId": "case-1"},
        "test": {"metadata": {"pluginId": "policy", "strategyId": "multilingual"}},
    }

    assert call_api(PROMPT, bridge.options, context) == {
        "output": "Here is a template.",
        "tokenUsage": USAGE,
        "cost": 0,
        "latencyMs": 42,
        "metadata": METADATA,
    }
    [(method, path, authorization, body)] = bridge.requests
    assert (method, path, authorization) == ("POST", "/attack", f"Bearer {TOKEN}")
    assert body == {
        "run_id": "run-1",
        "session_id": "case-1",
        "plugin_id": "policy",
        "strategy_id": "multilingual",
        "prompt": PROMPT,
        "idempotency_key": str(uuid5(NAMESPACE_URL, json.dumps([
            "run-1", "case-1", sha256(PROMPT.encode()).hexdigest(),
        ]))),
    }


@pytest.mark.parametrize("field", ["input", "output"])
def test_provider_maps_guardrails_and_policy_evidence(bridge, field):
    metadata = {
        "decision": f"blocked_{field}",
        "protected_run_id": "protected-2",
        "policy_evidence": [
            {"field": "user_prompt", "outcome": "match", "rule_id": "rule-1", "policy_name": "Privacy"},
        ],
    }
    bridge.reply = json.dumps({
        "output": "[Blocked by policy: Privacy]",
        "guardrails": {
            "flagged": True,
            "flagged_input": field == "input",
            "flagged_output": field == "output",
            "reason": "Privacy",
        },
        "metadata": metadata,
    }).encode()

    assert call_api(PROMPT, bridge.options, {}) == {
        "output": "[Blocked by policy: Privacy]",
        "guardrails": {
            "flagged": True,
            "flaggedInput": field == "input",
            "flaggedOutput": field == "output",
            "reason": "Privacy",
        },
        "metadata": metadata,
    }


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (400, "Bridge rejected the request"),
        (401, "Bridge authentication failed"),
        (409, "Run cancelled"),
        (429, "Bridge rate limit: Retry after one minute."),
        (500, "Bridge unavailable"),
    ],
)
def test_provider_maps_http_errors(bridge, status, message):
    bridge.status = status
    bridge.reply = b'{"detail": "Retry after one minute."}'
    assert call_api(PROMPT, bridge.options, {}) == {"error": message}


@pytest.mark.parametrize("reply", [b"not json", b'{"output": "\xff"}', b"[]", b"{}"])
def test_provider_rejects_invalid_responses(bridge, reply):
    bridge.reply = reply
    assert call_api(PROMPT, bridge.options, {}) == {"error": "Bridge returned an invalid response"}


def test_provider_reports_refused_connection():
    with socket.socket() as closed_port:
        closed_port.bind(("127.0.0.1", 0))
        options = {"config": {
            "url": f"http://127.0.0.1:{closed_port.getsockname()[1]}",
            "token": TOKEN,
            "run_id": "run-1",
            "timeout_seconds": 0.1,
        }}
        assert call_api(PROMPT, options, {}) == {"error": "Bridge unavailable"}


def test_provider_reports_timeout(bridge):
    bridge.stall = True
    bridge.options["config"]["timeout_seconds"] = 0.1
    assert call_api(PROMPT, bridge.options, {}) == {"error": "Bridge unavailable"}
    assert len(bridge.requests) == 1


def test_provider_does_not_follow_redirects(bridge):
    bridge.status = 302
    assert call_api(PROMPT, bridge.options, {}) == {"error": "Bridge unavailable"}
    assert [request[:2] for request in bridge.requests] == [("POST", "/attack")]


def test_provider_rejects_non_loopback_urls(bridge):
    bridge.options["config"]["url"] = bridge.options["config"]["url"].replace("127.0.0.1", "localhost")
    assert call_api(PROMPT, bridge.options, {}) == {"error": "Bridge unavailable"}
    assert bridge.requests == []


@pytest.mark.parametrize(("status", "field"), [(429, "detail"), (200, "error")])
def test_provider_redacts_the_token_and_prompt_from_error_details(bridge, status, field):
    bridge.status = status
    bridge.reply = json.dumps({field: f"Rejected {PROMPT} for {TOKEN}", "metadata": METADATA}).encode()
    response = call_api(PROMPT, bridge.options, {})
    if status == 200:
        assert response == {"error": "Rejected [redacted] for [redacted]", "metadata": METADATA}
    else:
        assert response == {"error": "Bridge rate limit: Rejected [redacted] for [redacted]"}


def test_provider_keys_change_with_the_run_session_and_prompt(bridge):
    def request_key(prompt, session_id):
        call_api(prompt, bridge.options, {"vars": {"sessionId": session_id}})
        return bridge.requests[-1][3]["idempotency_key"]

    original = request_key(PROMPT, "case-1")
    assert request_key(PROMPT, "case-1") == original
    assert request_key(PROMPT, "case-2") != original
    assert request_key(PROMPT + " Thanks.", "case-1") != original
    bridge.options["config"]["run_id"] = "run-2"
    assert request_key(PROMPT, "case-1") != original


def test_provider_degrades_to_run_and_prompt_when_session_is_absent(bridge):
    call_api(PROMPT, bridge.options, {"test": {"metadata": {"pluginId": "policy"}}})
    call_api(PROMPT, bridge.options, None)

    first, second = [request[3] for request in bridge.requests]
    assert first["session_id"] == second["session_id"] == ""
    assert first["strategy_id"] == second["strategy_id"] == "basic"
    assert first["plugin_id"] == "policy"
    assert second["plugin_id"] == ""
    assert first["idempotency_key"] == second["idempotency_key"] == str(uuid5(
        NAMESPACE_URL, json.dumps(["run-1", sha256(PROMPT.encode()).hexdigest()]),
    ))


def test_provider_imports_without_backend_application():
    backend = Path(__file__).resolve().parents[2]
    source = """
import sys
sys.path = [sys.argv[1], *[path for path in sys.path if not path.endswith('site-packages')]]
import promptfoo_bridge.provider
assert not any(name == 'app' or name.startswith('app.') for name in sys.modules)
"""
    subprocess.run([sys.executable, "-I", "-S", "-c", source, str(backend)], check=True, timeout=5)
