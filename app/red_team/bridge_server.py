"""Loopback HTTP bridge for protected-mode red-team runs.

The worker starts one `BridgeServer` per protected run. promptfoo's target
provider (`backend/promptfoo_bridge/provider.py`) POSTs each generated attack
here; the server executes it through `ProtectedPromptService.execute_protected`
with the frozen policy snapshot and returns the reply plus the policy decision.
"""

import hmac
import json
import math
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from secrets import token_urlsafe
from types import SimpleNamespace
from uuid import UUID

from app.schemas.prompts import PromptRunExecuteRequest
from app.services.protected_prompt_service import ProtectedPromptService, RunOutcome

_MAX_BODY = 256 * 1024
_POLICY_BLOCKS = {"blocked_input", "blocked_output"}


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return numeric if math.isfinite(numeric) else None


def _policy_evidence(run):
    """Matched rule results outside `system_prompt`, in the shape spec 05 reads."""
    evidence = []
    for stage in ("input_evaluation", "output_evaluation"):
        evaluation = run.get(stage) or {}
        for item in evaluation.get("rule_results") or ():
            if (item.get("outcome") == "match"
                    and item.get("field") not in (None, "", "system_prompt")):
                evidence.append({
                    "field": item.get("field"),
                    "outcome": "match",
                    "rule_id": item.get("rule_id"),
                    "policy_name": item.get("policy_name"),
                })
    return evidence


def _policy_names(run):
    names = [item.get("policy_name") for item in _policy_evidence(run) if item.get("policy_name")]
    if not names:
        names = [p.get("name") for p in run.get("policy_snapshots") or () if p.get("name")]
    seen, unique = set(), []
    for name in names:
        if name and name not in seen:
            seen.add(name)
            unique.append(name)
    return unique


def _map_run(run):
    """Translate a protected run into the bridge response shape."""
    status = run.get("status")
    metadata = {
        "decision": status if status in _POLICY_BLOCKS or status == "allowed" else "error",
        "protected_run_id": run.get("id"),
        "policy_evidence": _policy_evidence(run) if status in _POLICY_BLOCKS else [],
    }
    result = {
        "token_usage": {
            "prompt": run.get("prompt_tokens"),
            "completion": run.get("completion_tokens"),
            "total": run.get("total_tokens"),
        },
        "cost": _number(run.get("estimated_cost_usd")),
        "latency_ms": run.get("provider_latency_ms"),
        "metadata": metadata,
        "guardrails": None,
    }
    if status == "allowed":
        result["output"] = run.get("response_text") or ""
    elif status in _POLICY_BLOCKS:
        result["output"] = f"[Blocked by policy: {', '.join(_policy_names(run)) or 'organization policy'}]"
        result["guardrails"] = {
            "flagged": True,
            "flagged_input": status == "blocked_input",
            "flagged_output": status == "blocked_output",
            "reason": run.get("error_message") or "Blocked by an organization policy.",
        }
    else:
        result["error"] = run.get("error_message") or "Execution failed."
        if run.get("error_code") in {"integration_busy", "rate_limited"}:
            result["rate_limited"] = True
    return result


def make_executor(db, test, snapshot, subject, provider_service):
    """Build the protected executor the bridge calls per attack."""
    context = SimpleNamespace(
        id=str(subject["_id"]), role=subject["role"],
        token_version=subject.get("token_version", 0),
        group_ids=subject.get("group_ids", []),
        company=SimpleNamespace(id=str(test["company_id"])),
    )

    def executor(request):
        payload = PromptRunExecuteRequest(
            integration_id=str(test["integration_id"]), model=test["model"],
            prompt=request["prompt"], temperature=snapshot["temperature"],
            max_tokens=snapshot["max_tokens"],
        )
        identity = {
            "source": "red_team", "key": request["idempotency_key"],
            "request_id": request.get("run_id", ""), "snapshot": snapshot,
            "scenario_system": "",
        }
        try:
            run = ProtectedPromptService(db, provider_service).execute_protected(
                context, payload, identity)["run"]
        except RunOutcome as outcome:
            run = outcome.run
        return _map_run(run)

    return executor


class BridgeServer:
    def __init__(self, executor, is_cancelled, run_id):
        self._executor = executor
        self._is_cancelled = is_cancelled
        self._run_id = run_id
        self._token = token_urlsafe(32)
        self._issued = set()
        self._issued_lock = threading.Lock()
        self._cache = {}
        self._key_locks = {}
        self._locks_guard = threading.Lock()
        self._httpd = None
        self._thread = None

    def issued_run_ids(self):
        with self._issued_lock:
            return set(self._issued)

    def _record_issued(self, run_id):
        if run_id:
            with self._issued_lock:
                self._issued.add(run_id)

    def _key_lock(self, key):
        with self._locks_guard:
            return self._key_locks.setdefault(key, threading.Lock())

    def _handle(self, body):
        if not hmac_token_ok(body.get("_token"), self._token):
            return 401, {"error": "unauthorized"}
        if body.get("run_id") != self._run_id:
            return 400, {"error": "invalid run"}
        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not (1 <= len(prompt) <= 24000):
            return 400, {"error": "invalid prompt"}
        key = body.get("idempotency_key")
        try:
            UUID(str(key))
        except (ValueError, TypeError, AttributeError):
            return 400, {"error": "invalid key"}
        for name in ("session_id", "plugin_id", "strategy_id"):
            value = body.get(name, "")
            if not isinstance(value, str) or len(value) > 200:
                return 400, {"error": f"invalid {name}"}
        if self._is_cancelled():
            return 409, {"error": "cancelled"}
        with self._key_lock(key):
            if key in self._cache:
                return self._cache[key]
            request = {
                "run_id": body["run_id"], "session_id": body.get("session_id", ""),
                "plugin_id": body.get("plugin_id", ""), "strategy_id": body.get("strategy_id", "basic"),
                "prompt": prompt, "idempotency_key": key,
            }
            try:
                result = self._executor(request)
            except Exception:  # noqa: BLE001 - never leak the prompt or a stack trace
                return 500, {"error": "Bridge execution failed"}
            self._record_issued((result.get("metadata") or {}).get("protected_run_id"))
            rate_limited = result.pop("rate_limited", False)
            if rate_limited:
                response = (429, {"error": "rate limit", "detail": "Integration is busy."})
            else:
                response = (200, result)
            self._cache[key] = response
            return response

    def start(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):  # noqa: N802
                if self.path != "/attack":
                    self._send(404, {"error": "not found"})
                    return
                token = ""
                header = self.headers.get("Authorization", "")
                if header.startswith("Bearer "):
                    token = header[len("Bearer "):]
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > _MAX_BODY:
                    self._send(400, {"error": "invalid body"})
                    return
                try:
                    body = json.loads(self.rfile.read(length))
                    assert isinstance(body, dict)
                except (ValueError, AssertionError):
                    self._send(400, {"error": "invalid json"})
                    return
                body["_token"] = token
                status, payload = server._handle(body)
                self._send(status, payload)

            def _send(self, status, payload):
                data = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        port = self._httpd.server_address[1]
        return f"http://127.0.0.1:{port}", self._token

    def stop(self):
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None


def hmac_token_ok(presented, expected):
    if not isinstance(presented, str):
        return False
    return hmac.compare_digest(presented, expected)
