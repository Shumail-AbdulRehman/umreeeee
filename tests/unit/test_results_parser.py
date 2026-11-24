import json
from pathlib import Path

import pytest

from app.red_team.results_parser import (
    ArtifactParseError,
    SuiteSecretError,
    count_progress,
    count_suite_tests,
    decide,
    parse_results_json,
    sanitize_suite,
    suite_breakdown,
)


FIXTURES = Path(__file__).parents[1] / "fixtures" / "promptfoo"


def _result(**fields):
    row = {"testIdx": 0, "metadata": {"pluginId": "hijacking"}, **fields}
    return parse_results_json(json.dumps({"results": {"results": [row]}})).rows[0]


def test_final_export_preserves_order_repeats_stats_and_verdicts():
    parsed = parse_results_json((FIXTURES / "results.json").read_text(encoding="utf-8"))
    assert [(row.test_idx, row.repeat_index) for row in parsed.rows] == [
        (0, 0), (1, 0), (1, 1), (2, 0), (4, 0), (5, 0), (6, 0),
    ]
    assert parsed.skipped == {"no_metadata": 1}
    assert parsed.stats == {
        "successes": 2, "failures": 5, "errors": 1,
        "tokenUsage": {"prompt": 4, "completion": 2, "total": 6, "numRequests": 1},
        "durationMs": 20,
    }
    assert parsed.total_latency_ms == 12
    assert [decide(row, {"sample-issued"}) for row in parsed.rows] == [
        ("pass", "grader"), ("fail", "grader"), ("error", "none"), ("error", "none"),
        ("pass", "policy"), ("fail", "grader"), ("fail", "grader"),
    ]

    first, multi_turn, error, _, blocked, _, _ = parsed.rows
    assert (first.plugin_id, first.strategy_id, first.severity) == ("hijacking", "basic", "low")
    assert (first.prompt, first.response, first.grader_reason) == (
        "Placeholder input", "Placeholder output", "Placeholder pass",
    )
    assert (first.latency_ms, first.cost, first.score, first.failure_reason) == (12, 0.001, 1, 0)
    assert first.token_usage == {"prompt": 4, "completion": 2, "total": 6, "numRequests": 1}
    assert (first.assert_type, first.assert_metric) == ("promptfoo:redteam:hijacking", "Sample")

    assert (multi_turn.plugin_id, multi_turn.strategy_id, multi_turn.severity) == ("hijacking", "crescendo", "high")
    assert multi_turn.response == '{"message":"Placeholder output"}'
    assert multi_turn.failure_reason == 1
    assert error.response == error.grader_reason == "Placeholder execution error"
    assert error.passed is None
    assert error.score == -1
    assert error.severity == "medium"
    assert all(value is None for value in error.token_usage.values())

    assert (blocked.decision, blocked.protected_run_id) == ("blocked_input", "sample-issued")
    assert blocked.policy_evidence == [{"field": "user_prompt", "outcome": "match"}]
    assert blocked.guardrails == {"flagged": True, "flaggedInput": True, "flaggedOutput": False}
    assert "Placeholder input" not in repr(first)
    assert "Placeholder input" not in repr(parsed)


@pytest.mark.parametrize(
    ("decision", "field", "outcome", "ids", "expected"),
    [
        ("blocked_input", "user_prompt", "match", {"run"}, ("pass", "policy")),
        ("blocked_output", "response_text", "match", {"run"}, ("pass", "policy")),
        ("blocked_input", "system_prompt", "match", {"run"}, ("fail", "grader")),
        ("blocked_input", "user_prompt", "clear", {"run"}, ("fail", "grader")),
        ("blocked_input", "user_prompt", "match", set(), ("fail", "grader")),
        ("allowed", "user_prompt", "match", {"run"}, ("fail", "grader")),
    ],
)
def test_only_issued_non_system_matches_authorize_policy(decision, field, outcome, ids, expected):
    row = _result(
        response={"metadata": {
            "decision": decision, "protected_run_id": "run",
            "policy_evidence": [{"field": field, "outcome": outcome}],
        }},
        gradingResult={"pass": False},
    )
    assert decide(row, ids) == expected


def test_merged_row_metadata_cannot_authorize_policy():
    row = _result(
        metadata={
            "pluginId": "hijacking", "decision": "blocked_input", "protected_run_id": "run",
            "policy_evidence": [{"field": "user_prompt", "outcome": "match"}],
        },
        gradingResult={"pass": False},
    )
    assert decide(row, {"run"}) == ("fail", "grader")


