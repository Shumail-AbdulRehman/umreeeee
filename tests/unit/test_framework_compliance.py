import hashlib
import json
from pathlib import Path

import pytest

from app.red_team import framework_compliance as fw
from scripts import port_scheduler_frameworks as port


OWASP = "owasp:llm"
FRAMEWORK_COUNTS = [
    ("nist_ai_rmf", 21),
    ("eu:ai-act", 14),
    (OWASP, 10),
    ("owasp:api", 10),
    ("mitre:atlas", 6),
    ("owasp:agentic", 10),
    ("iso:42001", 7),
    ("gdpr", 7),
    ("dod:ai:ethics", 5),
]


def test_port_extracts_only_framework_metadata_and_preserves_order(monkeypatch, tmp_path):
    source = Path(__file__).resolve().parents[1] / "fixtures" / "scheduler_constants_sample.py"
    output = tmp_path / "output.json"
    monkeypatch.setattr(port, "OUTPUT", output)
    monkeypatch.setattr("sys.argv", ["port_scheduler_frameworks.py", str(source)])

    port.main()
    first = output.read_bytes()
    port.main()
    assert output.read_bytes() == first

    data = json.loads(first)
    assert data["source"] == {
        "file": "utils/constants.py",
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "ported_date": port.PORTED_DATE,
    }
    assert data["license_note"] == "owner's scheduler, reused with permission"
    assert b"synthetic-credential-decoy" not in first
    assert [framework["id"] for framework in data["frameworks"]] == ["sample:z", "sample:a"]
    assert data["frameworks"][0] == {
        "id": "sample:z",
        "name": "Framework Z",
        "description": "Sample framework for testing",
        "controls": [{
            "id": "sample:z:control",
            "name": "Sample control",
            "plugins": [{"id": "sample:plugin", "name": "Sample plugin", "severity": "high"}],
        }],
    }


