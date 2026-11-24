# FYP testing migration and manual verification

This guide covers the current migration status and a repeatable check of the parser, scoring, compliance, and report UI using saved synthetic fixtures. The checks run without a model account, a MongoDB connection, or a queue worker.

## 1. Check what is already in the project

Run these commands from the repository root.

```bash
git branch --show-current
git status --short
git log -12 --oneline
python3 .ai/plan-project/scripts/validate-specs.py specs-promptfoo
```

The spec validator reported **22 specs, 0 errors, and 70 non-blocking warnings** on 2026-11-23. Warnings include missing issue references and legacy paths intentionally listed for removal. The validator checks the spec documents. Functional evidence comes from the tests below.

| Status | Specs | Evidence |
| --- | --- | --- |
| Marked done | 00–20 | Status and implementation logs in the [tracker](../../../specs-promptfoo/PROGRESS.md) and individual specs |
| Final verification pending | 21 | Automated Mongo and Chromium acceptance passed; clean-install repetition and the live paired RabbitMQ/API smoke remain. |

All product implementation specs are done. One tracker row remains `In progress` because a fresh-install pass and the live RabbitMQ-backed smoke were unavailable; see the spec 21 inventory.

## 2. Identify the scheduler reference

The reference folder is `/home/shumail/Downloads/scheduler_umr/scheduler_umr`. The folder and the files below were readable when checked. Keep the original scheduler read-only.

| Reference file | Related specs |
| --- | --- |
| `job_scheduler.py` | 04 config builder, 10 runner, 17 worker |
| `utils/runner.py` | 05 parser and 06 report aggregation |
| `utils/constants.py` | 03 framework definitions |
| `utils/risk_scoring.py` | Scoring already present in the app |

For the reporting code already ported, compare these surfaces against their tests.

| App file | What to check |
| --- | --- |
| [results_parser.py](../../../backend/app/red_team/results_parser.py) | Preserves case and repeat indices, counts omitted rows, validates verdict sources, and sanitizes suite data |
| [red_team_report.py](../../../backend/app/services/red_team_report.py) | Keeps errors separate from decided cases, computes rates and risk, and pairs results by suite and case identifiers |
| [framework_compliance.py](../../../backend/app/red_team/framework_compliance.py) | Computes control outcomes and reasons from plugin counts |
| [RedTeamPage.jsx](../../../Frontend/src/pages/RedTeamPage.jsx) | Shows loading, retry, and empty states independently for the report and case results |

## 3. Verify the parser and report from a saved fixture

From the repository root, enter `backend` and use its existing virtual environment.

```bash
cd backend
.venv/bin/python -m pytest -q tests/unit/test_results_parser.py tests/unit/test_red_team_report.py tests/unit/test_framework_compliance.py
.venv/bin/python -m compileall -q app
```

The compile check exited successfully. The full backend unit suite returned **481 passed** after the inventoried legacy engine tests were removed.

For a walkthrough with visible output, stay in `backend` and run this snippet. It reads the saved fixture, normalizes the cases, sanitizes the example suite, builds the report in memory, and prints only summary values.

```bash
.venv/bin/python - <<'PY'
from collections import Counter
from pathlib import Path

from app.red_team.results_parser import decide, parse_results_json, sanitize_suite
from app.services.red_team_report import build_report

fixtures = Path("tests/fixtures/promptfoo")
parsed = parse_results_json((fixtures / "results.json").read_text(encoding="utf-8"))
rows = []
for case in parsed.rows:
    verdict, source = decide(case, {"sample-issued"})
    rows.append({
        "test_idx": case.test_idx,
        "repeat_index": case.repeat_index,
        "plugin_id": case.plugin_id,
        "strategy_id": case.strategy_id,
        "severity": case.severity,
        "verdict": verdict,
        "verdict_source": source,
    })

suite = sanitize_suite((fixtures / "suite.yaml").read_text(encoding="utf-8"))
test = {
    "_id": "fyp-fixture",
    "status": "completed",
    "mode": "protected",
    "suite_id": "fyp-fixture-suite",
    "counts": {"planned": len(rows)},
    "plugins": sorted({row["plugin_id"] for row in rows}),
}
report = build_report(test, rows)
print("Verdicts:", dict(sorted(Counter(row["verdict"] for row in rows).items())))
print("Skipped:", parsed.skipped)
print("Sanitized suite fields:", sorted(suite))
print("Decided:", report["decided"]["decided"])
print("Policy verdicts:", report["decided"]["policy"])
print("Frameworks:", len(report["compliance"]))
assert Counter(row["verdict"] for row in rows) == {"error": 2, "fail": 3, "pass": 2}
assert parsed.skipped == {"no_metadata": 1}
assert report["decided"]["decided"] == 5
assert report["decided"]["policy"] == 1
assert len(report["compliance"]) == 9
PY
```

Expected output on this checkout.

```text
Verdicts: {'error': 2, 'fail': 3, 'pass': 2}
Skipped: {'no_metadata': 1}
Sanitized suite fields: ['defaultTest', 'metadata', 'redteam', 'tests']
Decided: 5
Policy verdicts: 1
Frameworks: 9
```

Five retained cases have a pass or fail verdict. The two retained error rows are recorded separately and excluded from the rate denominator. One additional source row is skipped because its metadata is missing. `sample-issued` identifies the synthetic case whose existing policy evidence is accepted by the parser.

## 4. Verify the application UI

Return to the repository root, enter `Frontend`, and run the focused component tests.

```bash
cd Frontend
./node_modules/.bin/vitest run src/pages/RedTeamPage.test.jsx src/hooks/useRedTeamTest.test.jsx
npm run lint
npm run build
```

The page/hook/preview focused tests returned **31 passed**. The full frontend unit suite returned **298 passed**. Lint and build completed successfully. The intercepted Red Team Chromium suite returned **9 passed**.

The page tests mock the API. Review the scenarios for the following behaviors.

1. A saved draft opens without requesting a report or case results.
2. If a report read fails, the report shows its own error and retry control while the result read can still finish.
3. If a result read fails, the report remains visible. Retrying results rereads the current filter without reloading the report.
4. Changing filters removes the previous rows while the new query loads. A late response from an earlier query cannot replace the newer rows.
5. Closing case details invalidates a pending detail response. Polling stops at a terminal state and on unmount.

## 5. Walk through the approved report design

For a browser walkthrough using sample data, serve the approved static prototype from the repository root.

```bash
python3 -m http.server 5214 --bind 127.0.0.1 --directory design/red-team/v3
```

Open `http://127.0.0.1:5214/report.html`. Show the comparison and risk summary, switch compliance tabs, and open case details from the results table. Press Escape to close the detail dialog. Stop the server with Ctrl+C when finished.

Introduce this screen as the **design preview with sample data**. Use the fixture output from step 3 to show what the implemented backend actually computes. The remaining acceptance item is the live paired smoke recorded in spec 21.
