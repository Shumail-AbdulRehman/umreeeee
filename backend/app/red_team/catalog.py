"""Read-only promptfoo display metadata and target call estimates."""

import json
import re
from pathlib import Path
from types import MappingProxyType

from .risk_scoring import SEVERITIES


PROMPTFOO_VERSION = "0.126.0"
GROUPS = ("Security & access", "Data & privacy", "Trust & safety", "Brand/behaviour")
_CATALOG_PATH = Path(__file__).with_name("promptfoo_catalog.json")
_ID = re.compile(r"[a-z0-9]+(?:[-:][a-z0-9]+)*")
_COMMON_FIELDS = {"id", "name", "description", "remote_only"}
_PLUGIN_FIELDS = _COMMON_FIELDS | {"group", "severity"}
_STRATEGY_FIELDS = _COMMON_FIELDS | {"multi_turn", "cases_per_seed", "target_calls_per_test"}


def _positive_int(value):
    return type(value) is int and value > 0


def _freeze_registry(rows, kind, fields):
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"Catalog must contain a nonempty {kind} list")

    registry = {}
    for row in rows:
        if not isinstance(row, dict) or row.keys() != fields:
            raise ValueError(f"Invalid {kind} metadata fields")
        entry_id = row["id"]
        if not isinstance(entry_id, str) or not _ID.fullmatch(entry_id):
            raise ValueError(f"Invalid {kind} ID")
        if entry_id in registry:
            raise ValueError(f"Duplicate {kind} ID {entry_id}")
        for field in ("name", "description"):
            if not isinstance(row[field], str) or not row[field].strip():
                raise ValueError(f"Invalid {field} for {entry_id}")
        if type(row["remote_only"]) is not bool:
            raise ValueError(f"Invalid remote_only flag for {entry_id}")

        if kind == "plugin":
            if row["group"] not in GROUPS:
                raise ValueError(f"Invalid group for {entry_id}")
            if row["severity"] not in SEVERITIES:
                raise ValueError(f"Invalid severity for {entry_id}")
        else:
            if type(row["multi_turn"]) is not bool:
                raise ValueError(f"Invalid multi_turn flag for {entry_id}")
            for field in ("cases_per_seed", "target_calls_per_test"):
                if not _positive_int(row[field]):
                    raise ValueError(f"Invalid {field} for {entry_id}")

        registry[entry_id] = MappingProxyType(row.copy())
    return MappingProxyType(registry)


def validate_catalog(data):
    """Validate catalog metadata and return immutable plugin and strategy mappings."""
    if not isinstance(data, dict) or data.keys() != {"version", "license", "plugins", "strategies"}:
        raise ValueError("Invalid promptfoo catalog fields")
    if data["version"] != PROMPTFOO_VERSION:
        raise ValueError(f"Expected promptfoo catalog version {PROMPTFOO_VERSION}")
    if not isinstance(data["license"], str) or not data["license"].strip():
        raise ValueError("Missing promptfoo catalog license")
    plugins = _freeze_registry(data["plugins"], "plugin", _PLUGIN_FIELDS)
    strategies = _freeze_registry(data["strategies"], "strategy", _STRATEGY_FIELDS)
    basic = strategies.get("basic")
    if basic is None:
        raise ValueError("Catalog requires the basic strategy")
    if basic["multi_turn"] or basic["remote_only"] or (
        basic["cases_per_seed"], basic["target_calls_per_test"]
    ) != (1, 1):
        raise ValueError("Basic must be a local, single-call baseline")
    return plugins, strategies


with _CATALOG_PATH.open(encoding="utf-8") as handle:
    PLUGINS, STRATEGIES = validate_catalog(json.load(handle))


def plugin_label(plugin_id):
    """Return the display name or preserve an unknown historical ID."""
    entry = PLUGINS.get(plugin_id)
    return entry["name"] if entry else plugin_id


def strategy_label(strategy_id):
    """Return the display name or preserve an unknown historical ID."""
    entry = STRATEGIES.get(strategy_id)
    return entry["name"] if entry else strategy_id


def _selected(ids, registry, kind):
    if isinstance(ids, str):
        raise ValueError(f"Expected a collection of {kind} IDs")
    selected = set()
    for entry_id in ids:
        if not isinstance(entry_id, str):
            raise ValueError(f"Expected string {kind} IDs")
        selected.add(entry_id)
    unknown = selected.difference(registry)
    if unknown:
        raise ValueError(f"Unknown {kind} IDs: {', '.join(sorted(unknown))}")
    return selected


def estimated_target_calls(plugins, strategies, tests_per_plugin):
    """Estimate calls using baseline cases, variant fan-out and calls per case.

    Two plugins with three seeds each and a four-call strategy yield 12 cases
    and 30 target calls. Each seed is budgeted for every selected variant.
    """
    if not _positive_int(tests_per_plugin):
        raise ValueError("tests_per_plugin must be a positive integer")
    selected_plugins = _selected(plugins, PLUGINS, "plugin")
    selected_strategies = _selected(strategies, STRATEGIES, "strategy") | {"basic"}
    calls_per_seed = sum(
        STRATEGIES[strategy_id]["cases_per_seed"] * STRATEGIES[strategy_id]["target_calls_per_test"]
        for strategy_id in selected_strategies
    )
    return len(selected_plugins) * tests_per_plugin * calls_per_seed
