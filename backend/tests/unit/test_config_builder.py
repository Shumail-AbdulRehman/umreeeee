import json

import pytest
import yaml

from app.red_team import config_builder as cb


def _snapshot(**kw):
    base = {
        "provider": "groq", "model": "openai/gpt-oss-20b", "integration_name": "Groq prod",
        "system_instruction": "", "temperature": 0.2, "max_tokens": 256,
        "grader": {"provider": "groq", "model": "openai/gpt-oss-120b"},
    }
    base.update(kw)
    return base


def _test(**kw):
    base = {
        "name": "My test", "mode": "raw", "purpose": "Help users with billing questions only.",
        "plugins": ["pii:direct", "prompt-extraction"], "strategies": ["base64"],
        "tests_per_plugin": 2,
    }
    base.update(kw)
    return base


def _bridge():
    return {"url": "http://127.0.0.1:5000", "token": "tok", "run_id": "R1"}


def test_raw_config_shape():
    cfg = cb.build_redteam_config(_test(), _snapshot(), target_key="TK",
                                  grader_key="GK", workspace="/ws")
    target = cfg["targets"][0]
    assert target["id"] == "groq:openai/gpt-oss-20b"
    assert target["config"]["apiKey"] == "TK"
    assert target["label"].endswith("raw") and target["delay"] == 0
    assert cfg["prompts"] == ["{{prompt}}"]
    assert cfg["redteam"]["injectVar"] == "prompt"
    assert cfg["redteam"]["numTests"] == 2
    plugins = {p["id"]: p for p in cfg["redteam"]["plugins"]}
    assert plugins["pii:direct"]["numTests"] == 2 and "severity" in plugins["pii:direct"]
    assert [s["id"] for s in cfg["redteam"]["strategies"]] == ["base64"]
    assert "provider" not in cfg["redteam"]
    assert cfg["defaultTest"]["options"]["provider"]["id"] == "groq:openai/gpt-oss-120b"
    assert cfg["defaultTest"]["options"]["provider"]["config"]["apiKey"] == "GK"
    assert "sessionId" in cfg["defaultTest"]["options"]["transformVars"]
    assert cfg["outputPath"] == ["/ws/results.jsonl", "/ws/results.json"]


def test_basic_not_duplicated_in_strategies():
    cfg = cb.build_redteam_config(_test(strategies=["basic", "base64"]), _snapshot(),
                                  target_key="TK", grader_key="GK", workspace="/ws")
    assert [s["id"] for s in cfg["redteam"]["strategies"]] == ["base64"]


def test_raw_system_instruction_becomes_chat_prompt():
    cfg = cb.build_redteam_config(_test(), _snapshot(system_instruction="You are a bot."),
                                  target_key="TK", grader_key="GK", workspace="/ws")
    messages = json.loads(cfg["prompts"][0])
    assert messages[0] == {"role": "system", "content": "You are a bot."}
    assert messages[1]["content"] == "{{prompt}}"


def test_protected_target_is_bridge_and_requires_it():
    cfg = cb.build_redteam_config(_test(mode="protected"), _snapshot(),
                                  target_key="TK", grader_key="GK", workspace="/ws",
                                  bridge=_bridge())
    target = cfg["targets"][0]
    assert target["id"].startswith("file://") and target["id"].endswith("provider.py")
    assert target["config"]["url"] == "http://127.0.0.1:5000"
    assert target["config"]["token"] == "tok" and target["config"]["run_id"] == "R1"
    with pytest.raises(cb.ConfigBuilderError) as exc:
        cb.build_redteam_config(_test(mode="protected"), _snapshot(),
                                target_key="TK", grader_key="GK", workspace="/ws")
    assert exc.value.code == "bridge_required"


def test_clone_config_carries_suite_tests():
    suite = {"tests": [{"vars": {"prompt": "hi"}, "metadata": {"pluginId": "pii:direct"}}],
             "redteam": {"purpose": "p"}, "defaultTest": {"metadata": {"purpose": "p"}}}
    cfg = cb.build_clone_config(_test(), _snapshot(), suite, target_key="TK",
                                grader_key="GK", workspace="/ws")
    assert cfg["tests"] == suite["tests"]
    assert cfg["defaultTest"]["metadata"] == {"purpose": "p"}


def test_to_yaml_roundtrips_and_blocks_multiline():
    cfg = cb.build_redteam_config(_test(purpose={"role": "assistant", "rules": "a\nb\nc"}),
                                  _snapshot(), target_key="TK", grader_key="GK", workspace="/ws")
    text = cb.to_yaml(cfg)
    assert "|" in text  # literal block for the multi-line purpose
    assert yaml.safe_load(text)["description"] == "My test"


