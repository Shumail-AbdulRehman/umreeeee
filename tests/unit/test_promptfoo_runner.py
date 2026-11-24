import json
import os
from pathlib import Path
from threading import Event, Thread
import time

from app.red_team.config_builder import build_clone_config, build_redteam_config, subprocess_env
from app.red_team.runner import PromptfooRun


FAKE = Path(__file__).parents[1] / "fixtures" / "fake_promptfoo.py"


def _test():
    return {
        "name": "Runner test",
        "purpose": "Check the assistant against synthetic attacks.",
        "mode": "raw",
        "plugins": ["pii:direct"],
        "strategies": ["base64"],
        "tests_per_plugin": 1,
    }


def _snapshot():
    return {
        "provider": "groq",
        "model": "target-model",
        "integration_name": "Synthetic target",
        "temperature": 0,
        "max_tokens": 32,
        "grader": {"provider": "groq", "model": "grader-model"},
    }


def _env(tmp_path, **extra):
    env = subprocess_env(os.environ, tmp_path, os.sys.executable, Path(__file__).parents[3])
    env.update({key: str(value) for key, value in extra.items()})
    return env


def _run(tmp_path, *, config=None, suite=None, env=None, timeout=10, keep=False, key="CLOUD_KEY"):
    config = config or build_redteam_config(
        _test(), _snapshot(), target_key="TARGET_KEY", grader_key="GRADER_KEY", workspace=tmp_path
    )
    return PromptfooRun(
        FAKE, tmp_path / "workspaces", config,
        cloud_host="https://cloud.invalid", cloud_api_key=key,
        env=env or _env(tmp_path), suite=suite, timeout_seconds=timeout,
        keep_workspace=keep,
    )


def test_first_run_event_order_exact_argv_environment_and_cleanup(tmp_path):
    trace = tmp_path / "trace.jsonl"
    run = _run(tmp_path, env=_env(tmp_path, FAKE_PROMPTFOO_TRACE=trace))
    events = list(run.events())
    assert [event.type for event in events] == [
        "phase", "phase", "suite_ready", "phase", "progress", "phase", "finished"
    ]
    assert [event.phase for event in events if event.type == "phase"] == [
        "logging_in", "generating", "evaluating", "importing"
    ]
    suite = next(event for event in events if event.type == "suite_ready")
    assert suite.test_count == 2
    assert "targets" not in suite.suite and "apiKey" not in json.dumps(suite.suite)
    assert events[-1].status == "completed" and events[-1].exit_code == 0
    records = [json.loads(line) for line in trace.read_text().splitlines()]
    assert records[1]["argv"] == [
        "redteam", "run", "-c", "promptfooconfig.yaml", "--no-progress-bar", "-j", "2"
    ]
    assert "-o" not in records[1]["argv"] and "--remote" not in records[1]["argv"]
    assert records[1]["env"]["PROMPTFOO_CACHE_ENABLED"] == "false"
    assert not run.workspace.exists()


def test_clone_uses_eval_without_generation_and_exit_100_is_completed(tmp_path):
    suite = {
        "tests": [{
            "vars": {"prompt": "Synthetic stored attack"},
            "metadata": {"pluginId": "pii:direct", "strategyId": "basic", "severity": "high"},
            "assert": [{"type": "promptfoo:redteam", "metric": "pii:direct"}],
        }],
        "redteam": {"purpose": "Stored suite"},
        "defaultTest": {"metadata": {}},
    }
    config = build_clone_config(
        _test(), _snapshot(), suite, target_key="TARGET_KEY", grader_key="GRADER_KEY", workspace=tmp_path
    )
    trace = tmp_path / "trace.jsonl"
    run = _run(
        tmp_path, config=config, suite=suite,
        env=_env(tmp_path, FAKE_PROMPTFOO_TRACE=trace, FAKE_PROMPTFOO_EXIT_CODE=100),
    )
    events = list(run.events())
    assert not any(event.type == "suite_ready" for event in events)
    assert [event.phase for event in events if event.type == "phase"] == [
        "logging_in", "evaluating", "importing"
    ]
    assert events[-1].status == "completed" and events[-1].exit_code == 100
    argv = [json.loads(line)["argv"] for line in trace.read_text().splitlines()][1]
    assert argv[:2] == ["redteam", "eval"] and "redteam.yaml" in argv


def test_failure_zero_tests_login_failure_and_redaction(tmp_path):
    zero = _run(tmp_path / "zero", env=_env(tmp_path, FAKE_PROMPTFOO_ZERO_TESTS=1))
    assert list(zero.events())[-1].error_code == "no_tests_generated"

    login = _run(tmp_path / "login", env=_env(tmp_path, FAKE_PROMPTFOO_LOGIN_FAIL=1))
    assert list(login.events())[-1].error_code == "promptfoo_auth_failed"

    failed = _run(
        tmp_path / "failed",
        env=_env(tmp_path, FAKE_PROMPTFOO_EXIT_CODE=1, FAKE_PROMPTFOO_SECRET="TARGET_KEY"),
    )
    event = list(failed.events())[-1]
    assert event.error_code == "promptfoo_failed"
    assert "TARGET_KEY" not in event.output_tail and "[redacted]" in event.output_tail


def test_suite_secret_missing_binary_and_missing_key(tmp_path):
    config = build_redteam_config(
        _test(), _snapshot(), target_key="TARGET_KEY", grader_key="GRADER_KEY", workspace=tmp_path
    )
    config["redteam"]["plugins"][0]["token"] = "HIDDEN"
    run = _run(tmp_path / "secret", config=config)
    assert list(run.events())[-1].error_code == "suite_contains_secret"

    missing = PromptfooRun(tmp_path / "missing", tmp_path, {}, cloud_api_key="x", env=_env(tmp_path))
    assert list(missing.events())[-1].error_code == "promptfoo_unavailable"
    no_key = PromptfooRun(FAKE, tmp_path, {}, cloud_api_key="", env=_env(tmp_path))
    assert list(no_key.events())[-1].error_code == "promptfoo_api_key_missing"


def test_cancel_during_eval_and_timeout_remove_workspace(tmp_path):
    run = _run(tmp_path / "cancel", env=_env(tmp_path, FAKE_PROMPTFOO_DELAY=2))
    events = []
    evaluating = Event()

    def consume():
        for event in run.events():
            events.append(event)
            if event.type == "phase" and event.phase == "evaluating":
                evaluating.set()

    thread = Thread(target=consume)
    thread.start()
    assert evaluating.wait(5)
    run.cancel()
    thread.join(12)
    assert not thread.is_alive()
    assert events[-1].status == "cancelled"
    assert not run.workspace.exists()

    timed = _run(tmp_path / "timeout", env=_env(tmp_path, FAKE_PROMPTFOO_DELAY=2), timeout=.2)
    event = list(timed.events())[-1]
    assert event.status == "failed" and event.error_code == "timeout"
    assert not timed.workspace.exists()
