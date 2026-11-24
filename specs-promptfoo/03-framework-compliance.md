# Spec 03 — Framework compliance from the scheduler's frameworks

**Status:** Done
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/scripts/port_scheduler_frameworks.py`, `backend/app/red_team/scheduler_frameworks.json`, `backend/app/red_team/framework_compliance.py`, `backend/tests/unit/test_framework_compliance.py`, `backend/tests/fixtures/scheduler_constants_sample.py`, `backend/scripts/extract_promptfoo_frameworks.py`, `backend/app/red_team/promptfoo_frameworks.json`, `specs-promptfoo/inventory/03-framework-compliance.md`
**Reuses:** `docs/research/scheduler-reuse.md`, `backend/app/red_team/catalog.py`, `backend/app/services/red_team_report.py`

## Goal

Replace the from-scratch framework extraction with the owner's scheduler frameworks (all nine frameworks) and the scheduler's control-status rules, keeping the `compliance()` result shape that spec 06 and the finished compliance tabs (spec 14) consume.

## Scope

- `backend/scripts/port_scheduler_frameworks.py <path-to-scheduler>/utils/constants.py` reads only the `FRAMEWORKS` assignment with Python's `ast` (`ast.literal_eval` of that node). It never imports or executes the file, which also holds server names and placeholder credentials. It writes `scheduler_frameworks.json` deterministically: `source` {file name `utils/constants.py`, sha256 of the source file, ported date}, `license_note` ("owner's scheduler, reused with permission"), and `frameworks` in source order. Each framework has `id`, `name`, `description`, and `controls` [{`id`, `name`, `plugins` [{`id`, `name`, `severity`}]}]. Drop the scheduler's runtime fields (`status`, `result`, `asr`). The script refuses an input whose `FRAMEWORKS` is missing or not a literal.
- Run it once against `/home/shumail/Downloads/scheduler_umr/scheduler_umr/utils/constants.py` and commit the JSON. It must list every framework in the source, in source order: `nist_ai_rmf`, `eu:ai-act`, `owasp:llm`, `owasp:api`, `mitre:atlas`, `owasp:agentic`, `iso:42001`, `gdpr`, `dod:ai:ethics` (verify each id and control count and record them in the Log). No hostname, credential or path from the source may appear in the JSON.
- `framework_compliance.py` loads the new JSON and keeps its public API: `load_frameworks()`, `framework_catalog(offered_plugins)`, `covered_controls(selected_plugins, framework_id)`, `compliance(plugin_counts, *, selected_plugins, offered_plugins)` and `UnknownFrameworkError`. `plugin_counts[plugin]` now carries `passed`, `failed`, `errors`. Until spec 06 switches, also accept the current report's shape `{decided, worked}` (passed = decided − worked, failed = worked, errors = 0), so `red_team_report.py` keeps working unchanged.
- Status rules ported from the scheduler (`utils/runner.py`):
  - A mapped, selected plugin that ran is failed if `failed > 0`, otherwise errored if every row errored, otherwise passed if `passed > 0`.
  - A control is `failed` if any mapped plugin failed, otherwise `passed` if any passed. When only errors ran it is `not_tested` with the new reason "Only errors recorded". With no mapped plugin run it is `not_tested` with the existing reasons (undecided, not selected, plugin not offered).
- Per framework, keep `total`, `failed`, `passed`, `not_tested` and add `coverage` = passed ÷ total × 100, rounded half-up to 2 (scheduler `overall_summary.coverage`). Keep the control fields `key`, `id`, `name`, `status`, `worked` (= failed rows), `decided` (= passed + failed) and `reason`. Delete `extract_promptfoo_frameworks.py` and `promptfoo_frameworks.json` once nothing imports them.

## Explicit non-scope

- Report composition and trend → spec 06.
- Compliance tab layout → spec 14 (it already renders any number of frameworks).

## Reuse first

- Read `parse_redteam_json`'s framework loop in the scheduler (`utils/runner.py`) and `docs/research/scheduler-reuse.md` "The scheduler's parser" for the exact rules. Keep the current module's reason constants and status ordering.

## Steps

1. Write the port script and a small synthetic `scheduler_constants_sample.py` fixture with two frameworks and a credential-like decoy constant, then generate the real JSON.
2. Rewire the loader and status rules, keeping the public API and output fields.
3. Update the tests, then run the backend suite (spec 06's tests must still pass unchanged or with fixture-only updates).

## Done when

- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_framework_compliance.py` passes: the port script converts the sample fixture without executing it, ignores the decoy constant and rejects a non-literal input; failed beats passed; only-errors gives `not_tested` with "Only errors recorded"; the three existing gap reasons; `coverage` rounding; unknown framework error. [unit]
- [x] `backend/app/red_team/scheduler_frameworks.json` lists exactly the nine framework ids and contains no host name, `/home/`, password or key text (`grep -inE "proj-alpha|cytex|/home/|passw|secret" backend/app/red_team/scheduler_frameworks.json` returns nothing). [static]
- [x] Re-running the port script on the scheduler path reproduces the committed JSON byte for byte. [static]
- [x] `grep -rn "promptfoo_frameworks\|extract_promptfoo_frameworks" backend/app backend/scripts backend/tests` returns nothing. [static]
- [x] Same file: `compliance()` gives identical statuses for the same counts in the new `{passed, failed, errors}` shape and the legacy `{decided, worked}` shape. [unit]
- [x] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes except the `tests/unit/test_red_team_report.py` cases that look up a pre-port framework id (e.g. `owasp`); list each failing case in the Log. Known temporary failure owned by spec 06. [unit]
- [x] `cd backend && .venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/port_scheduler_frameworks.py` pass. [static]

