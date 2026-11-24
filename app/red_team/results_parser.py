"""Read final promptfoo results and make generated suites safe to store."""

import json
import math
import re
from collections import Counter
from collections.abc import Set
from dataclasses import dataclass
from typing import NamedTuple

import yaml

from .catalog import PLUGINS
from .risk_scoring import SEVERITIES


_POLICY_BLOCKS = ("blocked_input", "blocked_output")
_SECRET_KEYS = {"apikey", "token", "secret", "password", "accesskeyid", "secretaccesskey"}
_TOKEN_FIELDS = ("prompt", "completion", "total", "numRequests")
_STATS_FIELDS = ("successes", "failures", "errors", "tokenUsage", "durationMs")


class ArtifactParseError(ValueError):
    """An invalid artifact with a diagnostic safe to log."""


class SuiteSecretError(ArtifactParseError):
    """A generated suite would retain a credential or provider configuration."""


@dataclass(frozen=True, repr=False)
class ResultRow:
    test_idx: int
    repeat_index: int
    plugin_id: str | None
    strategy_id: str
    severity: str
    prompt: str | None
    response: str | None
    passed: bool | None
    grader_reason: str | None
    grader_error: bool
    latency_ms: int | float | None
    token_usage: dict[str, int | None]
    cost: int | float | None
    score: int | float
    failure_reason: int | None
    assert_type: str | None
    assert_metric: str | None
    decision: str | None
    protected_run_id: str | None
    policy_evidence: list[dict]
    guardrails: dict[str, bool]


@dataclass(frozen=True, repr=False)
class ParsedResults:
    rows: list[ResultRow]
    stats: dict
    total_latency_ms: int | float | None
    skipped: dict[str, int]


class Verdict(NamedTuple):
    verdict: str
    verdict_source: str


def _reject_json_constant(_value):
    raise ArtifactParseError("Invalid result JSON")


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


def _measurement(value, field, *, integer=False, allow_negative=False):
    if value is None:
        return None
    numeric = type(value) is int or (not integer and type(value) is float and math.isfinite(value))
    if numeric and (allow_negative or value >= 0):
        return value
    raise ArtifactParseError(f"Invalid measurement at {field}")


def _output_text(value):
    if value is None or isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    except (ValueError, RecursionError):
        raise ArtifactParseError("Invalid response output") from None


def _first_assertion(test_case):
    assertions = test_case.get("assert")
    if assertions is None:
        return {}
    if not isinstance(assertions, list):
        raise ArtifactParseError("Invalid testCase.assert")
    return _optional_object(assertions[0], "testCase.assert") if assertions else {}


def _normalize(row, test_case, metadata):
    plugin_id = _optional_text(metadata.get("pluginId"), "pluginId")
    severity = metadata.get("severity")
    if severity not in (*SEVERITIES, "informational"):
        severity = PLUGINS.get(plugin_id, {}).get("severity", "medium")

    grade = _optional_object(row.get("gradingResult"), "gradingResult")
    passed = grade.get("pass")
    if grade and type(passed) is not bool:
        raise ArtifactParseError("Invalid gradingResult.pass")
    grade_metadata = _optional_object(grade.get("metadata"), "gradingResult.metadata")
    response = _optional_object(row.get("response"), "response")
    if grade:
        output = _output_text(response.get("output"))
        reason = _optional_text(grade.get("reason"), "gradingResult.reason")
    else:
        output = reason = _optional_text(row.get("error"), "error")
    score = row.get("score", 0) if grade else -1

    prompt = _optional_object(row.get("prompt"), "prompt")
    token_usage = _optional_object(response.get("tokenUsage"), "response.tokenUsage")
    bridge_metadata = _optional_object(response.get("metadata"), "response.metadata")
    evidence = bridge_metadata.get("policy_evidence")
    guardrails = _optional_object(response.get("guardrails"), "response.guardrails")
    assertion = _first_assertion(test_case)

    return ResultRow(
        test_idx=_index(row.get("testIdx"), "testIdx"),
        repeat_index=_index(row.get("repeatIndex", 0), "repeatIndex"),
        plugin_id=plugin_id,
        strategy_id=_optional_text(metadata.get("strategyId"), "strategyId") or "basic",
        severity=severity,
        prompt=_optional_text(prompt.get("raw"), "prompt.raw"),
        response=output,
        passed=passed,
        grader_reason=reason[:1000] if reason is not None else None,
        grader_error="graderError" in grade_metadata,
        latency_ms=_measurement(row.get("latencyMs"), "latencyMs"),
        token_usage={
            key: _measurement(token_usage.get(key), f"response.tokenUsage.{key}", integer=True)
            for key in _TOKEN_FIELDS
        },
        cost=_measurement(row.get("cost", response.get("cost")), "cost"),
        score=_measurement(score, "score", allow_negative=True),
        failure_reason=_measurement(row.get("failureReason"), "failureReason", integer=True),
        assert_type=_optional_text(assertion.get("type"), "testCase.assert.type"),
        assert_metric=_optional_text(assertion.get("metric"), "testCase.assert.metric"),
        decision=_optional_text(bridge_metadata.get("decision"), "response.metadata.decision"),
        protected_run_id=_optional_text(bridge_metadata.get("protected_run_id"), "response.metadata.protected_run_id"),
        policy_evidence=[rule for rule in evidence if isinstance(rule, dict)] if isinstance(evidence, list) else [],
        guardrails={
            key: guardrails[key]
            for key in ("flagged", "flaggedInput", "flaggedOutput")
            if type(guardrails.get(key)) is bool
        },
    )


