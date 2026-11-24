"""Build the promptfoo red-team config from a test, ported from the owner's
scheduler `create_yaml`/`format_purpose` (`docs/research/scheduler-reuse.md`).

Pure functions only: no file writes, no subprocess, no clock. Spec 10 writes the
workspace and runs the CLI.
"""

import hashlib
import json
from pathlib import Path

import yaml

from app.red_team.catalog import PLUGINS, PROMPTFOO_VERSION
from app.red_team.runtime_paths import BRIDGE_PROVIDER


_DEFAULT_CLOUD_HOST = "https://www.promptfoo.app"
_DEEPSEEK_BASE = "https://api.deepseek.com/v1"

# CI-style variables that replace the Cloud API key with a placeholder, and the
# scheduler's own remote-generation variables, are dropped from the subprocess.
_DROP_ENV = (
    "OPENAI_API_KEY",
    "CI",
    "GITHUB_ACTIONS",
    "BUILD_NUMBER",
    "PROMPTFOO_DISABLE_REMOTE_GENERATION",
    "PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION",
    "PROMPTFOO_REMOTE_GENERATION_URL",
    "PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT",
)
_REDACTED = "***"


class ConfigBuilderError(ValueError):
    """A typed error the service turns into a 4xx response."""

    def __init__(self, code, message=None):
        self.code = code
        super().__init__(message or code)


def provider_id(provider, model):
    """Map an organization provider + model to a promptfoo built-in provider id."""
    if provider == "groq":
        return f"groq:{model}"
    if provider == "openai":
        return f"openai:chat:{model}"
    if provider == "deepseek":
        return f"openai:chat:{model}"
    if provider == "anthropic":
        return f"anthropic:messages:{model}"
    if provider == "gemini":
        return f"google:{model}"
    if provider == "ollama":
        return f"ollama:chat:{model}"
    raise ConfigBuilderError("unsupported_provider", f"Unsupported provider: {provider}")


def provider_config(integration, model, api_key, settings=None):
    """Return a promptfoo provider entry with the key only inside `config`."""
    provider = integration.get("provider")
    settings = settings or {}
    config = {}
    if api_key:
        config["apiKey"] = api_key
    if provider == "deepseek":
        config["apiBaseUrl"] = integration.get("base_url") or _DEEPSEEK_BASE
    elif provider == "ollama":
        base = integration.get("base_url")
        if base:
            config["apiBaseUrl"] = base
    temperature = settings.get("temperature")
    if temperature is not None:
        config["temperature"] = temperature
    max_tokens = settings.get("max_tokens")
    if max_tokens is not None:
        config["max_tokens"] = max_tokens
    entry = {"id": provider_id(provider, model)}
    if config:
        entry["config"] = config
    return entry


def format_purpose(purpose):
    """Port of the scheduler's `format_purpose`: a dict becomes titled fenced
    blocks; a string is used as is."""
    if isinstance(purpose, dict):
        lines = []
        for key, value in purpose.items():
            label = key.replace("_", " ").title()
            lines.extend([f"{label}:", "```", str(value), "```", ""])
        return "\n".join(lines).rstrip()
    return str(purpose)


def _grader_provider(snapshot, grader_key):
    grader = snapshot.get("grader") or {}
    integration = {"provider": grader.get("provider"), "base_url": grader.get("base_url")}
    return provider_config(integration, grader.get("model"), grader_key)


def _raw_target(snapshot, target_key):
    integration = {
        "provider": snapshot.get("provider"),
        "base_url": snapshot.get("base_url"),
    }
    settings = {
        "temperature": snapshot.get("temperature"),
        "max_tokens": snapshot.get("max_tokens"),
    }
    entry = provider_config(integration, snapshot.get("model"), target_key, settings)
    name = snapshot.get("integration_name") or snapshot.get("provider") or "target"
    entry["label"] = f"{name} · {snapshot.get('model')} · raw"
    entry["delay"] = 0
    return entry


def _protected_target(bridge):
    if not bridge:
        raise ConfigBuilderError("bridge_required", "Protected mode needs a bridge")
    return {
        "id": f"file://{BRIDGE_PROVIDER}",
        "label": "policy pipeline · protected",
        "config": {
            "url": bridge["url"],
            "token": bridge["token"],
            "run_id": bridge["run_id"],
            "timeout_seconds": 330,
            "workers": 2,
        },
    }


def _prompts(test, snapshot):
    if test.get("mode") == "raw":
        system = (snapshot.get("system_instruction") or "").strip()
        if system:
            return [json.dumps([
                {"role": "system", "content": system},
                {"role": "user", "content": "{{prompt}}"},
            ])]
    return ["{{prompt}}"]


def _redteam_block(test):
    plugins = []
    for plugin_id in test.get("plugins") or ():
        entry = {"id": plugin_id, "numTests": test.get("tests_per_plugin")}
        severity = (PLUGINS.get(plugin_id) or {}).get("severity")
        if severity:
            entry["severity"] = severity
        plugins.append(entry)
    strategies = [{"id": s} for s in (test.get("strategies") or ()) if s != "basic"]
    block = {
        "purpose": format_purpose(test.get("purpose")),
        "numTests": test.get("tests_per_plugin"),
        "maxConcurrency": 2,
        "injectVar": "prompt",
        "plugins": plugins,
    }
    if strategies:
        block["strategies"] = strategies
    return block


