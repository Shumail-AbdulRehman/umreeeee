"""Normalize promptfoo artifacts and resolve verdicts from recorded evidence."""

import json
import math
from dataclasses import dataclass
from typing import NamedTuple

import yaml


_ASSERT_FAILURE = 1
_EXECUTION_ERROR = 2
_POLICY_BLOCKS = ("blocked_input", "blocked_output")


class ArtifactParseError(ValueError):
    """An invalid artifact with a diagnostic safe to log."""


@dataclass(frozen=True, repr=False)
class ResultRow:
    test_idx: int
    repeat_index: int
    plugin_id: str | None
    strategy_id: str
    severity: str | None
    goal: str | None
    prompt: str | None
    output: str | None
    grader_pass: bool | None
    grader_reason: str | None
    error: str | None
    latency_ms: int | float | None
    token_usage: dict[str, int | None]
    cost: int | float | None


class Verdict(NamedTuple):
    verdict: str
    verdict_source: str


def _reject_json_constant(_value):
    raise ArtifactParseError("Invalid result JSON")


def _load_json(payload: str):
    try:
        return json.loads(payload, parse_constant=_reject_json_constant)
    except (ValueError, RecursionError):
        raise ArtifactParseError("Invalid result JSON") from None


def _optional_object(value, field):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ArtifactParseError(f"Invalid object at {field}")
    return value


def _optional_text(value, field):
    if value is not None and not isinstance(value, str):
        raise ArtifactParseError(f"Invalid text at {field}")
    return value


def _index(value, field):
    if type(value) is not int or value < 0:
        raise ArtifactParseError(f"Invalid index at {field}")
    return value


def _measurement(value, field, *, integer=False):
    if value is None:
        return None
    if type(value) is int and value >= 0:
        return value
    if not integer and type(value) is float and math.isfinite(value) and value >= 0:
        return value
    raise ArtifactParseError(f"Invalid measurement at {field}")


def _has_grader_error(grade):
    grades = [grade]
    has_error = False
    while grades:
        component = grades.pop()
        if not isinstance(component, dict):
            raise ArtifactParseError("Invalid grading component")
        metadata = _optional_object(component.get("metadata"), "gradingResult.metadata")
        has_error |= metadata.get("graderError") is True
        children = component.get("componentResults")
        if children is not None:
            if not isinstance(children, list):
                raise ArtifactParseError("Invalid grading components")
            grades.extend(children)
    return has_error


def _execution_error(row, response, grade):
    provider_error = _optional_text(response.get("error"), "response.error")
    row_error = _optional_text(row.get("error"), "error")
    failure = row.get("failureReason")
    if failure is not None and (type(failure) is not int or failure not in (0, _ASSERT_FAILURE, _EXECUTION_ERROR)):
        raise ArtifactParseError("Invalid failureReason")
    grader_error = _has_grader_error(grade)
    if provider_error:
        return "provider_error"
    if grader_error:
        return "grader_error"
    # promptfoo copies the grading reason to error when an assertion fails.
    if failure == _EXECUTION_ERROR or (row_error and failure != _ASSERT_FAILURE):
        return "eval_error"
    return None


def _output_text(value):
    if value is None or isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    except (ValueError, RecursionError):
        raise ArtifactParseError("Invalid response output") from None


