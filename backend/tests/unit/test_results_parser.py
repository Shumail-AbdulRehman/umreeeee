import json
from pathlib import Path

import pytest

from app.red_team.results_parser import (
    ArtifactParseError,
    count_suite_tests,
    decide,
    parse_final_json,
    parse_jsonl_line,
)


FIXTURES = Path(__file__).parents[1] / "fixtures" / "promptfoo"


def _row(**fields):
    return parse_jsonl_line(json.dumps({"testIdx": 8, **fields}) + "\n")


def _block(field="user_prompt", decision="blocked_input", **fields):
    return {
        "decision": decision,
        "policy_evidence": [{"field": field, "outcome": "match"}],
        **fields,
    }


def test_stream_and_final_export_normalize_the_same_rows():
    lines = (FIXTURES / "results.jsonl").read_text(encoding="utf-8").splitlines(keepends=True)
    rows = [parse_jsonl_line(line) for line in lines]
    assert rows == parse_final_json((FIXTURES / "results.json").read_text(encoding="utf-8"))
    assert [(row.test_idx, row.repeat_index) for row in rows] == [(0, 0), (1, 0), (1, 1)]
    assert [decide(row) for row in rows] == [("pass", "grader"), ("fail", "grader"), ("error", "none")]

    first, multi_turn, missing_grade = rows
    assert (first.plugin_id, first.strategy_id, first.severity, first.goal) == (
        "sample-plugin", "basic", "low", "Placeholder goal",
    )
    assert (first.prompt, first.output, first.grader_reason) == (
        "Placeholder input", "Placeholder output", "Placeholder pass",
    )
    assert first.latency_ms == first.cost == 0
    assert first.token_usage == {"prompt": 4, "completion": 0, "total": None, "cached": None}
    assert multi_turn.strategy_id == "crescendo"
    assert multi_turn.error is None
    assert missing_grade.grader_pass is None
    assert missing_grade.latency_ms is missing_grade.cost is None
    assert all(value is None for value in missing_grade.token_usage.values())


def test_metadata_and_row_measurements_fallback():
    row = _row(
        testCase={"metadata": {"pluginId": "sample-plugin"}},
        metadata={"pluginId": "other-label", "strategyId": "goat", "goal": "Placeholder goal"},
        response={"output": {"label": "Placeholder"}, "latencyMs": 12.5},
        tokenUsage={"total": 4, "assertions": {"total": 8}},
        cost=0.001,
        unknown={"path": "Placeholder path"},
    )
    assert (row.plugin_id, row.strategy_id, row.goal) == ("sample-plugin", "goat", "Placeholder goal")
    assert (row.latency_ms, row.token_usage["total"], row.cost) == (12.5, 4, 0.001)
    assert row.output == '{"label":"Placeholder"}'
    assert "assertions" not in row.token_usage
    assert not hasattr(row, "unknown")


@pytest.mark.parametrize(
    ("fields", "error"),
    [
        ({"response": {"error": "Placeholder provider error"}}, "provider_error"),
        ({"failureReason": 2}, "eval_error"),
        ({"error": "Placeholder eval error"}, "eval_error"),
        ({"gradingResult": {"pass": False, "metadata": {"graderError": True}}}, "grader_error"),
        ({"gradingResult": {"pass": True, "componentResults": [
            {"componentResults": [{"metadata": {"graderError": True}}]},
        ]}}, "grader_error"),
    ],
)
def test_execution_errors_override_confirmed_policy_and_grade(fields, error):
    row = _row(**({"gradingResult": {"pass": True}} | fields))
    assert row.error == error
    assert decide(row, _block()) == ("error", "none")


def test_bridge_execution_error_overrides_grade():
    assert decide(_row(gradingResult={"pass": True}), {"decision": "error"}) == ("error", "none")


@pytest.mark.parametrize(("decision", "field"), [("blocked_input", "user_prompt"), ("blocked_output", "response_text")])
def test_confirmed_policy_block_overrides_failed_or_missing_grade(decision, field):
    bridge_record = _block(field, decision, mode="protected")
    for grade in ({"pass": False}, None):
        assert decide(_row(gradingResult=grade), bridge_record) == ("pass", "policy")


