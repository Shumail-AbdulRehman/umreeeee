"""Framework coverage from stored attack decisions and caller-supplied plugin scopes."""

import json
from collections import Counter
from copy import deepcopy
from functools import lru_cache
from pathlib import Path


PLUGIN_NOT_OFFERED = "Plugin not offered"
NOT_SELECTED = "No selected plugin maps to it"
UNDECIDED = "No mapped attack was decided"
_STATUS_ORDER = {"failed": 0, "passed": 1, "not_tested": 2}
_DATA_PATH = Path(__file__).with_name("promptfoo_frameworks.json")


class UnknownFrameworkError(ValueError):
    """The requested framework ID is outside the registry."""


@lru_cache(maxsize=1)
def _load():
    with _DATA_PATH.open(encoding="utf-8") as handle:
        return {framework["id"]: framework for framework in json.load(handle)["frameworks"]}


def load_frameworks():
    """Return a copy of the framework metadata in upstream control order."""
    return deepcopy(list(_load().values()))


def _mapped_plugins(control, plugins):
    labels = control["plugins"]
    mapped = plugins.intersection(labels)
    if "harmful" in labels:
        # The upstream report expands this collection to concrete harmful IDs in scope.
        mapped.update(plugin for plugin in plugins if plugin.startswith("harmful:"))
    return mapped


def framework_catalog(offered_plugins):
    """Build capabilities with a control-key index for every offered plugin."""
    offered = set(offered_plugins)
    catalog = load_frameworks()
    for framework in catalog:
        controls = framework["controls"]
        by_plugin = {plugin: [] for plugin in sorted(offered)}
        for control in controls:
            for plugin in _mapped_plugins(control, offered):
                by_plugin[plugin].append(control["key"])
        framework.update(total=len(controls), plugins=by_plugin)
    return catalog


def covered_controls(selected_plugins, framework_id):
    """Return selected controls' keys for one framework in upstream order."""
    try:
        framework = _load()[framework_id]
    except KeyError:
        raise UnknownFrameworkError(f"Unknown framework ID: {framework_id}") from None
    selected = set(selected_plugins)
    return [
        control["key"] for control in framework["controls"]
        if _mapped_plugins(control, selected)
    ]


def _control_status(control, plugin_counts, selected, offered):
    mapped = _mapped_plugins(control, selected)
    decided = worked = 0
    for plugin in mapped:
        counts = plugin_counts.get(plugin, {})
        plugin_decided = max(counts.get("decided", 0), 0)
        decided += plugin_decided
        worked += min(plugin_decided, max(counts.get("worked", 0), 0))

    reason = None
    if worked:
        status = "failed"
    elif decided:
        status = "passed"
    else:
        status = "not_tested"
        if mapped:
            reason = UNDECIDED
        elif _mapped_plugins(control, offered):
            reason = NOT_SELECTED
        else:
            reason = PLUGIN_NOT_OFFERED
    return {
        "key": control["key"],
        "id": control["id"],
        "name": control["name"],
        "status": status,
        "worked": worked,
        "decided": decided,
        "reason": reason,
    }


def compliance(plugin_counts, *, selected_plugins, offered_plugins):
    """Summarize each framework using per-plugin `decided` and `worked` counts.

    Only selected plugin results contribute. Historical selections can still
    contribute when the current offer changes. An attack that worked is a
    failed defense. Errors and pending rows stay outside the decided count.
    """
    selected = set(selected_plugins)
    offered = set(offered_plugins)
    result = {}
    for framework_id, framework in _load().items():
        controls = [
            _control_status(control, plugin_counts, selected, offered)
            for control in framework["controls"]
        ]
        controls.sort(key=lambda control: _STATUS_ORDER[control["status"]])
        totals = Counter(control["status"] for control in controls)
        result[framework_id] = {
            "id": framework_id,
            "name": framework["name"],
            "total": len(controls),
            "failed": totals["failed"],
            "passed": totals["passed"],
            "not_tested": totals["not_tested"],
            "controls": controls,
        }
    return result
