"""Read the pinned promptfoo catalog from static package data."""

import argparse
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE = REPO_ROOT / "node_modules" / "promptfoo"
OUTPUT = REPO_ROOT / "backend" / "app" / "red_team" / "promptfoo_catalog.json"
VERSION = "0.126.0"

PLUGIN_ALLOWLIST = {
    "Security & access": (
        "bfla", "bola", "debug-access", "hijacking", "prompt-extraction", "rbac",
        "shell-injection", "sql-injection", "ssrf", "system-prompt-override",
    ),
    "Data & privacy": ("pii:api-db", "pii:direct", "pii:session", "pii:social"),
    "Trust & safety": (
        "harmful:hate", "harmful:misinformation-disinformation", "harmful:privacy",
        "harmful:self-harm",
    ),
    "Brand/behaviour": (
        "contracts", "excessive-agency", "hallucination", "imitation", "overreliance", "politics",
    ),
}
STRATEGY_ALLOWLIST = (
    "basic", "arabic-presentation-forms", "base64", "camelcase", "emoji", "hex",
    "homoglyph", "leetspeak", "morse", "piglatin", "rot13", "crescendo", "goat",
    "jailbreak:composite", "jailbreak:meta",
)

# These flags and call budgets are defined by the strategy implementations in 0.126.0.
REMOTE_STRATEGIES = {"goat", "jailbreak:composite", "jailbreak:meta"}
TARGET_CALLS_PER_TEST = {"crescendo": 20, "goat": 5, "jailbreak:meta": 10}
SEVERITIES = {"critical", "high", "medium", "low"}

DIST = "dist/src"
TABLES = f"{DIST}/tables-DaSnT9dV.js"
STRATEGIES = f"{DIST}/strategies-BeuvBHPx.js"
REPORT = f"{DIST}/app/assets/index-Cvjh7gqz.js"


def _required_match(pattern, source, label, flags=0):
    match = re.search(pattern, source, flags)
    if match is None:
        raise ValueError(f"Missing or malformed promptfoo metadata for {label}")
    return match[1]


def _constant(source, symbol):
    return _required_match(rf"^const {symbol} = ([^\n]+|[{{\[].*?^[}}\]]);$", source, symbol, re.M | re.S)


def _literal_ids(source):
    return set(re.findall(r'"([a-z0-9:-]+)"', source))


def _members(source, value_pattern):
    return {
        quoted or bare: value
        for quoted, bare, value in re.findall(
            rf'^\t(?:"([a-z0-9:-]+)"|(\w+)): ({value_pattern}),?$', source, re.M
        )
    }


def _report_map(source, start, end):
    body = _required_match(rf"\b{start}=\{{(.*?)\}},{re.escape(end)}=\{{", source, start, re.S)
    return {
        quoted or bare: value
        for quoted, bare, value in re.findall(
            r'(?:^|,)(?:"([a-z0-9:-]+)"|(\w+)):`((?:\\.|[^`\\])*)`(?=,|$)', body, re.S
        )
    }


def _display_metadata(plugin_or_strategy_id, names, descriptions):
    row = {"id": plugin_or_strategy_id}
    for field, values in (("name", names), ("description", descriptions)):
        value = values.get(plugin_or_strategy_id, "")
        if not value.strip() or "${" in value or "\\" in value:
            raise ValueError(f"Missing or invalid {field} for {plugin_or_strategy_id}")
        row[field] = value
    return row


