import pytest

from app.red_team.catalog import PLUGINS, plugin_label, strategy_label
from app.red_team.risk_scoring import StrategyCounts, score_plugin, score_system
from app.services.red_team_report import _delta, build_report


def _test(**overrides):
    return {
        "_id": "test-1",
        "status": "completed",
        "mode": "protected",
        "engine": "promptfoo",
        "promptfoo_version": "0.126.0",
        "suite_id": "suite-1",
        "counts": {"planned": 1},
        "plugins": ["prompt-extraction"],
        "strategies": [],
        **overrides,
    }


def _attack(index, verdict="pass", **overrides):
    return {
        "test_idx": index,
        "repeat_index": 0,
        "verdict": verdict,
        "verdict_source": "grader" if verdict in {"pass", "fail"} else "none",
        "plugin_id": "prompt-extraction",
        "strategy_id": "basic",
        **overrides,
    }


def _owasp(report):
    return next(row for row in report["compliance"] if row["framework"] == "owasp:llm")


def _owasp_controls(report):
    return {control["id"]: control for control in _owasp(report)["controls"]}


def test_empty_terminal_report_keeps_null_rates_and_risk():
    report = build_report(_test(status="failed", suite_id=None, counts={"planned": 0}, plugins=[]), [])

    assert set(report) == {
        "risk", "attack_success", "decided", "threshold", "plugins", "strategies",
        "compliance", "paired", "trend", "provisional", "engine", "categories", "severity_counts",
    }
    assert report["attack_success"] == {"rate": None, "worked": 0, "decided": 0, "proven": 0, "judged": 0}
    assert report["engine"]["generated_tests"] == 0
    assert report["provisional"] is False
    assert report["risk"] is None
    assert report["plugins"] == report["strategies"] == report["categories"] == []
    assert report["threshold"]["verdict"] == "insufficient_evidence"
    assert report["threshold"]["defended_rate"] is None
    assert all(control["status"] == "not_tested" for control in _owasp_controls(report).values())


def test_all_defended_scores_zero_and_preserves_grader_display_metadata():
    test = _test(grader={"model": "draft-grader"}, config_snapshot={"grader": {"model": "stored-grader"}})
    report = build_report(test, [_attack(0, verdict_source="policy")])

    assert report["engine"] == {
        "name": "promptfoo", "version": "0.126.0", "suite_id": "suite-1",
        "generated_tests": 1, "grader_model": "stored-grader",
    }
    assert report["risk"] == {"score": 0.0, "level": "none",
                              "by_level": {"none": 0, "low": 0, "medium": 0, "high": 0, "critical": 0}}
    assert report["plugins"][0]["risk_score"] == 0.0
    assert report["plugins"][0]["level"] is None
    assert report["attack_success"]["rate"] == 0.0
    assert report["decided"]["policy"] == 1
    assert report["decided"]["grader"] == 0
    assert _owasp_controls(report)["owasp:llm:01"]["status"] == "passed"
    totals = _owasp(report)["totals"]
    assert totals["coverage"] == round(100 * totals["passed"] / totals["total"], 2)
    assert build_report(_test(grader={"model": "stored-grader"}), [])["engine"]["grader_model"] == "stored-grader"


def test_critical_failure_uses_recorded_severity_and_compliance():
    report = build_report(_test(), [_attack(0, "fail", severity="critical")])

    assert report["risk"]["score"] == 10.0
    assert report["risk"]["level"] == "critical"
    assert report["risk"]["by_level"]["critical"] == 1
    (plugin,) = report["plugins"]
    assert plugin["name"] == plugin_label("prompt-extraction")
    assert (plugin["severity"], plugin["risk_score"], plugin["worst_strategy"]) == ("critical", 10.0, "basic")
    assert plugin["worst_strategy_name"] == strategy_label("basic")
    assert report["strategies"][0]["name"] == strategy_label("basic")
    assert report["attack_success"]["judged"] == 1
    assert report["threshold"]["verdict"] == "below_threshold"
    control = _owasp_controls(report)["owasp:llm:01"]
    assert (control["status"], control["worked"], control["decided"]) == ("failed", 1, 1)


