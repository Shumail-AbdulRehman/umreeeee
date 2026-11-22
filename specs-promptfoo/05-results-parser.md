# Spec 05 — Results parser

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/results_parser.py`, `backend/tests/unit/test_results_parser.py`, `backend/tests/fixtures/promptfoo/`, `specs-promptfoo/inventory/05-results-parser.md`, `backend/requirements.txt`
**Reuses:** `backend/app/services/red_team_service.py`, `backend/app/services/content_service.py`, `INVENTORY.md#red-team-domain`

## Goal

Convert promptfoo result rows and generated suites into stable report records with one unambiguous verdict source.

## Scope

- Parse a single complete JSONL line and final JSON. Normalize `test_idx`, `repeat_index`, plugin, strategy (default `basic`), severity, goal, prompt, response output, grader pass and reason (up to 1000 characters), error, latency, token usage and cost.
- Input is untrusted data: ignore unknown keys without interpreting content, reject malformed rows and invalid required indices with a reason that does not echo payload text, and preserve absent numeric fields as unknown rather than zero. A partial line waits for the caller to finish reading it.
- `decide(row, bridge_record)`: absent/malformed result and provider or grader error become `error`/`none`; otherwise a recorded protected non-`system_prompt` policy block is `pass`/`policy`. Otherwise explicit grader true is `pass`/`grader`, explicit false is `fail`/`grader`; missing grade is error unless a qualifying policy block supplied the verdict. A flag by itself is not policy authority.
- `count_suite_tests(suite_text)` counts the generated suite's test entries. Never evaluate custom tags, paths or provider references.

- Add `PyYAML` (pin the version already installed in the venv, 6.0.3) to `backend/requirements.txt`; it is installed transitively today but undeclared, and suite parsing must use `yaml.safe_load` only.

## Explicit non-scope

- Persistence, deduplication across reads, and retention enforcement → spec 17.
- Aggregated rates and scoring → spec 06.

## Reuse first

- `docs/research/promptfoo-integration.md` §3 defines output envelopes, streaming rows and nullable grades; `docs/research/promptfoo-redteam.md` §6 defines pass semantics. Reuse spec 00's verdict authority and existing decision vocabulary, not old engine logic.
- `content_service.py` is a downstream storage boundary, not a parser dependency. Fixtures use harmless placeholder text only.

## Steps

1. Add samples for both formats, including repeated indices across different repeat values and metadata-only multi-turn labels.
2. Normalize and validate inputs, then centralize verdict precedence in one pure function.
3. Make row and suite errors safe to log without including raw values.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_results_parser.py` covers pass, fail, provider error, `graderError`, confirmed policy block, system-only block, missing grade, missing result, multi-turn label, malformed line, reason cap and suite count. [unit]
- [ ] Fixture inspection shows no credentials, real dialogue, provider references or exploit payloads. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes; log the count. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` passes. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Inspected the installed `promptfoo` 0.126.0 package in the local probe's temporary `pf2/node_modules`. `dist/src/index.d.ts` and `transform-C_SO0-up.d.ts` confirmed the result envelope, row fields, optional repeat index, nullable grades, component grades, and provider output and measurement fields.
- Checked `dist/src/evaluator-5tUcjTs8.js`, `evalResult-8T4cELEt.js`, `util-BoX1cZc_.js`, and `tables-DaSnT9dV.js`. The JSONL writer terminates each row with a newline and final JSON places rows under `results.results`. Assertion failures set `failureReason` to `1` and copy the reasoning to `error`. Execution errors use `2`, and `graderError: true` can appear in component metadata. Result measurements can appear on the row or response. Checked `tokenUsageUtils-DtQCFKFW.js` for aggregate usage initialization.
- Checked `dist/src/main.js` and `strategies-BeuvBHPx.js` for the generated YAML's inline `tests` list and generated metadata, including multi-turn strategy labels. Confirmed the backend venv has PyYAML 6.0.3 and that its `safe_load` uses `SafeLoader`, whose constructor rejects undefined tags.
- `cd backend && .venv/bin/python -m pytest -q tests/unit/test_results_parser.py` → 37 passed in 0.20s.
- Inspected all three files in `backend/tests/fixtures/promptfoo/`. All content is synthetic placeholder data. The fixtures contain zero credentials, real dialogue, provider references or exploit payloads.
- `cd backend && .venv/bin/python -m pytest -q tests/unit` → 522 passed, 8 deprecation warnings in 20.85s.
- `cd backend && .venv/bin/python -m compileall -q app` → exit 0. Bytecode was directed to a temporary cache.
- `cd Frontend && npm run build -- --outDir <temporary directory>` → exit 0, 2,941 modules transformed in 7.33s. Vite warned about the temporary output directory and the missing `compareRedTeamTests` export used by `RedTeamPage.jsx`. The export and its caller are outside spec 05 ownership.
- Handoff for specs 10 and 17 is documented in `inventory/05-results-parser.md`. Spec 05 verification used synthetic inputs and has no MongoDB integration criterion.
