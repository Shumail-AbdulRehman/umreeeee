"""Forward a protected-mode test prompt to the worker's loopback bridge."""

import hashlib
import json
import uuid
from http.client import HTTPException
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


_UNAVAILABLE = "Bridge unavailable"
_INVALID_RESPONSE = "Bridge returned an invalid response"
_HTTP_ERRORS = {
    400: "Bridge rejected the request",
    401: "Bridge authentication failed",
    409: "Run cancelled",
}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# Keep the run token and prompt on the worker's loopback connection.
_OPENER = build_opener(ProxyHandler({}), _NoRedirect())


def _redact(message, token, prompt):
    for value in (token, prompt):
        if value:
            message = message.replace(value, "[redacted]")
    return message


def _http_error(response, token, prompt):
    if response.code != 429:
        return {"error": _HTTP_ERRORS.get(response.code, _UNAVAILABLE)}

    try:
        body = json.load(response)
    except (OSError, HTTPException, ValueError):
        body = None
    detail = body.get("detail") if isinstance(body, dict) else body
    detail = _redact(detail, token, prompt) if isinstance(detail, str) and detail else "rate limit"
    return {"error": f"Bridge rate limit: {detail}"}


def _provider_response(reply, token, prompt):
    if not isinstance(reply, dict):
        return {"error": _INVALID_RESPONSE}
    error = reply.get("error")
    has_error = isinstance(error, str) and bool(error)
    if not isinstance(reply.get("output"), str) and not has_error:
        return {"error": _INVALID_RESPONSE}

    response = {
        target: reply[source]
        for source, target in (
            ("output", "output"),
            ("cost", "cost"),
            ("latency_ms", "latencyMs"),
            ("metadata", "metadata"),
        )
        if source in reply
    }
    if has_error:
        response["error"] = _redact(error, token, prompt)

    usage = reply.get("token_usage")
    if isinstance(usage, dict):
        response["tokenUsage"] = {key: usage.get(key) for key in ("prompt", "completion", "total")}

    guardrails = reply.get("guardrails")
    if isinstance(guardrails, dict):
        response["guardrails"] = {
            "flagged": guardrails.get("flagged"),
            "flaggedInput": guardrails.get("flagged_input"),
            "flaggedOutput": guardrails.get("flagged_output"),
            "reason": guardrails.get("reason"),
        }
    return response


def call_api(prompt, options, context):
    """Send one test prompt and translate the bridge's reply for Promptfoo."""
    try:
        config = options["config"]
        url = config["url"].rstrip("/")
        port = urlsplit(url).port
        if not port or url != f"http://127.0.0.1:{port}":
            return {"error": _UNAVAILABLE}
        token = config["token"]
        run_id = config["run_id"]
        timeout = config["timeout_seconds"]
    except (AttributeError, KeyError, TypeError, ValueError):
        return {"error": _UNAVAILABLE}

    context = context or {}
    session_id = (context.get("vars") or {}).get("sessionId") or ""
    metadata = (context.get("test") or {}).get("metadata") or {}
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    key_parts = [run_id, session_id, prompt_hash] if session_id else [run_id, prompt_hash]
    body = {
        "run_id": run_id,
        "session_id": session_id,
        "plugin_id": metadata.get("pluginId") or "",
        "strategy_id": metadata.get("strategyId") or "basic",
        "prompt": prompt,
        "idempotency_key": str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(key_parts))),
    }
    request = Request(
        f"{url}/attack",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            reply = json.load(response)
    except HTTPError as response:
        with response:
            return _http_error(response, token, prompt)
    except (OSError, HTTPException):
        return {"error": _UNAVAILABLE}
    except ValueError:
        return {"error": _INVALID_RESPONSE}

    return _provider_response(reply, token, prompt)