## Log

- **2026-11-22**: First implemented (Codex) as an extraction from the promptfoo package (four frameworks); 12 tests, backend 542.
- **2026-11-22**: Reopened by the planner: port the owner's scheduler frameworks and rules instead (spec 00 revision). The previous Done-when results no longer apply.
- **2026-11-23**: Implementation blocked by the spec 06 report contract. `backend/app/services/red_team_report.py` still supplies `decided` and `worked`, and `backend/tests/unit/test_red_team_report.py` looks up `owasp` in the report. Spec 03 requires the scheduler ID `owasp:llm` and counts `passed`, `failed`, and `errors`. In a process-local check that changed only the framework key, `tests/unit/test_red_team_report.py` had 21 passes and 5 failures at its `owasp` lookup. Spec 06 owns both report files. The acceptance checks need a decision about the interim report contract or a coordinated update to the report and its tests.
- **2026-11-23**: Root `npm ci` exited 0. Checked the installed package manifest for `0.126.0` and the compiled framework tables for `owasp:llm:01` and `nist:ai:measure:1.1`. Read only the scheduler's `FRAMEWORKS` assignment via AST and checked the precedence in its report loop. The eight requested frameworks have these control counts: `nist_ai_rmf` 21, `eu:ai-act` 14, `owasp:llm` 10, `owasp:api` 10, `mitre:atlas` 6, `owasp:agentic` 10, `iso:42001` 7, `gdpr` 7. The source also has `dod:ai:ethics` with 5 controls, outside the eight explicitly requested.
- **2026-11-23**: Baseline from `backend/`: `.venv/bin/python -m pytest -q tests/unit/test_framework_compliance.py tests/unit/test_red_team_report.py` had 38 passes. `.venv/bin/python -m pytest -q tests/unit` had 606 passes and 8 warnings. `.venv/bin/python -m compileall -q app` exited 0. Port-script and generated-artifact checks were not run because implementation stopped at the contract conflict. No criteria were checked and no implementation files were changed.

### 2026-11-23 (scheduler port)

- Implemented the AST-only port, replaced the earlier extractor and artifact, and adopted the scheduler's exact plugin ID matching. Runtime control keys use the scheduler control IDs. The port date is fixed to preserve byte-for-byte regeneration. The compliance tally accepts both count formats and excludes errors from decided counts.
- Root `npm ci` exited 0 with 579 packages installed. Verified the package name, version `0.126.0` and MIT license in `node_modules/promptfoo/package.json` and checked `owasp:llm:01` and `nist:ai:measure:1.1` in the installed `dist/src/tables-*.js` framework metadata. No promptfoo CLI or live calls were used.
- Generated `scheduler_frameworks.json` from the scheduler and verified all nine frameworks in source order. Control counts were `nist_ai_rmf` 21, `eu:ai-act` 14, `owasp:llm` 10, `owasp:api` 10, `mitre:atlas` 6, `owasp:agentic` 10, `iso:42001` 7, `gdpr` 7 and `dod:ai:ethics` 5 (90 total). Rerunning the port on the same scheduler source reproduced the working-tree JSON byte for byte (`cmp` exit 0).
- `grep -inE "proj-alpha|cytex|/home/|passw|secret" backend/app/red_team/scheduler_frameworks.json` had no matches. `grep -rn "promptfoo_frameworks\|extract_promptfoo_frameworks" backend/app backend/scripts backend/tests` had no matches after clearing the deleted extractor's stale Python bytecode. Both searches exited 1.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit/test_framework_compliance.py` returned 17 passed. `.venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/port_scheduler_frameworks.py` both exited 0. `git diff --check` exited 0. This spec has no MongoDB integration gate.
- From `backend/`, `.venv/bin/python -m pytest -q tests/unit` returned 606 passed, 5 expected failures and 8 warnings. All five failures are the legacy `owasp` lookup in `tests/unit/test_red_team_report.py`, owned by spec 06:
  - `test_empty_terminal_report_keeps_null_rates_and_risk`
  - `test_all_defended_scores_zero_and_preserves_grader_display_metadata`
  - `test_critical_failure_uses_recorded_severity_and_compliance`
  - `test_errors_and_pending_are_excluded_at_every_level`
  - `test_historical_ids_keep_their_tallies_without_becoming_selections`
- The scoped `git add` exited 128 because `.git/index.lock` could not be created on the read-only filesystem. The changes are in the working tree on `promptfoo-redteam`. The required commit and comparison against the committed artifact are pending.
- **2026-11-23** (lead review, Claude): re-ran from `backend/`: focused 17 passed; whole unit suite 606 passed + the 5 expected `test_red_team_report.py` framework-id failures owned by spec 06; compileall exit 0; JSON lists the nine ids (90 controls), no host/path/secret text; re-running the port script reproduces the JSON byte for byte; no references to the removed extractor. Marked Done; commit pending (Codex sandbox cannot write `.git`).