@pytest.mark.parametrize(
    ("source_text", "message"),
    [("FRAMEWORKS = dict()", "must be a literal"), ("OTHER = {}", "assignment is missing")],
)
def test_port_refuses_missing_or_non_literal_assignment(tmp_path, source_text, message):
    source = tmp_path / "constants.py"
    source.write_text(source_text, encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        port.port_frameworks(source)


def test_mapping_preserves_all_frameworks_and_control_ids():
    frameworks = fw.load_frameworks()
    assert [(framework["id"], len(framework["controls"])) for framework in frameworks] == FRAMEWORK_COUNTS
    for framework in frameworks:
        controls = framework["controls"]
        assert len({control["id"] for control in controls}) == len(controls)
        assert all(control["key"] == control["id"] and control["name"] for control in controls)
        for control in controls:
            assert all(plugin.keys() == {"id", "name", "severity"} for plugin in control["plugins"])

    nist, eu, owasp = frameworks[:3]
    assert owasp["controls"][2]["id"] == "owasp:llm:03"
    assert owasp["controls"][2]["plugins"] == []
    assert nist["controls"][0]["id"] == "nist:ai:measure:1.1"
    assert eu["controls"][0]["id"] == "eu:ai-act:art5:subliminal-manipulation"


def test_catalog_indexes_caller_offerings_in_control_order():
    selected = {"hallucination", "prompt-extraction"}
    owasp = next(
        item for item in fw.framework_catalog(selected | {"custom-plugin"}) if item["id"] == OWASP
    )
    assert owasp["total"] == 10
    assert owasp["plugins"] == {
        "custom-plugin": [],
        "hallucination": ["owasp:llm:09"],
        "prompt-extraction": ["owasp:llm:01", "owasp:llm:02", "owasp:llm:07"],
    }
    assert fw.covered_controls(selected, OWASP) == [
        "owasp:llm:01", "owasp:llm:02", "owasp:llm:07", "owasp:llm:09",
    ]


def test_catalog_and_loader_return_independent_copies():
    fw.load_frameworks()[2]["controls"].clear()
    fw.framework_catalog([])[2]["controls"][0]["plugins"][0].clear()
    assert fw.framework_catalog(["ascii-smuggling"])[2]["plugins"]["ascii-smuggling"] == ["owasp:llm:01"]


def owasp_control(control_id, counts, *, selected, offered):
    results = fw.compliance(counts, selected_plugins=selected, offered_plugins=offered)
    return next(control for control in results[OWASP]["controls"] if control["id"] == control_id)


def test_one_mapped_failure_takes_precedence_and_coverage_counts_passed_controls():
    counts = {
        "prompt-extraction": {"passed": 4},
        "ascii-smuggling": {"passed": 1, "failed": 1, "errors": 2},
        "hallucination": {"failed": 6},
    }
    result = fw.compliance(counts, selected_plugins=counts, offered_plugins=counts)[OWASP]
    assert result["failed"] == 2
    assert result["passed"] == 2
    assert result["not_tested"] == 6
    assert result["coverage"] == 20.0
    assert [control["key"] for control in result["controls"][:4]] == [
        "owasp:llm:01", "owasp:llm:09", "owasp:llm:02", "owasp:llm:07",
    ]
    first = result["controls"][0]
    assert (first["status"], first["decided"], first["worked"], first["reason"]) == (
        "failed", 6, 1, None,
    )


def test_passed_beats_errors_and_unselected_counts_are_ignored():
    counts = {
        "prompt-extraction": {"passed": 2, "errors": 4},
        "ascii-smuggling": {"errors": 2},
        "indirect-prompt-injection": {"failed": 3},
        "hallucination": {"failed": 3},
    }
    control = owasp_control(
        "owasp:llm:01", counts, selected=["prompt-extraction", "ascii-smuggling", "hallucination"],
        offered=counts,
    )
    assert (control["status"], control["decided"], control["worked"], control["reason"]) == (
        "passed", 2, 0, None,
    )


@pytest.mark.parametrize(
    ("control", "selected", "offered", "reason"),
    [
        ("03", [], [], "Plugin not offered"),
        ("01", ["hallucination"], ["hallucination"], "Plugin not offered"),
        ("01", [], ["ascii-smuggling"], "No selected plugin maps to it"),
        ("01", ["ascii-smuggling"], ["ascii-smuggling"], "No mapped attack was decided"),
    ],
)
def test_coverage_gap_reasons(control, selected, offered, reason):
    result = owasp_control(f"owasp:llm:{control}", {}, selected=selected, offered=offered)
    assert (result["status"], result["decided"], result["worked"], result["reason"]) == (
        "not_tested", 0, 0, reason,
    )


def test_only_errors_are_not_tested_with_a_distinct_reason():
    control = owasp_control(
        "owasp:llm:01", {"ascii-smuggling": {"passed": 0, "failed": 0, "errors": 3}},
        selected=["ascii-smuggling"], offered=["ascii-smuggling"],
    )
    assert (control["status"], control["decided"], control["worked"], control["reason"]) == (
        "not_tested", 0, 0, "Only errors recorded",
    )


def test_historical_selection_matches_explicit_scheduler_plugin_ids():
    plugin = "harmful:privacy"
    catalog = fw.framework_catalog([plugin])
    assert catalog[2]["plugins"][plugin] == ["owasp:llm:02", "owasp:llm:07", "owasp:llm:08"]
    control = owasp_control(
        "owasp:llm:02", {plugin: {"failed": 1}}, selected=[plugin], offered=[],
    )
    assert control["status"] == "failed"


def test_legacy_and_new_counts_produce_identical_compliance():
    counts = {
        "prompt-extraction": {"passed": 4, "failed": 0, "errors": 0},
        "ascii-smuggling": {"passed": 1, "failed": 1, "errors": 0},
        "hallucination": {"passed": 0, "failed": 0, "errors": 0},
    }
    legacy = {
        plugin: {"decided": row["passed"] + row["failed"], "worked": row["failed"]}
        for plugin, row in counts.items()
    }
    selection = {"selected_plugins": counts, "offered_plugins": counts}
    assert fw.compliance(counts, **selection) == fw.compliance(legacy, **selection)


def test_coverage_rounds_half_up(monkeypatch):
    controls = [
        {"id": str(index), "key": str(index), "name": "Control", "plugins": []}
        for index in range(32)
    ]
    controls[0]["plugins"] = [{"id": "sample:plugin"}]
    monkeypatch.setattr(fw, "_load", lambda: {"sample": {"name": "Sample", "controls": controls}})
    counts = {"sample:plugin": {"passed": 1}}
    result = fw.compliance(counts, selected_plugins=counts, offered_plugins=counts)
    assert result["sample"]["coverage"] == 3.13


def test_unknown_framework_id_raises_validation_error():
    with pytest.raises(fw.UnknownFrameworkError, match="Unknown framework ID: unknown"):
        fw.covered_controls(["prompt-extraction"], "unknown")