def _base_config(test, snapshot, *, target_key, grader_key, workspace, bridge):
    if test.get("mode") == "protected":
        target = _protected_target(bridge)
    else:
        target = _raw_target(snapshot, target_key)
    return {
        "description": test.get("name"),
        "sharing": False,
        "prompts": _prompts(test, snapshot),
        "targets": [target],
        "redteam": _redteam_block(test),
        "defaultTest": {
            "vars": {},
            "options": {
                "transformVars": "{ ...vars, sessionId: context.uuid }",
                "provider": _grader_provider(snapshot, grader_key),
            },
        },
        "outputPath": [
            str(Path(workspace) / "results.jsonl"),
            str(Path(workspace) / "results.json"),
        ],
    }


def build_redteam_config(test, snapshot, *, target_key, grader_key, workspace, bridge=None):
    """The config for a first run (`promptfoo redteam run`)."""
    return _base_config(
        test, snapshot, target_key=target_key, grader_key=grader_key,
        workspace=workspace, bridge=bridge,
    )


def build_clone_config(test, snapshot, suite, *, target_key, grader_key, workspace, bridge=None):
    """The config for a clone: the stored sanitized suite's tests, evaluated
    without generation (`promptfoo redteam eval`)."""
    config = _base_config(
        test, snapshot, target_key=target_key, grader_key=grader_key,
        workspace=workspace, bridge=bridge,
    )
    suite = suite or {}
    config["tests"] = suite.get("tests") or []
    suite_redteam = suite.get("redteam")
    if isinstance(suite_redteam, dict):
        config["redteam"] = {**config["redteam"], **suite_redteam}
    metadata = (suite.get("defaultTest") or {}).get("metadata")
    if isinstance(metadata, dict):
        config["defaultTest"]["metadata"] = metadata
    return config


class _BlockDumper(yaml.SafeDumper):
    pass


def _str_representer(dumper, data):
    style = "|" if "\n" in data else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_BlockDumper.add_representer(str, _str_representer)


def to_yaml(config):
    """Serialise, preserving insertion order and multi-line literal blocks."""
    return yaml.dump(config, Dumper=_BlockDumper, default_flow_style=False,
                     sort_keys=False, width=4096, allow_unicode=True)


def redact(config):
    """A deep copy with every token/apiKey/url replaced for logs and exports."""
    secret_keys = {"apiKey", "api_key", "token", "secret", "password",
                   "accessKeyId", "secretAccessKey", "url", "run_id", "apiBaseUrl"}

    def walk(value):
        if isinstance(value, dict):
            return {k: (_REDACTED if k in secret_keys and v else walk(v))
                    for k, v in value.items()}
        if isinstance(value, list):
            return [walk(item) for item in value]
        return value

    return walk(config)


def config_preview(test, snapshot_or_draft, *, suite=None):
    """The redacted YAML the editor shows: no keys, tokens, bridge URL or paths."""
    snapshot = snapshot_or_draft or {}
    options = {
        "target_key": None, "grader_key": None, "workspace": "<workspace>",
        "bridge": {"url": _REDACTED, "token": _REDACTED, "run_id": _REDACTED},
    }
    if suite is None:
        config = build_redteam_config(test, snapshot, **options)
        heading = ""
    else:
        config = build_clone_config(test, snapshot, suite, **options)
        count = len(config.pop("tests"))
        noun = "case" if count == 1 else "cases"
        heading = f"# Reuses {count} stored test {noun} (case content omitted).\n"
    if test.get("mode") == "protected":
        config["targets"][0]["id"] = "file://<workspace>/promptfoo_bridge/provider.py"
    return heading + to_yaml(redact(config))


def cloud_login_args(host, api_key):
    """Argument list for `promptfoo auth login`."""
    if not api_key:
        raise ConfigBuilderError("promptfoo_api_key_missing", "Cloud API key is required")
    return ["auth", "login", "--host", host or _DEFAULT_CLOUD_HOST, "--api-key", api_key]


def cloud_login_redacted(host, api_key):
    """The same argument list with the key masked for logs."""
    return ["auth", "login", "--host", host or _DEFAULT_CLOUD_HOST, "--api-key", _REDACTED]


def subprocess_env(base_env, workspace, python_executable, repo_root, *, backend_root=None):
    """A fresh environment per ARCHITECTURE 'Subprocess environment'."""
    base_env = base_env or {}
    workspace = Path(workspace)
    env = {
        "PATH": base_env.get("PATH", ""),
        "HOME": base_env.get("HOME", str(workspace)),
        "LANG": base_env.get("LANG", "C.UTF-8"),
        "PROMPTFOO_CONFIG_DIR": str(workspace / "home"),
        "PROMPTFOO_DISABLE_TELEMETRY": "1",
        "PROMPTFOO_DISABLE_UPDATE": "1",
        "PROMPTFOO_DISABLE_SHARING": "true",
        "PROMPTFOO_CACHE_ENABLED": "false",
        "FORCE_COLOR": "0",
        "PROMPTFOO_PYTHON": str(python_executable),
        "PYTHONPATH": str(backend_root if backend_root is not None else Path(repo_root) / "backend"),
    }
    for name in _DROP_ENV:
        env.pop(name, None)
    return env


def config_hash(test):
    """Stable hash over purpose, plugins with counts, strategies and version;
    independent of target, mode and grader, so a raw test and its clone match."""
    payload = json.dumps({
        "purpose": test.get("purpose"),
        "plugins": sorted((test.get("plugins") or ())),
        "tests_per_plugin": test.get("tests_per_plugin"),
        "strategies": sorted((test.get("strategies") or ())),
        "version": PROMPTFOO_VERSION,
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
