"""Framework mapping and compliance status for Red Team v3 (pure module).

Data lives in ``frameworks.json``. Plugin ids are validated against the eight
fixed ids of spec 00; the cross-check with the real catalog belongs to spec 12.
"""

import json
from functools import lru_cache
from pathlib import Path

PLUGIN_IDS = (
    "prompt-extraction",
    "pii",
    "direct-injection",
    "indirect-injection",
    "tool-injection",
    "hijacking",
    "harmful",
    "excessive-agency",
)
EXPECTED_TOTALS = {"owasp": 10, "atlas": 16, "nist": 21, "eu": 14}
NO_PLUGIN_REASON = "No plugin maps to it"
NOT_SELECTED_REASON = "No selected plugin maps to it"
UNDECIDED_REASON = "No mapped attack was decided"
_STATUS_RANK = {"failed": 0, "passed": 1, "not_tested": 2}
_DATA_PATH = Path(__file__).with_name("frameworks.json")


class FrameworkDataError(ValueError):
    pass


def _validate(data):
    frameworks = data.get("frameworks")
    if not isinstance(frameworks, list):
        raise FrameworkDataError("frameworks must be a list")
    seen = set()
    for framework in frameworks:
        fid = framework.get("id")
        if fid in seen:
            raise FrameworkDataError(f"duplicate framework id {fid}")
        seen.add(fid)
        controls = framework.get("controls") or []
        if fid in EXPECTED_TOTALS and len(controls) != EXPECTED_TOTALS[fid]:
            raise FrameworkDataError(f"{fid} must have {EXPECTED_TOTALS[fid]} controls, found {len(controls)}")
        keys = set()
        for control in controls:
            key = control.get("key")
            if not key or key in keys:
                raise FrameworkDataError(f"{fid}: missing or duplicate control key {key}")
            keys.add(key)
            if not control.get("name"):
                raise FrameworkDataError(f"{fid}/{key}: name is required")
            plugins = control.get("plugins", [])
            if len(set(plugins)) != len(plugins):
                raise FrameworkDataError(f"{fid}/{key}: duplicate plugin ids")
            unknown = [p for p in plugins if p not in PLUGIN_IDS]
            if unknown:
                raise FrameworkDataError(f"{fid}/{key}: unknown plugin ids {unknown}")
    if seen != set(EXPECTED_TOTALS):
        raise FrameworkDataError(f"frameworks must be exactly {sorted(EXPECTED_TOTALS)}")
    return frameworks


@lru_cache(maxsize=1)
def _load():
    with _DATA_PATH.open(encoding="utf-8") as handle:
        return tuple(_validate(json.load(handle)))


def load_frameworks():
    """Return a deep copy of the validated framework data."""
    return json.loads(json.dumps(_load()))


def framework_catalog():
    """Capabilities payload: id, name, total and per-plugin control lists."""
    catalog = []
    for framework in _load():
        by_plugin = {plugin: [] for plugin in PLUGIN_IDS}
        for control in framework["controls"]:
            for plugin in control.get("plugins", []):
                by_plugin[plugin].append(control["key"])
        catalog.append(
            {
                "id": framework["id"],
                "name": framework["name"],
                "total": len(framework["controls"]),
                "controls": [
                    {"key": c["key"], "id": c.get("id"), "name": c["name"], "plugins": list(c.get("plugins", []))}
                    for c in framework["controls"]
                ],
                "plugins": by_plugin,
            }
        )
    return catalog


def covered_controls(selected_plugins, framework_id):
    """Control keys of one framework that at least one selected plugin maps to."""
    selected = set(selected_plugins)
    for framework in _load():
        if framework["id"] == framework_id:
            return [c["key"] for c in framework["controls"] if selected.intersection(c.get("plugins", []))]
    raise KeyError(framework_id)


def _control_status(control, plugin_counts):
    mapped = control.get("plugins", [])
    selected = [p for p in mapped if p in plugin_counts]
    decided = sum(max(int(plugin_counts[p].get("decided", 0)), 0) for p in selected)
    worked = sum(max(int(plugin_counts[p].get("worked", 0)), 0) for p in selected)
    reason = None
    if worked > 0:
        status = "failed"
    elif decided > 0:
        status = "passed"
    else:
        status = "not_tested"
        if control.get("reason_not_testable"):
            reason = control["reason_not_testable"]
        elif not mapped:
            reason = NO_PLUGIN_REASON
        elif not selected:
            reason = NOT_SELECTED_REASON
        else:
            reason = UNDECIDED_REASON
    return {
        "key": control["key"],
        "id": control.get("id"),
        "name": control["name"],
        "status": status,
        "worked": worked,
        "decided": decided,
        "reason": reason,
    }


def compliance(plugin_counts):
    """Control statuses per framework from ``{plugin_id: {"decided": n, "worked": n}}``.

    A plugin present in the mapping counts as selected. Failed if any mapped
    decided attack worked; passed if mapped attacks were decided and none
    worked; otherwise not_tested with a reason. Sorted failed, passed, not
    tested, stable within each group.
    """
    plugin_counts = plugin_counts or {}
    result = {}
    for framework in _load():
        controls = [_control_status(c, plugin_counts) for c in framework["controls"]]
        controls.sort(key=lambda c: _STATUS_RANK[c["status"]])  # sort is stable
        totals = {s: sum(1 for c in controls if c["status"] == s) for s in _STATUS_RANK}
        result[framework["id"]] = {
            "id": framework["id"],
            "name": framework["name"],
            "total": len(controls),
            "failed": totals["failed"],
            "passed": totals["passed"],
            "not_tested": totals["not_tested"],
            "controls": controls,
        }
    return result