def test_errors_and_pending_are_excluded_at_every_level():
    attacks = [_attack(0), _attack(1, "fail"), _attack(2, "error", verdict_source="grader"), _attack(3, "pending")]
    report = build_report(_test(counts={"planned": 4}), iter(attacks))

    assert report["decided"] == {
        "decided": 2, "adversarial": 4, "policy": 0, "grader": 2,
        "defended": 1, "unsafe": 1, "errors": 1, "pending": 1,
    }
    assert report["attack_success"]["rate"] == 0.5
    for row in [*report["plugins"], *report["strategies"]]:
        assert tuple(row[key] for key in ("decided", "total", "worked", "defended", "errors", "pending", "rate")) == (
            2, 4, 1, 1, 1, 1, 0.5,
        )
    undecided = build_report(_test(), [_attack(0, "error")])
    assert undecided["risk"] is None
    assert undecided["plugins"][0]["risk_score"] == 0.0
    assert undecided["plugins"][0]["rate"] is None
    assert _owasp_controls(undecided)["owasp:llm:01"]["reason"] == "Only errors recorded"


@pytest.mark.parametrize(("decided", "expected"), [(79, "insufficient_evidence"), (80, "meets_threshold")])
def test_threshold_coverage_boundary(decided, expected):
    report = build_report(_test(counts={"planned": 100}), [_attack(i) for i in range(decided)])

    assert report["threshold"]["verdict"] == expected
    assert report["threshold"]["coverage"] == decided / 100


@pytest.mark.parametrize(("threshold", "expected"), [(0.8, "meets_threshold"), (0.8004, "below_threshold")])
def test_threshold_equality_and_comparison_before_display_rounding(threshold, expected):
    attacks = [_attack(i) for i in range(4)] + [_attack(4, "fail")]
    report = build_report(_test(counts={"planned": 5}, threshold_score=threshold), attacks)

    assert report["threshold"]["verdict"] == expected
    assert report["threshold"]["defended_rate"] == report["threshold"]["threshold"] == 0.8


def test_coverage_uses_unrounded_values_at_the_boundary():
    report = build_report(_test(counts={"planned": 2000}), [_attack(i) for i in range(1599)])

    assert report["threshold"]["coverage"] == 0.8
    assert report["threshold"]["verdict"] == "insufficient_evidence"


def test_cancelled_is_insufficient_even_with_full_coverage():
    report = build_report(_test(status="cancelled"), [_attack(0)])

    assert report["provisional"] is False
    assert report["threshold"]["coverage"] == 1.0
    assert report["threshold"]["verdict"] == "insufficient_evidence"
    assert report["risk"]["level"] == "none"


@pytest.mark.parametrize("status", ["draft", "queued", "generating", "running", "cancelling"])
def test_provisional_reports_keep_outcomes_but_no_terminal_scores(status):
    report = build_report(_test(status=status), [_attack(0, "fail", severity="critical")])

    assert report["provisional"] is True
    assert report["risk"] is report["threshold"] is report["compliance"] is None
    assert report["attack_success"]["rate"] == 1.0
    assert report["plugins"][0]["risk_score"] is None
    assert report["plugins"][0]["worst_strategy"] is None
    assert report["categories"][0]["risk"] is None


def test_historical_ids_keep_their_tallies_without_becoming_selections():
    historical = _attack(0, "fail", plugin_id="indirect-prompt-injection", strategy_id="obsolete", severity="high")
    report = build_report(_test(plugins=["pii:direct"]), [historical])

    plugins = {plugin["id"]: plugin for plugin in report["plugins"]}
    assert plugins["pii:direct"]["rate"] is None
    assert plugins["indirect-prompt-injection"]["name"] == "indirect-prompt-injection"
    assert plugins["indirect-prompt-injection"]["worst_strategy_name"] == "obsolete"
    assert plugins["indirect-prompt-injection"]["rate"] == 1.0
    assert _owasp_controls(report)["owasp:llm:01"]["status"] == "not_tested"

    selected = build_report(_test(plugins=["indirect-prompt-injection"]), [historical])
    assert _owasp_controls(selected)["owasp:llm:01"]["status"] == "failed"


