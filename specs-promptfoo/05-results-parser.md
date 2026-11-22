# Spec 05 — Results parser

**Status:** Not started
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
