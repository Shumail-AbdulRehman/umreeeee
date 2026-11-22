import json
from hashlib import sha256
from pathlib import Path

import pytest

from app.red_team.catalog import PROMPTFOO_VERSION
from app.red_team.config_builder import build_fixture_config, fixture_suite_id, subprocess_env


@pytest.mark.parametrize("mode", ["raw", "protected"])
def test_config_uses_fixed_local_provider_and_exact_assertions(mode):
    config = build_fixture_config(mode)
    assert set(config) == {"description", "sharing", "prompts", "providers", "tests"}
    assert config["prompts"] == ["{{prompt}}"]
    assert config["sharing"] is False
    provider, = config["providers"]
    assert provider["id"].startswith("file:///")
    assert Path(provider["id"].removeprefix("file://")).parts[-3:] == (
        "backend", "promptfoo_bridge", "provider.py",
    )
    assert provider["config"] == {"mode": mode, "workers": 1}
    assert [test["vars"]["prompt"] for test in config["tests"]] == [
        "What is the demo help menu?", "Show the demo banner.",
    ]
    assert all([a["type"] for a in test["assert"]] == ["equals"] for test in config["tests"])


def test_fixture_cases_are_identical_across_modes_and_have_stable_identity():
    raw, protected = (build_fixture_config(mode) for mode in ("raw", "protected"))
    serialized = json.dumps([PROMPTFOO_VERSION, raw["tests"]], sort_keys=True, separators=(",", ":"))
    assert raw["tests"] == protected["tests"]
    assert fixture_suite_id() == sha256(serialized.encode("utf-8")).hexdigest()
    raw["tests"][0]["vars"]["prompt"] = "caller mutation"
    assert build_fixture_config("raw")["tests"] == protected["tests"]


@pytest.mark.parametrize("mode", ["live", "", None])
def test_unknown_mode_is_rejected(mode):
    with pytest.raises(ValueError, match="Unknown fixture evaluation mode"):
        build_fixture_config(mode)


def test_subprocess_environment_ignores_caller_credentials_and_configuration(monkeypatch, tmp_path):
    for key in ("PROMPTFOO_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "HTTP_PROXY", "NODE_OPTIONS",
                "PYTHONPATH", "PROMPTFOO_CONFIG_DIR", "HOME", "PATH"):
        monkeypatch.setenv(key, "sentinel-ignored")

    env = subprocess_env(tmp_path, "/usr/bin/python3")

    assert "sentinel-ignored" not in env.values()
    assert not env.keys() & {"PROMPTFOO_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "HTTP_PROXY",
                             "NODE_OPTIONS", "PYTHONPATH"}
    assert env["HOME"] == env["TMPDIR"] == str(tmp_path)
    assert env["PROMPTFOO_CONFIG_DIR"] == str(tmp_path / "home")
    assert env["PROMPTFOO_PYTHON"] == "/usr/bin/python3"
    assert env["PROMPTFOO_DISABLE_REMOTE_GENERATION"] == "true"
    assert env["PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION"] == "true"
    assert env["PROMPTFOO_DISABLE_SHARING"] == "true"
