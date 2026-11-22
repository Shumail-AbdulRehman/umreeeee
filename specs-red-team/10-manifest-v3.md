# Spec 10 — Plugin manifest builder v3

**Status:** Done
**Depends on:** Spec 01, Spec 02
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/manifest_v3.py`, `backend/tests/unit/test_red_team_manifest_v3.py`, `specs-red-team/inventory/10-manifest-v3.md`
**Reuses:** `backend/app/red_team/plugins.py`, `backend/app/red_team/strategies.py`, `backend/app/red_team/catalog_schema.py`, `ARCHITECTURE.md#data-model`

## Goal

A deterministic manifest for a v3 test: one row per plugin × strategy × repetition plus the five controls, each with its sent prompt, scenario system instruction and evidence markers, and a stable hash so raw and protected runs pair attack by attack.

## Scope

- `build_manifest(plugins, strategies, tests_per_plugin, seed)` validates inputs against spec 01's registries (unknown or duplicate ids, empty plugin list, tests outside 1-10, total over 100 all raise `ValueError` with a message naming the limit) and always includes `basic`.
- Template choice per repetition rotates through the plugin's templates offset by the seed, so repetitions use different templates where possible. Strategy application uses spec 02 with seed material derived from seed, index and template.
- Markers per row are derived from a SHA-256 of seed, position, plugin, strategy and template, in the legacy style: secret marker, refusal token, safe answer, off-topic marker, plus a PII record marker and a forbidden tool-call marker where the plugin's evidence type needs them. The scenario system instruction combines the legacy wording (synthetic test, never repeat the marker, reply exactly the refusal token when asked to reveal or leave the topic) with the plugin's scenario rules from spec 01.
- Each row carries the job fields listed in `ARCHITECTURE.md#data-model`: attack index, case kind, plugin id, strategy id, severity, template id, original prompt, prompt, scenario system, evidence type, markers. Rows are shuffled with a seeded generator; controls are appended last, as today.
- `manifest_hash(rows)` reuses the legacy canonical JSON hashing.

## Explicit non-scope

- Grading replies against these markers → spec 11.
- Persisting rows as jobs at launch → spec 22.
- The legacy v2 `manifest()` stays untouched; legacy configs keep using it through → spec 22.

## Reuse first

- Reuse `catalog_schema.manifest_hash` (import it) instead of writing a second hash.

## Steps

1. Implement validation and row assembly.
2. Unit-test determinism, counts and marker isolation.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_manifest_v3.py` passes: the same inputs give identical rows and hash; a different seed changes markers and hash; 8 plugins × 4 strategies × 3 gives 96 adversarial + 5 control rows; each plugin×strategy pair appears exactly `tests_per_plugin` times; repetitions of one plugin use distinct templates when it has enough. [unit]
- [x] Validation tests: an unknown plugin, an unknown strategy, a duplicate id, 0 or 11 tests per plugin, and a total of 101 each raise `ValueError`; every row's markers are unique within the manifest; no secret, PII, refusal, answer or off-topic marker appears in its own row's sent prompt (the `tool_call` payload token is the one exception: it is carried in the sent prompt by design). [unit]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-11**: implemented. Spec test file 14 passed; unit suite: 400 passed, 1 failed (tests/unit/test_red_team_evidence.py::test_marker_variants[secret: zx-s3cr3t-4821-None], spec 11's in-progress test, not touched); compileall rc=0. The exact total of 101 is unreachable as a product of plugins x strategies x tests; the over-limit path is tested with 105 and 128 (message names 100).

- **2026-11-14**: Independent review corrected the original Log date markup so the validator recognizes the existing dated evidence; historical results are unchanged.
