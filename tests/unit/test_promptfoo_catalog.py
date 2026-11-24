import json

import pytest

from app.red_team import catalog


@pytest.fixture
def data():
    return {
        "version": catalog.PROMPTFOO_VERSION,
        "license": "Synthetic fixture",
        "plugins": [
            {"id": plugin_id, "name": "Fixture plugin", "description": "Checks fixture text",
             "group": "Security & access", "severity": "high", "remote_only": False}
            for plugin_id in ("fixture-one", "fixture-two")
        ],
        "strategies": [
            {"id": strategy_id, "name": "Fixture strategy", "description": "Checks fixture text",
             "remote_only": False, "multi_turn": turns > 1, "cases_per_seed": 1,
             "target_calls_per_test": turns}
            for strategy_id, turns in (("basic", 1), ("fixture-single", 1), ("fixture-multi", 4))
        ],
    }


def test_committed_catalog_validates():
    data = json.loads(catalog._CATALOG_PATH.read_text(encoding="utf-8"))
    plugins, strategies = catalog.validate_catalog(data)

    assert plugins == catalog.PLUGINS
    assert strategies == catalog.STRATEGIES
    assert len(plugins) == len(data["plugins"])
    assert len(strategies) == len(data["strategies"])
    assert {row["group"] for row in plugins.values()} == set(catalog.GROUPS)
    assert {row["severity"] for row in plugins.values()} <= set(catalog.SEVERITIES)
    assert "basic" in strategies


@pytest.mark.parametrize("registry", ["plugins", "strategies"])
def test_duplicate_ids_are_rejected(data, registry):
    data[registry].append(data[registry][0].copy())
    with pytest.raises(ValueError, match="Duplicate .* ID"):
        catalog.validate_catalog(data)


@pytest.mark.parametrize(("registry", "field", "value"), [
    ("plugins", "id", "Fixture Invalid ID"),
    ("plugins", "severity", "urgent"),
    ("plugins", "group", "Other"),
    ("plugins", "name", ""),
    ("plugins", "description", None),
    ("plugins", "remote_only", 1),
    ("strategies", "remote_only", "true"),
    ("strategies", "multi_turn", 0),
    ("strategies", "cases_per_seed", 0),
    ("strategies", "target_calls_per_test", True),
])
def test_invalid_metadata_is_rejected(data, registry, field, value):
    data[registry][-1][field] = value
    with pytest.raises(ValueError, match="Invalid"):
        catalog.validate_catalog(data)


def test_missing_basic_is_rejected(data):
    data["strategies"].pop(0)
    with pytest.raises(ValueError, match="requires the basic strategy"):
        catalog.validate_catalog(data)


def test_basic_must_have_one_call_and_case_per_seed(data):
    data["strategies"][0]["target_calls_per_test"] = 4
    with pytest.raises(ValueError, match="Basic must be"):
        catalog.validate_catalog(data)


def test_registries_and_rows_are_immutable(data):
    plugins, strategies = catalog.validate_catalog(data)
    for registry in (plugins, strategies):
        entry_id = next(iter(registry))
        with pytest.raises(TypeError):
            registry[entry_id] = {}
        with pytest.raises(TypeError):
            registry[entry_id]["name"] = "Changed"
    data["plugins"][0]["name"] = "Changed"
    assert plugins["fixture-one"]["name"] == "Fixture plugin"


def test_call_estimate_counts_baseline_once_and_budgets_each_variant(data, monkeypatch):
    plugins, strategies = catalog.validate_catalog(data)
    monkeypatch.setattr(catalog, "PLUGINS", plugins)
    monkeypatch.setattr(catalog, "STRATEGIES", strategies)

    assert catalog.estimated_target_calls(plugins, [], 3) == 6
    assert catalog.estimated_target_calls(plugins, ["basic", "basic"], 3) == 6
    assert catalog.estimated_target_calls(plugins, ["fixture-single", "basic"], 3) == 12
    assert catalog.estimated_target_calls(plugins, ["fixture-multi", "basic"], 3) == 30
    assert strategies["fixture-single"]["cases_per_seed"] == strategies["fixture-multi"]["cases_per_seed"] == 1
    assert catalog.estimated_target_calls(plugins, ["fixture-single", "fixture-multi"], 3) == 36


def test_call_estimate_accounts_for_fan_out(data, monkeypatch):
    data["strategies"][1]["cases_per_seed"] = 5
    plugins, strategies = catalog.validate_catalog(data)
    monkeypatch.setattr(catalog, "PLUGINS", plugins)
    monkeypatch.setattr(catalog, "STRATEGIES", strategies)

    assert catalog.estimated_target_calls(["fixture-one"], ["fixture-single"], 2) == 12


def test_historical_ids_keep_labels_but_are_invalid_selections():
    assert catalog.plugin_label("old-plugin") == "old-plugin"
    assert catalog.strategy_label("old-strategy") == "old-strategy"
    assert catalog.plugin_label("prompt-extraction") == catalog.PLUGINS["prompt-extraction"]["name"]
    assert catalog.strategy_label("basic") == catalog.STRATEGIES["basic"]["name"]
    with pytest.raises(ValueError, match="Unknown plugin IDs: old-plugin"):
        catalog.estimated_target_calls(["old-plugin"], [], 1)
    with pytest.raises(ValueError, match="Unknown strategy IDs: old-strategy"):
        catalog.estimated_target_calls(["prompt-extraction"], ["old-strategy"], 1)


@pytest.mark.parametrize("tests_per_plugin", [0, -1, 1.5, True])
def test_call_estimate_requires_positive_integer_test_count(tests_per_plugin):
    with pytest.raises(ValueError, match="tests_per_plugin"):
        catalog.estimated_target_calls(["prompt-extraction"], [], tests_per_plugin)