def _total_latency(summary):
    prompts = summary.get("prompts")
    if prompts is None or prompts == []:
        return None
    if not isinstance(prompts, list):
        raise ArtifactParseError("Invalid results.prompts")
    prompt = _optional_object(prompts[0], "results.prompts[0]")
    metrics = _optional_object(prompt.get("metrics"), "results.prompts[0].metrics")
    return _measurement(metrics.get("totalLatencyMs"), "totalLatencyMs")


def parse_results_json(text: str) -> ParsedResults:
    """Normalize final evaluation rows in artifact order and retain run statistics."""
    if not isinstance(text, str):
        raise ArtifactParseError("Invalid result JSON type")
    try:
        document = json.loads(text, parse_constant=_reject_json_constant)
    except (ValueError, RecursionError):
        raise ArtifactParseError("Invalid result JSON") from None

    summary = document.get("results") if isinstance(document, dict) else None
    if not isinstance(summary, dict) or not isinstance(summary.get("results"), list):
        raise ArtifactParseError("Invalid final JSON results envelope")

    rows = []
    skipped = Counter()
    for row in summary["results"]:
        if not isinstance(row, dict):
            raise ArtifactParseError("Invalid result row")
        test_case = _optional_object(row.get("testCase"), "testCase")
        metadata = _optional_object(row.get("metadata"), "metadata") or _optional_object(
            test_case.get("metadata"), "testCase.metadata"
        )
        if not metadata:
            skipped["no_metadata"] += 1
            continue
        rows.append(_normalize(row, test_case, metadata))

    stats = _optional_object(summary.get("stats"), "results.stats")
    return ParsedResults(
        rows=rows,
        stats={key: stats[key] for key in _STATS_FIELDS if key in stats},
        total_latency_ms=_total_latency(summary),
        skipped=dict(skipped),
    )


def decide(row: ResultRow, issued_run_ids: Set[str]) -> Verdict:
    """Resolve the verdict from the grade and policy evidence issued for this run."""
    if row.passed is None or row.grader_error:
        return Verdict("error", "none")
    if (
        row.decision in _POLICY_BLOCKS
        and row.protected_run_id
        and row.protected_run_id in issued_run_ids
        and any(
            rule.get("outcome") == "match"
            and isinstance(rule.get("field"), str)
            and rule["field"] not in ("", "system_prompt")
            for rule in row.policy_evidence
        )
    ):
        return Verdict("pass", "policy")
    return Verdict("pass" if row.passed else "fail", "grader")


def count_progress(jsonl_text: str) -> int:
    """Count newline-terminated result rows."""
    return jsonl_text.count("\n")


def _suite_tests(suite):
    tests = suite.get("tests", [])
    if not isinstance(tests, list) or any(not isinstance(test, dict) for test in tests):
        raise ArtifactParseError("Invalid generated suite tests")
    return tests


def _check_suite_values(value, active, checked, *, inside_tests=False):
    if not isinstance(value, (dict, list)):
        if type(value) not in (str, bool, int, float, type(None)):
            raise ArtifactParseError("Invalid generated suite value")
        return

    node = (id(value), inside_tests)
    if node in checked:
        return
    if node in active:
        raise ArtifactParseError("Invalid generated suite alias")
    active.add(node)
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ArtifactParseError("Invalid generated suite key")
            if re.sub(r"[^a-z0-9]", "", key.lower()) in _SECRET_KEYS:
                raise SuiteSecretError("Generated suite contains a secret key")
            if inside_tests and key == "provider" and isinstance(item, dict) and "config" in item:
                raise SuiteSecretError("Generated test contains a provider config")
            _check_suite_values(item, active, checked, inside_tests=inside_tests)
    else:
        for item in value:
            _check_suite_values(item, active, checked, inside_tests=inside_tests)
    active.remove(node)
    checked.add(node)


def sanitize_suite(yaml_text: str) -> dict:
    """Retain the suite data required to replay a completed generation."""
    if not isinstance(yaml_text, str):
        raise ArtifactParseError("Invalid generated suite type")
    try:
        suite = yaml.safe_load(yaml_text)
    except (yaml.YAMLError, ValueError, OverflowError, RecursionError):
        raise ArtifactParseError("Invalid generated suite YAML") from None
    if not isinstance(suite, dict):
        raise ArtifactParseError("Invalid generated suite")

    redteam = _optional_object(suite.get("redteam"), "redteam")
    default_test = _optional_object(suite.get("defaultTest"), "defaultTest")
    metadata = _optional_object(suite.get("metadata"), "metadata")
    sanitized = {
        "tests": _suite_tests(suite),
        "redteam": {key: value for key, value in redteam.items() if key != "provider"},
        "defaultTest": {"metadata": _optional_object(default_test.get("metadata"), "defaultTest.metadata")},
        "metadata": {"configHash": metadata["configHash"]} if "configHash" in metadata else {},
    }
    active, checked = set(), set()
    try:
        for key, value in sanitized.items():
            _check_suite_values(value, active, checked, inside_tests=key == "tests")
    except RecursionError:
        raise ArtifactParseError("Invalid generated suite depth") from None
    return sanitized


def count_suite_tests(suite: dict) -> int:
    """Count the inline tests in a sanitized suite."""
    return len(_suite_tests(suite))


def suite_breakdown(suite: dict) -> dict[str, dict[str, int]]:
    """Count generated tests by plugin and strategy."""
    by_plugin = Counter()
    by_strategy = Counter()
    for test in _suite_tests(suite):
        metadata = _optional_object(test.get("metadata"), "test.metadata")
        plugin = _optional_text(metadata.get("pluginId"), "pluginId")
        strategy = _optional_text(metadata.get("strategyId"), "strategyId") or "basic"
        if plugin:
            by_plugin[plugin] += 1
        by_strategy[strategy] += 1
    return {"by_plugin": dict(by_plugin), "by_strategy": dict(by_strategy)}
