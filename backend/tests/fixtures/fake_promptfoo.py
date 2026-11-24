#!/usr/bin/env python3
"""Network-free promptfoo CLI double used by runner and worker tests."""

import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import time

import yaml


def _trace(argv):
    destination = os.environ.get("FAKE_PROMPTFOO_TRACE")
    if not destination:
        return
    safe = list(argv)
    if "--api-key" in safe:
        safe[safe.index("--api-key") + 1] = "[redacted]"
    record = {
        "argv": safe,
        "env": {key: os.environ.get(key) for key in (
            "PROMPTFOO_CONFIG_DIR", "PROMPTFOO_DISABLE_TELEMETRY", "PROMPTFOO_DISABLE_UPDATE",
            "PROMPTFOO_DISABLE_SHARING", "PROMPTFOO_CACHE_ENABLED", "FORCE_COLOR",
            "PROMPTFOO_PYTHON", "PYTHONPATH",
        )},
    }
    with Path(destination).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def _arg(argv, name):
    return argv[argv.index(name) + 1]


def _load_provider(target):
    path = target["id"].removeprefix("file://")
    spec = importlib.util.spec_from_file_location("fake_promptfoo_target", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _tests(config):
    existing = config.get("tests")
    if isinstance(existing, list):
        return existing
    generated = []
    strategies = ["basic"] + [entry["id"] for entry in config.get("redteam", {}).get("strategies", [])]
    for plugin in config.get("redteam", {}).get("plugins", []):
        for strategy in strategies:
            for index in range(plugin.get("numTests") or config["redteam"].get("numTests") or 1):
                generated.append({
                    "vars": {"prompt": f"Synthetic {plugin['id']} attack {index + 1} ({strategy})"},
                    "metadata": {
                        "pluginId": plugin["id"],
                        "strategyId": strategy,
                        "severity": plugin.get("severity", "medium"),
                    },
                    "assert": [{"type": "promptfoo:redteam", "metric": plugin["id"]}],
                })
    return generated


def _write_suite(config, tests, path):
    suite = dict(config)
    suite["tests"] = tests
    path.write_text(yaml.safe_dump(suite, sort_keys=False), encoding="utf-8")


def _evaluate(config, tests):
    target = config["targets"][0]
    provider = _load_provider(target) if target.get("id", "").startswith("file://") else None
    rows = []
    jsonl_path, results_path = map(Path, config["outputPath"])
    delay = float(os.environ.get("FAKE_PROMPTFOO_DELAY", "0"))
    for index, case in enumerate(tests):
        prompt = case.get("vars", {}).get("prompt", f"Synthetic prompt {index + 1}")
        if provider:
            response = provider.call_api(
                prompt,
                {"config": target.get("config", {})},
                {"vars": {"sessionId": f"session-{index}"}, "test": {"metadata": case.get("metadata", {})}},
            )
        else:
            response = {
                "output": f"Synthetic target reply {index + 1}",
                "tokenUsage": {"prompt": 4, "completion": 5, "total": 9},
                "cost": 0.001,
                "latencyMs": 2,
            }
        guarded = bool((response.get("guardrails") or {}).get("flagged"))
        has_error = bool(response.get("error"))
        passed = not guarded and not has_error
        row = {
            "testIdx": index,
            "repeatIndex": 0,
            "testCase": {"metadata": case.get("metadata", {}), "assert": case.get("assert", [])},
            "metadata": case.get("metadata", {}),
            "prompt": {"raw": prompt},
            "response": response,
            "latencyMs": response.get("latencyMs", 2),
            "cost": response.get("cost", 0),
            "score": 1 if passed else 0,
            "failureReason": 0 if passed else 1,
            "gradingResult": {"pass": passed, "reason": "Synthetic grader verdict"},
        }
        if has_error:
            row.pop("gradingResult")
            row["error"] = response["error"]
        rows.append(row)
        with jsonl_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row) + "\n")
        if delay:
            time.sleep(delay)
    results_path.write_text(json.dumps({
        "results": {
            "results": rows,
            "stats": {
                "successes": sum(bool(row.get("gradingResult", {}).get("pass")) for row in rows),
                "failures": sum(row.get("gradingResult", {}).get("pass") is False for row in rows),
                "errors": sum("gradingResult" not in row for row in rows),
            },
            "prompts": [{"metrics": {"totalLatencyMs": sum(
                row.get("latencyMs") or 0 for row in rows
            )}}],
        }
    }), encoding="utf-8")


def main():
    argv = sys.argv[1:]
    _trace(argv)
    if os.environ.get("FAKE_PROMPTFOO_IGNORE_SIGTERM") == "1":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if argv[:2] == ["auth", "login"]:
        if os.environ.get("FAKE_PROMPTFOO_LOGIN_FAIL") == "1":
            print("Authentication failed")
            return 1
        print("Successfully logged in")
        return 0
    if argv[:2] not in (["redteam", "run"], ["redteam", "eval"]):
        print("Unsupported command")
        return 2
    config_path = Path(_arg(argv, "-c"))
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    tests = [] if os.environ.get("FAKE_PROMPTFOO_ZERO_TESTS") == "1" else _tests(config)
    if argv[:2] == ["redteam", "run"]:
        _write_suite(config, tests, config_path.with_name("redteam.yaml"))
    if not tests:
        print("No test cases generated")
        return int(os.environ.get("FAKE_PROMPTFOO_EXIT_CODE", "0"))
    _evaluate(config, tests)
    exit_code = int(os.environ.get("FAKE_PROMPTFOO_EXIT_CODE", "0"))
    if exit_code not in {0, 100}:
        logs = Path(os.environ["PROMPTFOO_CONFIG_DIR"]) / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        (logs / "promptfoo-error-fake.log").write_text(
            "Synthetic promptfoo failure " + os.environ.get("FAKE_PROMPTFOO_SECRET", ""), encoding="utf-8"
        )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