@pytest.mark.parametrize("grade", [None, {"pass": True, "metadata": {"graderError": True}}])
def test_error_precedes_policy_block(grade):
    row = _result(
        response={"metadata": {
            "decision": "blocked_input", "protected_run_id": "run",
            "policy_evidence": [{"field": "user_prompt", "outcome": "match"}],
        }},
        gradingResult=grade,
    )
    assert decide(row, {"run"}) == ("error", "none")


def test_reason_is_capped_for_grades_and_error_rows():
    reason = "é" * 1100
    assert _result(gradingResult={"pass": True, "reason": reason}).grader_reason == "é" * 1000
    assert _result(error=reason).grader_reason == "é" * 1000
    assert _result(error=reason).response == reason


@pytest.mark.parametrize(
    ("text", "diagnostic"),
    [
        ('{"example": "Placeholder private text"', "Invalid result JSON"),
        ('{"results": {"outputs": ["Placeholder private text"]}}', "Invalid final JSON results envelope"),
        ('{"results": {"results": ["Placeholder private text"]}}', "Invalid result row"),
        ('{"results": {"results": [{"testIdx": "Placeholder private text", "metadata": {"pluginId": "x"}}]}}',
         "Invalid index at testIdx"),
        ('{"results": {"results": [{"testIdx": 0, "metadata": {"pluginId": "x"}, "gradingResult": {"pass": 1}}]}}',
         "Invalid gradingResult.pass"),
        ('{"results": {"results": [], "stats": {"durationMs": NaN}}}', "Invalid result JSON"),
    ],
)
def test_malformed_artifacts_have_payload_free_diagnostics(text, diagnostic):
    with pytest.raises(ArtifactParseError) as caught:
        parse_results_json(text)
    assert str(caught.value) == diagnostic


def test_empty_results_keep_missing_statistics_unknown():
    parsed = parse_results_json('{"results": {"results": []}}')
    assert parsed.rows == []
    assert parsed.stats == parsed.skipped == {}
    assert parsed.total_latency_ms is None


def test_progress_counts_only_newline_terminated_rows():
    stream = (FIXTURES / "results.jsonl").read_text(encoding="utf-8")
    assert count_progress(stream + '{"testIdx":') == 8
    assert count_progress('{"testIdx":9}\r\n') == 1
    assert count_progress('{"testIdx":9}') == count_progress("") == 0


def test_sanitize_suite_keeps_tests_and_projects_generation_metadata():
    suite = sanitize_suite((FIXTURES / "suite.yaml").read_text(encoding="utf-8"))
    assert set(suite) == {"tests", "redteam", "defaultTest", "metadata"}
    assert suite["defaultTest"] == {"metadata": {"purpose": "Placeholder purpose", "entities": []}}
    assert suite["metadata"] == {"configHash": "sample-hash"}
    assert suite["redteam"] == {
        "purpose": "Placeholder purpose", "plugins": [{"id": "hijacking"}, {"id": "prompt-extraction"}],
    }
    assert [test["vars"]["prompt"] for test in suite["tests"]] == [
        "Placeholder input A", "Placeholder input B", "Placeholder input C",
    ]
    assert count_suite_tests(suite) == 3
    assert suite_breakdown(suite) == {
        "by_plugin": {"hijacking": 2, "prompt-extraction": 1},
        "by_strategy": {"basic": 2, "crescendo": 1},
    }
    assert "DECOY" not in repr(suite)


@pytest.mark.parametrize("key", [
    "apiKey", "api_key", "API-KEY", "token", "secret", "password", "accessKeyId", "secretAccessKey",
])
def test_sanitizer_rejects_nested_secret_keys(key):
    with pytest.raises(SuiteSecretError, match="Generated suite contains a secret key") as caught:
        sanitize_suite(f"tests: [{{vars: {{sample: [{{{key}: DECOY_VALUE}}]}}}}]")
    assert "DECOY_VALUE" not in str(caught.value)


@pytest.mark.parametrize("suite", [
    "tests: [{provider: {id: example-provider, config: {}}}]",
    "tests: [{options: {provider: {id: example-provider, config: {}}}}]",
])
def test_suite_rejects_configured_test_providers(suite):
    with pytest.raises(SuiteSecretError, match="Generated test contains a provider config"):
        sanitize_suite(suite)


@pytest.mark.parametrize("suite", [
    "tests: [Placeholder private text",
    "tests: !custom [Placeholder private text]",
    "- Placeholder private text",
    "tests: file://placeholder.yaml",
    "tests: [file://placeholder.yaml]",
    "tests: &loop [{vars: *loop}]",
])
def test_suite_rejects_malformed_or_non_inline_tests(suite):
    with pytest.raises(ArtifactParseError) as caught:
        sanitize_suite(suite)
    assert "Placeholder private text" not in str(caught.value)