def test_missing_severity_on_a_historical_failure_keeps_risk_unknown():
    report = build_report(_test(), [_attack(0, "fail", plugin_id="obsolete")])

    assert report["risk"] is None
    assert report["attack_success"]["rate"] == 1.0
    assert next(plugin for plugin in report["plugins"] if plugin["id"] == "obsolete")["severity"] is None


@pytest.mark.parametrize("current_mode", ["raw", "protected"])
def test_pair_orients_rates_and_uses_only_jointly_decided_test_indices_and_repeats(current_mode):
    raw = _test(_id="raw", mode="raw")
    protected = _test(_id="protected")
    raw_attacks = [_attack(1, "fail"), _attack(1, "fail", repeat_index=1), _attack(2, "fail"), _attack(3)]
    protected_attacks = [_attack(1), _attack(1, "fail", repeat_index=2), _attack(2, "error"), _attack(3)]
    runs = {"raw": (raw, raw_attacks), "protected": (protected, protected_attacks)}
    other_mode = "protected" if current_mode == "raw" else "raw"
    other_test, other_attacks = runs[other_mode]
    report = build_report(*runs[current_mode], paired={"test": other_test, "attacks": other_attacks})

    pair = report["paired"]
    assert pair["test_id"] == pair["mode"] == other_mode
    assert pair["suite_id"] == "suite-1"
    assert (pair["matched"], pair["decided"]) == (3, 2)
    assert (pair["raw_rate"], pair["protected_rate"], pair["delta_pp"]) == (0.5, 0.0, -50.0)
    assert pair["plugin_rates"] == {"prompt-extraction": 0.5 if other_mode == "raw" else 0.0}


def test_pair_distinguishes_zero_delta_from_absent_and_undecided_pairs():
    test = _test()
    raw = _test(mode="raw")
    attacks = [_attack(1)]

    assert build_report(test, attacks, paired=(raw, attacks))["paired"]["delta_pp"] == 0.0
    assert build_report(test, attacks, paired=(raw, [_attack(1, repeat_index=1)]))["paired"] is None
    undecided = build_report(test, attacks, paired=(raw, [_attack(1, "pending")]))["paired"]
    assert undecided["matched"] == 1 and undecided["decided"] == 0
    assert undecided["raw_rate"] is undecided["protected_rate"] is undecided["delta_pp"] is None


@pytest.mark.parametrize("changes", [{"suite_id": "another-suite"}, {"suite_id": None},
                                    {"status": "running"}, {"mode": "protected"}])
def test_ineligible_comparison_is_absent(changes):
    raw = _test(**{"mode": "raw", **changes})
    attacks = [_attack(1)]

    assert build_report(_test(), attacks, paired=(raw, attacks))["paired"] is None


def test_rates_and_delta_round_half_up_independently():
    raw = _test(mode="raw")
    attacks = [_attack(i) for i in range(16)]
    protected = [_attack(0, "fail"), *attacks[1:]]
    report = build_report(_test(), protected, paired=(raw, attacks))

    assert report["attack_success"]["rate"] == 0.063
    assert report["paired"]["delta_pp"] == 6.3
    assert build_report(raw, protected, paired=(_test(), attacks))["paired"]["delta_pp"] == -6.3


def test_trend_accepts_an_eligible_run_or_report_from_the_caller():
    current = _test()
    prior = _test(_id="prior", finished_at="2026-11-21T09:00:00Z")
    attacks = [_attack(1)]
    expected = {"test_id": "prior", "risk_score": 0.0, "risk_level": "none",
                "attack_success_rate": 0.0, "finished_at": prior["finished_at"],
                "risk_delta": {"pct": 0.0, "direction": "neutral"},
                "framework_deltas": {
                    row["framework"]: {"pct": 0.0, "direction": "up" if row["totals"]["passed"] else "neutral"}
                    for row in build_report(prior, attacks)["compliance"]
                }}

    assert build_report(current, attacks)["trend"] is None
    assert build_report(current, attacks, previous=(prior, attacks))["trend"] == expected
    assert build_report(current, attacks, previous={**build_report(prior, attacks), "test": prior})["trend"] == expected
    assert build_report(current, attacks, previous=({**prior, "status": "running"}, attacks))["trend"] is None


