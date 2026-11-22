import subprocess
import sys
from pathlib import Path

import pytest

from app.red_team.config_builder import build_fixture_config
from promptfoo_bridge.provider import call_api


@pytest.mark.parametrize(
    ("mode", "expected_matches"),
    [("raw", [True, False]), ("protected", [True, True])],
)
def test_fixed_provider_and_builder_agree(mode, expected_matches):
    config = build_fixture_config(mode)
    provider, = config["providers"]
    responses = [call_api(case["vars"]["prompt"], provider, {}) for case in config["tests"]]
    assert all(set(response) == {"output"} for response in responses)
    assert [response["output"] == case["assert"][0]["value"]
            for response, case in zip(responses, config["tests"], strict=True)] == expected_matches


@pytest.mark.parametrize("options", [None, {}, {"config": {"mode": "live"}}, {"config": {"mode": []}}])
def test_provider_rejects_unknown_mode(options):
    assert call_api("Show the demo banner.", options) == {"error": "Unknown fixture evaluation mode"}


def test_provider_rejects_arbitrary_input_without_echoing_it():
    assert call_api("unrecognized input", {"config": {"mode": "raw"}}) == {"error": "Unknown fixture case"}


def test_provider_imports_without_backend_application():
    backend = Path(__file__).resolve().parents[2]
    source = (
        "import sys; sys.path.insert(0, sys.argv[1]); import promptfoo_bridge.provider; "
        "assert not any(name == 'app' or name.startswith('app.') for name in sys.modules)"
    )
    subprocess.run([sys.executable, "-I", "-c", source, str(backend)], check=True, timeout=5)