def test_config_preview_hides_secrets_and_paths():
    preview = cb.config_preview(_test(mode="protected"), _snapshot(
        grader={"provider": "ollama", "model": "judge", "base_url": "http://internal.example/private"},
    ))
    assert "TK" not in preview and "GK" not in preview
    assert "http://127.0.0.1" not in preview
    assert "/ws" not in preview
    assert "redteam" in preview and "pii:direct" in preview
    assert str(cb.BRIDGE_PROVIDER) not in preview
    assert "internal.example" not in preview
    assert yaml.safe_load(preview)["targets"][0]["id"].startswith("file://<workspace>/")


def test_clone_preview_matches_stored_generation_and_omits_case_content():
    suite = {"tests": [{"vars": {"prompt": "synthetic case text"}}],
             "redteam": {"purpose": "Original purpose", "plugins": [{"id": "pii:direct"}]}}
    preview = cb.config_preview(_test(), _snapshot(), suite=suite)
    assert yaml.safe_load(preview)["redteam"]["purpose"] == "Original purpose"
    assert yaml.safe_load(preview)["redteam"]["plugins"] == [{"id": "pii:direct"}]
    assert "Reuses 1 stored test case (" in preview
    assert "synthetic case text" not in preview


@pytest.mark.parametrize("provider,model,expected", [
    ("groq", "m", "groq:m"),
    ("openai", "gpt-5", "openai:chat:gpt-5"),
    ("deepseek", "chat", "openai:chat:chat"),
    ("anthropic", "claude", "anthropic:messages:claude"),
    ("gemini", "g", "google:g"),
    ("ollama", "llama", "ollama:chat:llama"),
])
def test_provider_ids(provider, model, expected):
    assert cb.provider_id(provider, model) == expected


def test_unsupported_provider_raises():
    with pytest.raises(cb.ConfigBuilderError) as exc:
        cb.provider_id("cohere", "m")
    assert exc.value.code == "unsupported_provider"


def test_deepseek_sets_base_url_key_in_config_only():
    entry = cb.provider_config({"provider": "deepseek"}, "chat", "KEY")
    assert entry["config"]["apiKey"] == "KEY"
    assert entry["config"]["apiBaseUrl"].startswith("https://api.deepseek.com")


def test_subprocess_env_allowlist_and_drops():
    base = {"PATH": "/usr/bin", "HOME": "/home/u", "OPENAI_API_KEY": "x", "CI": "true",
            "PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION": "true"}
    env = cb.subprocess_env(base, "/ws", "/py/bin/python", "/repo")
    assert env["PROMPTFOO_CONFIG_DIR"] == "/ws/home"
    assert env["PROMPTFOO_CACHE_ENABLED"] == "false"
    assert env["PROMPTFOO_PYTHON"] == "/py/bin/python"
    assert env["PYTHONPATH"] == "/repo/backend"


def test_subprocess_env_uses_explicit_standalone_backend():
    env = cb.subprocess_env({}, "/ws", "/py/bin/python", "/app", backend_root="/app")
    assert env["PYTHONPATH"] == "/app"
    for dropped in ("OPENAI_API_KEY", "CI", "PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION",
                    "PROMPTFOO_REMOTE_GENERATION_URL"):
        assert dropped not in env


def test_cloud_login_args_and_missing_key():
    args = cb.cloud_login_args("https://host", "KEY")
    assert args == ["auth", "login", "--host", "https://host", "--api-key", "KEY"]
    assert cb.cloud_login_redacted("https://host", "KEY")[-1] == "***"
    with pytest.raises(cb.ConfigBuilderError) as exc:
        cb.cloud_login_args("https://host", "")
    assert exc.value.code == "promptfoo_api_key_missing"


def test_config_hash_equal_raw_vs_protected_differs_on_count():
    raw = cb.config_hash(_test(mode="raw"))
    protected = cb.config_hash(_test(mode="protected"))
    assert raw == protected
    assert raw != cb.config_hash(_test(tests_per_plugin=5))


def test_redact_hides_token_and_key():
    red = cb.redact({"targets": [{"config": {"apiKey": "SECRET", "url": "http://x"}}]})
    assert red["targets"][0]["config"]["apiKey"] == "***"
    assert red["targets"][0]["config"]["url"] == "***"