@pytest.mark.parametrize(
    "bridge_record",
    [
        _block("system_prompt"),
        _block(None),
        _block(mode="raw"),
        _block(decision="allowed"),
        {"decision": "blocked_input", "policy_evidence": [{"field": "user_prompt", "outcome": "clear"}]},
        {"decision": "blocked_input", "guardrails": {"flagged": True}},
    ],
)
def test_unconfirmed_policy_uses_only_explicit_grade(bridge_record):
    response = {"guardrails": {"flagged": True}}
    assert decide(_row(response=response, gradingResult={"pass": False}), bridge_record) == ("fail", "grader")
    assert decide(_row(response=response, success=True), bridge_record) == ("error", "none")


def test_missing_or_malformed_result_overrides_policy():
    assert decide(None, _block()) == ("error", "none")
    assert decide({}, _block()) == ("error", "none")


def test_partial_jsonl_waits_for_newline():
    assert parse_jsonl_line('{"testIdx":') is None
    assert parse_jsonl_line('{"testIdx":9}') is None
    assert parse_jsonl_line('{"testIdx":9}\r\n').test_idx == 9


@pytest.mark.parametrize(
    ("line", "diagnostic"),
    [
        ('{"sample": "Placeholder private text"\n', "Invalid result JSON"),
        ('["Placeholder private text"]\n', "Invalid result row"),
        ('{"note": "Placeholder private text"}\n', "Invalid index at testIdx"),
        ('{"testIdx": "Placeholder private text"}\n', "Invalid index at testIdx"),
        ('{"testIdx": true}\n', "Invalid index at testIdx"),
        ('{"testIdx": -1}\n', "Invalid index at testIdx"),
        ('{"testIdx": 0, "repeatIndex": 1.0}\n', "Invalid index at repeatIndex"),
        ('{"testIdx": 0, "repeatIndex": null}\n', "Invalid index at repeatIndex"),
        ('{"testIdx": 0, "gradingResult": {"pass": 1}}\n', "Invalid gradingResult.pass"),
        ('{"testIdx": 0, "latencyMs": NaN}\n', "Invalid result JSON"),
        ('{"testIdx": 0, "cost": 1e999}\n', "Invalid measurement at cost"),
    ],
)
def test_malformed_jsonl_has_payload_free_diagnostic(line, diagnostic):
    with pytest.raises(ArtifactParseError) as caught:
        parse_jsonl_line(line)
    assert str(caught.value) == diagnostic
    if diagnostic == "Invalid result JSON":
        assert caught.value.__suppress_context__


def test_final_json_envelope_and_rows_are_validated():
    assert parse_final_json('{"results": {"results": []}}') == []
    with pytest.raises(ArtifactParseError, match="Invalid final JSON results envelope"):
        parse_final_json('{"results": {"outputs": ["Placeholder private text"]}}')
    with pytest.raises(ArtifactParseError, match="Invalid index at testIdx"):
        parse_final_json('{"results": {"results": [{"testIdx": "Placeholder private text"}]}}')


def test_grader_reason_cap_and_safe_row_representation():
    row = _row(gradingResult={"pass": True, "reason": "é" * 1100}, prompt={"raw": "Placeholder input"})
    assert row.grader_reason == "é" * 1000
    assert "Placeholder input" not in repr(row)


def test_count_generated_inline_suite():
    assert count_suite_tests((FIXTURES / "suite.yaml").read_text(encoding="utf-8")) == 2
    assert count_suite_tests("tests: []") == 0
    assert count_suite_tests("description: Placeholder suite") == 0
    assert count_suite_tests("tests: [{vars: {prompt: 'file://placeholder.txt'}}]") == 1


@pytest.mark.parametrize(
    ("suite", "diagnostic"),
    [
        ("tests: [Placeholder private text", "Invalid generated suite YAML"),
        ("tests: !custom [Placeholder private text]", "Invalid generated suite YAML"),
        ("- Placeholder private text", "Invalid generated suite"),
        ("tests: file://placeholder.yaml", "Invalid generated suite tests"),
        ("tests: ['file://placeholder.yaml']", "Invalid generated suite tests"),
    ],
)
def test_suite_rejects_tags_paths_and_malformed_data(suite, diagnostic):
    with pytest.raises(ArtifactParseError) as caught:
        count_suite_tests(suite)
    assert str(caught.value) == diagnostic