def _normalize(row):
    if not isinstance(row, dict):
        raise ArtifactParseError("Invalid result row")
    test_idx = _index(row.get("testIdx"), "testIdx")
    repeat_index = _index(row.get("repeatIndex", 0), "repeatIndex")
    test_case = _optional_object(row.get("testCase"), "testCase")
    metadata = _optional_object(row.get("metadata"), "metadata")
    test_metadata = _optional_object(test_case.get("metadata"), "testCase.metadata")
    response = _optional_object(row.get("response"), "response")
    prompt = _optional_object(row.get("prompt"), "prompt")
    grade = _optional_object(row.get("gradingResult"), "gradingResult")

    def label(key):
        # Generated test metadata takes precedence over the merged response metadata.
        value = test_metadata.get(key)
        return _optional_text(metadata.get(key) if value is None else value, key)

    grader_pass = grade.get("pass")
    if grader_pass is not None and type(grader_pass) is not bool:
        raise ArtifactParseError("Invalid gradingResult.pass")
    reason = _optional_text(grade.get("reason"), "gradingResult.reason")
    error = _execution_error(row, response, grade)

    # Prefer provider usage when present to retain any unknown token counts.
    if response.get("tokenUsage") is not None:
        usage = _optional_object(response["tokenUsage"], "response.tokenUsage")
    else:
        usage = _optional_object(row.get("tokenUsage"), "tokenUsage")
    latency = row.get("latencyMs")
    cost = response.get("cost")
    return ResultRow(
        test_idx=test_idx,
        repeat_index=repeat_index,
        plugin_id=label("pluginId"),
        strategy_id=label("strategyId") or "basic",
        severity=label("severity"),
        goal=label("goal"),
        prompt=_optional_text(prompt.get("raw"), "prompt.raw"),
        output=_output_text(response.get("output")),
        grader_pass=grader_pass,
        grader_reason=reason[:1000] if reason is not None else None,
        error=error,
        latency_ms=_measurement(response.get("latencyMs") if latency is None else latency, "latencyMs"),
        token_usage={key: _measurement(usage.get(key), f"tokenUsage.{key}", integer=True)
                     for key in ("prompt", "completion", "total", "cached")},
        cost=_measurement(row.get("cost") if cost is None else cost, "cost"),
    )


def parse_jsonl_line(line: str) -> ResultRow | None:
    """Parse a newline-terminated row, or return None for an incomplete line."""
    if not isinstance(line, str):
        raise ArtifactParseError("Invalid JSONL line type")
    if not line.endswith("\n"):
        return None
    return _normalize(_load_json(line))


def parse_final_json(payload: str) -> list[ResultRow]:
    """Parse the CLI's final JSON export in artifact order, preserving repeats."""
    if not isinstance(payload, str):
        raise ArtifactParseError("Invalid final JSON type")
    document = _load_json(payload)
    summary = document.get("results") if isinstance(document, dict) else None
    rows = summary.get("results") if isinstance(summary, dict) else None
    if not isinstance(rows, list):
        raise ArtifactParseError("Invalid final JSON results envelope")
    return [_normalize(row) for row in rows]


def _confirmed_policy_block(bridge_record):
    if bridge_record.get("mode") not in (None, "protected"):
        return False
    if bridge_record.get("decision") not in _POLICY_BLOCKS:
        return False
    # Only the protected executor issues these decisions and records rule matches.
    evidence = bridge_record.get("policy_evidence")
    return isinstance(evidence, (list, tuple)) and any(
        isinstance(rule, dict)
        and rule.get("outcome") == "match"
        and isinstance(rule.get("field"), str)
        and rule["field"] not in ("", "system_prompt")
        for rule in evidence
    )


def decide(row: ResultRow | None, bridge_record: dict | None = None) -> Verdict:
    """Choose the verdict using the parsed row and the trusted bridge record."""
    record = bridge_record or {}
    if not isinstance(row, ResultRow) or row.error or record.get("decision") == "error":
        return Verdict("error", "none")
    if _confirmed_policy_block(record):
        return Verdict("pass", "policy")
    if row.grader_pass is True:
        return Verdict("pass", "grader")
    if row.grader_pass is False:
        return Verdict("fail", "grader")
    return Verdict("error", "none")


def count_suite_tests(suite_text: str) -> int:
    """Count inline generated tests without resolving references in the suite."""
    if not isinstance(suite_text, str):
        raise ArtifactParseError("Invalid generated suite type")
    try:
        suite = yaml.safe_load(suite_text)
    except (yaml.YAMLError, ValueError, OverflowError, RecursionError):
        raise ArtifactParseError("Invalid generated suite YAML") from None
    if not isinstance(suite, dict):
        raise ArtifactParseError("Invalid generated suite")
    tests = suite.get("tests", [])
    if not isinstance(tests, list) or any(not isinstance(test, dict) for test in tests):
        raise ArtifactParseError("Invalid generated suite tests")
    return len(tests)