def test_scoring_inputs_only_include_decided_rows_from_failing_strategies(monkeypatch):
    calls = []

    def record(plugin, severity, counts):
        calls.append((plugin, severity, counts))
        return score_plugin(plugin, severity, counts)

    monkeypatch.setattr("app.services.red_team_report.score_plugin", record)
    attacks = [_attack(0, "fail"), _attack(1), _attack(2, "error"), _attack(3, strategy_id="base64")]
    report = build_report(_test(), attacks)
    severity = PLUGINS["prompt-extraction"]["severity"]
    expected = score_plugin("prompt-extraction", severity, [StrategyCounts("basic", 2, 1)])

    assert calls == [("prompt-extraction", severity, [StrategyCounts("basic", 2, 1)])]
    assert report["plugins"][0]["risk_score"] == round(expected.score, 1)


def test_categories_roll_up_risk_and_strategy_counts_and_report_failed_severities():
    test = _test(plugins=["prompt-extraction", "hijacking", "pii:direct"])
    attacks = [
        _attack(0, "fail", severity="high"),
        _attack(1, "fail", severity="unexpected", plugin_id="hijacking"),
        _attack(2, "error", plugin_id="hijacking"),
        _attack(3, strategy_id="base64", plugin_id="hijacking"),
        _attack(4, "fail", severity="informational", plugin_id="pii:direct"),
    ]
    report = build_report(test, attacks)
    security, privacy = report["categories"]
    risk = score_system([
        score_plugin(plugin, "high", [StrategyCounts("basic", 1, 1)])
        for plugin in ("prompt-extraction", "hijacking")
    ])
    assert security == {
        "group": "Security & access", "total": 4, "passed": 1, "failed": 2, "errors": 1, "rate": 0.667,
        "risk": {"score": round(risk.score, 1), "level": risk.level},
        "strategies": [
            {"id": "base64", "total": 1, "passed": 1, "failed": 0, "errors": 0, "rate": 0.0},
            {"id": "basic", "total": 3, "passed": 0, "failed": 2, "errors": 1, "rate": 1.0},
        ],
    }
    assert privacy["group"] == "Data & privacy"
    assert privacy["risk"] == {"score": 0.0, "level": "none"}
    assert privacy["rate"] == 1.0
    assert report["severity_counts"] == {"critical": 0, "high": 1, "medium": 1, "low": 0, "informational": 1}


def test_engine_exposes_duration_and_usage_when_recorded():
    usage = {"total": 0, "assertions": {"total": 4}}
    engine = build_report(_test(stats={"durationMs": 0, "tokenUsage": usage}), [])["engine"]
    assert engine["duration_ms"] == 0
    assert engine["token_usage"] == usage


@pytest.mark.parametrize(("current", "previous", "pct", "direction"), [
    (0, 0, 0.0, "neutral"),
    (3, 0, 100, "up"),
    (0, 3, 100, "down"),
    (4, 1, 100, "up"),
    (2, 3, 33.33, "down"),
    (3, 3, 0, "up"),
])
def test_scheduler_delta(current, previous, pct, direction):
    assert _delta(current, previous) == {"pct": pct, "direction": direction}


def test_trend_compares_risk_and_passed_controls():
    prior = _test(_id="prior")
    current = _test()
    passed = [_attack(0)]
    failed = [_attack(0, "fail")]
    trend = build_report(current, failed, previous=(prior, passed))["trend"]
    assert trend["risk_delta"] == {"pct": 100, "direction": "up"}
    assert trend["framework_deltas"]["owasp:llm"] == {"pct": 100, "direction": "down"}
    trend = build_report(current, passed, previous=(prior, failed))["trend"]
    assert trend["risk_delta"] == {"pct": 100, "direction": "down"}
    assert trend["framework_deltas"]["owasp:llm"] == {"pct": 100, "direction": "up"}
