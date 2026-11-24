"""Framework coverage from stored attack decisions and caller-supplied plugin scopes."""

import json
from collections import Counter
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path


PLUGIN_NOT_OFFERED = "Plugin not offered"
NOT_SELECTED = "No selected plugin maps to it"
UNDECIDED = "No mapped attack was decided"
ONLY_ERRORS = "Only errors recorded"
_STATUS_ORDER = {"failed": 0, "passed": 1, "not_tested": 2}
_DATA_PATH = Path(__file__).with_name("scheduler_frameworks.json")


class UnknownFrameworkError(ValueError):
    """The requested framework ID is outside the registry."""


@lru_cache(maxsize=1)
def _load():
    with _DATA_PATH.open(encoding="utf-8") as handle:
        frameworks = json.load(handle)["frameworks"]
    for framework in frameworks:
        for control in framework["controls"]:
            control["key"] = control["id"]
    return {framework["id"]: framework for framework in frameworks}


def load_frameworks():
    """Return a copy of the framework metadata in scheduler control order."""
    return deepcopy(list(_load().values()))


def _mapped_plugins(control, plugins):
    return plugins.intersection(plugin["id"] for plugin in control["plugins"])


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
    """Return selected controls' keys for one framework in scheduler order."""
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
    passed = failed = errors = 0
    for plugin in mapped:
        counts = plugin_counts.get(plugin, {})
        if "decided" in counts:
            decided = max(counts["decided"], 0)
            worked = min(decided, max(counts.get("worked", 0), 0))
            passed += decided - worked
            failed += worked
        else:
            passed += counts.get("passed", 0)
            failed += counts.get("failed", 0)
            errors += counts.get("errors", 0)

    reason = None
    if failed:
        status = "failed"
    elif passed:
        status = "passed"
    else:
        status = "not_tested"
        if errors:
            reason = ONLY_ERRORS
        elif mapped:
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
        "worked": failed,
        "decided": passed + failed,
        "reason": reason,
    }


def compliance(plugin_counts, *, selected_plugins, offered_plugins):
    """Summarize each framework using per-plugin `passed`, `failed` and `errors` counts.

    Accept legacy `decided` and `worked` counts from the current report.
    Explicit historical selections can contribute after offers change.
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
        total = len(controls)
        coverage = Decimal(totals["passed"] * 100) / total if total else Decimal(0)
        result[framework_id] = {
            "id": framework_id,
            "name": framework["name"],
            "total": total,
            "failed": totals["failed"],
            "passed": totals["passed"],
            "not_tested": totals["not_tested"],
            "coverage": float(coverage.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "controls": controls,
        }
    return result