def extract(package=PACKAGE):
    manifest = json.loads((package / "package.json").read_text(encoding="utf-8"))
    if (manifest.get("name"), manifest.get("version")) != ("promptfoo", VERSION):
        raise ValueError(f"Expected installed promptfoo {VERSION}")

    tables = (package / TABLES).read_text(encoding="utf-8")
    report = (package / REPORT).read_text(encoding="utf-8")
    names, descriptions = _report_map(report, "OV", "$"), _report_map(report, "DV", "OV")

    unaligned = _members(_constant(tables, "UNALIGNED_PROVIDER_HARM_PLUGINS"), r'"[^\n]+"')
    harm = _members(_constant(tables, "HARM_PLUGINS"), r'"[^\n]+"')
    aligned = _members(_constant(tables, "REDTEAM_PROVIDER_HARM_PLUGINS"), r'"[^\n]+"')
    plugin_ids = set(unaligned) | harm.keys() | aligned.keys()
    for symbol in ("BASE_PLUGINS", "ADDITIONAL_PLUGINS", "PII_PLUGINS"):
        plugin_ids.update(_literal_ids(_constant(tables, symbol)))
    risk_ids = _literal_ids(_constant(tables, "riskCategories"))
    remote_plugins = _literal_ids(_constant(tables, "REMOTE_ONLY_PLUGIN_IDS")) | unaligned.keys()
    config_required = _literal_ids(_constant(tables, "CONFIG_REQUIRED_PLUGINS"))
    severities = _members(_constant(tables, "Severity"), r'"[a-z]+"')
    plugin_severities = _members(_constant(tables, "riskCategorySeverityMap"), r"Severity\.\w+")

    plugins = []
    for group, ids in PLUGIN_ALLOWLIST.items():
        for plugin_id in ids:
            if plugin_id not in plugin_ids or plugin_id not in risk_ids:
                raise ValueError(f"Unknown promptfoo plugin {plugin_id}")
            if plugin_id in config_required:
                raise ValueError(f"Plugin {plugin_id} requires extra configuration")
            severity_ref = plugin_severities.get(plugin_id, "").removeprefix("Severity.")
            severity = severities.get(severity_ref, "").strip('"')
            if severity not in SEVERITIES:
                raise ValueError(f"Missing or invalid severity for {plugin_id}")
            plugins.append(dict(_display_metadata(plugin_id, names, descriptions), group=group,
                                severity=severity, remote_only=plugin_id in remote_plugins))

    registration = _constant((package / STRATEGIES).read_text(encoding="utf-8"), "Strategies")
    registered = set(re.findall(r'^\t(?:\tid: |createEncodingStrategy\()"([a-z0-9:-]+)"', registration, re.M))
    strategy_ids = _literal_ids(_constant(tables, "DEFAULT_STRATEGIES"))
    strategy_ids |= _literal_ids(_constant(tables, "ADDITIONAL_STRATEGIES"))
    multi_turn = _literal_ids(_constant(tables, "MULTI_TURN_STRATEGIES"))
    fanout = _members(_constant(tables, "DEFAULT_N_FAN_OUT_BY_STRATEGY"), r"\d+")

    strategies = []
    for strategy_id in STRATEGY_ALLOWLIST:
        if strategy_id not in strategy_ids or strategy_id not in registered:
            raise ValueError(f"Unknown promptfoo strategy {strategy_id}")
        cases = int(fanout.get(strategy_id, "1"))
        if cases < 1 or strategy_id == "jailbreak:composite" and strategy_id not in fanout:
            raise ValueError(f"Missing or invalid case count for {strategy_id}")
        strategies.append(dict(_display_metadata(strategy_id, names, descriptions),
                               remote_only=strategy_id in REMOTE_STRATEGIES,
                               multi_turn=strategy_id in multi_turn, cases_per_seed=cases,
                               target_calls_per_test=TARGET_CALLS_PER_TEST.get(strategy_id, 1)))
    for field, rows in (("plugin", plugins), ("strategy", strategies)):
        if len({row["id"] for row in rows}) != len(rows):
            raise ValueError(f"Duplicate {field} ID in the allowlist")

    return {
        "version": VERSION,
        "license": (package / "LICENSE").read_text(encoding="utf-8").strip(),
        "plugins": plugins,
        "strategies": strategies,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare with the committed JSON.")
    args = parser.parse_args()
    try:
        generated = (json.dumps(extract(), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        if args.check:
            if OUTPUT.read_bytes() != generated:
                parser.exit(1, f"{OUTPUT.name} differs from the extracted catalog\n")
            print(f"{OUTPUT.name} matches promptfoo {VERSION} byte-for-byte")
        else:
            OUTPUT.write_bytes(generated)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Could not extract catalog metadata: {exc}\n")


if __name__ == "__main__":
    main()
