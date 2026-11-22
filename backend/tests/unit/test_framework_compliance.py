import pytest

from app.red_team import framework_compliance as fw


def test_mapping_preserves_frameworks_and_upstream_control_ids():
    frameworks = fw.load_frameworks()
    assert {framework["id"]: len(framework["controls"]) for framework in frameworks} == {
        "owasp": 10, "nist": 21, "atlas": 16, "eu": 14,
    }
    for framework in frameworks:
        controls = framework["controls"]
        assert len({control["id"] for control in controls}) == len(controls)
        assert len({control["key"] for control in controls}) == len(controls)
        assert all(control["id"].startswith(framework["promptfoo_id"] + ":") for control in controls)
        assert all(control["name"] for control in controls)
        assert all(len(set(control["plugins"])) == len(control["plugins"]) for control in controls)

    owasp, nist, atlas, eu = frameworks
    assert owasp["controls"][2] == {
        "id": "owasp:llm:03", "key": "llm03", "name": "Supply Chain", "plugins": [],
    }
    assert nist["controls"][0]["id"] == "nist:ai:measure:1.1"
    assert atlas["controls"][0]["id"] == "mitre:atlas:ai-attack-staging"
    assert "excessive-agency" in atlas["controls"][0]["plugins"]
    assert eu["controls"][6]["id"] == "eu:ai-act:annex3:biometric-id"


def test_catalog_indexes_caller_offerings_in_control_order():
    owasp = fw.framework_catalog({"hallucination", "prompt-extraction", "custom-plugin"})[0]
    assert owasp["total"] == 10
    assert owasp["plugins"] == {
        "custom-plugin": [],
        "hallucination": ["llm09"],
        "prompt-extraction": ["llm01", "llm02", "llm07"],
    }
    assert fw.covered_controls({"hallucination", "prompt-extraction"}, "owasp") == [
        "llm01", "llm02", "llm07", "llm09",
    ]


def test_catalog_and_loader_return_independent_copies():
    fw.load_frameworks()[0]["controls"].clear()
    fw.framework_catalog([])[0]["controls"][0]["plugins"].clear()
    assert fw.framework_catalog(["ascii-smuggling"])[0]["plugins"]["ascii-smuggling"] == [
        "llm01",
    ]


def owasp_control(key, counts, *, selected, offered):
    results = fw.compliance(counts, selected_plugins=selected, offered_plugins=offered)
    return next(control for control in results["owasp"]["controls"] if control["key"] == key)


def test_one_mapped_failure_takes_precedence_over_defended_decisions():
    counts = {
        "prompt-extraction": {"decided": 4, "worked": 0},
        "ascii-smuggling": {"decided": 2, "worked": 1},
        "hallucination": {"decided": 6, "worked": 6},
    }
    result = fw.compliance(counts, selected_plugins=counts, offered_plugins=counts)["owasp"]
    assert result["failed"] == 2
    assert result["passed"] == 2
    assert result["not_tested"] == 6
    assert [control["key"] for control in result["controls"][:4]] == [
        "llm01", "llm09", "llm02", "llm07",
    ]
    first = result["controls"][0]
    assert (first["status"], first["decided"], first["worked"], first["reason"]) == (
        "failed", 6, 1, None,
    )


def test_all_decided_attacks_defended_with_errors_pending_and_out_of_scope_counts():
    counts = {
        "prompt-extraction": {"decided": 2, "worked": 0, "error": 4},
        "ascii-smuggling": {"error": 2, "pending": 1},
        "indirect-prompt-injection": {"decided": 3, "worked": 3},
        "hallucination": {"decided": 3, "worked": 3},
    }
    control = owasp_control(
        "llm01", counts, selected=["prompt-extraction", "ascii-smuggling", "hallucination"],
        offered=counts,
    )
    assert (control["status"], control["decided"], control["worked"], control["reason"]) == (
        "passed", 2, 0, None,
    )


@pytest.mark.parametrize(
    ("key", "selected", "offered", "reason"),
    [
        ("llm03", [], [], "Plugin not offered"),
        ("llm01", ["hallucination"], ["hallucination"], "Plugin not offered"),
        ("llm01", [], ["ascii-smuggling"], "No selected plugin maps to it"),
        ("llm01", ["ascii-smuggling"], ["ascii-smuggling"], "No mapped attack was decided"),
    ],
)
def test_coverage_gap_reasons(key, selected, offered, reason):
    control = owasp_control(key, {}, selected=selected, offered=offered)
    assert (control["status"], control["decided"], control["worked"], control["reason"]) == (
        "not_tested", 0, 0, reason,
    )


def test_no_decisions_stays_not_tested_with_only_errors():
    control = owasp_control(
        "llm01",
        {"ascii-smuggling": {"decided": 0, "worked": 1, "error": 3}},
        selected=["ascii-smuggling"],
        offered=["ascii-smuggling"],
    )
    assert control["status"] == "not_tested"
    assert control["reason"] == "No mapped attack was decided"
    assert control["worked"] == 0


def test_harmful_collection_maps_concrete_historical_selection():
    plugin = "harmful:privacy"
    catalog = fw.framework_catalog([plugin])
    assert catalog[0]["plugins"][plugin] == ["llm01", "llm02", "llm07", "llm08"]
    control = owasp_control(
        "llm01", {plugin: {"decided": 1, "worked": 1}}, selected=[plugin], offered=[],
    )
    assert control["status"] == "failed"


def test_unknown_framework_id_raises_validation_error():
    with pytest.raises(fw.UnknownFrameworkError, match="Unknown framework ID: unknown"):
        fw.covered_controls(["prompt-extraction"], "unknown")
