# Spec 01 — Plugin and control catalog v3

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/catalog_v3.json`, `backend/app/red_team/plugins.py`, `backend/tests/unit/test_red_team_plugins.py`, `specs-red-team/inventory/01-plugin-catalog.md`
**Reuses:** `backend/app/red_team/catalog.json`, `backend/app/red_team/catalog_schema.py`, `design/red-team/v3/new-test.html`, `ARCHITECTURE.md#data-model`

## Goal

A validated v3 catalog: the eight plugins from spec 00, each with severity, group, description, evidence type and 4-6 original synthetic templates, the five control questions, and the eight strategies' display metadata, exposed through a small loader.

## Scope

- `catalog_v3.json` with version `synthetic-catalog-3` and a source note ("original synthetic templates authored for this application"). Per plugin: `id`, `name` (as in the approved editor), `group`, `severity`, `description`, `evidence_type`, `scenario` (the scenario rules the manifest adds to the system prompt: what is secret, what is forbidden, the allowed topic, the fictional tool for tool plugins), and `templates` [{id, description, prompt}]. Templates are short, mild and fictional; `harmful` targets a fictional forbidden procedure defined in its scenario; `tool-injection` and `excessive-agency` describe a fictional tool call syntax; `pii` uses a synthetic customer record.
- Controls: carry over the five existing controls by meaning (benign product-support questions), with new ids.
- Strategies: id, name, group (`Baseline`, `Encodings`, `Framing`), description and effort exactly as listed in spec 00.
- `plugins.py`: load once, validate (unique ids, every plugin has 4-6 templates, every template id unique, severities and groups from the closed sets, evidence types from `ARCHITECTURE.md`), and expose read-only registries for plugins, strategies and controls, plus the catalog version. Invalid catalog data raises at import with a clear message.

## Explicit non-scope

- Applying strategies to text → spec 02.
- Building manifests and markers → spec 10.
- Framework mappings per plugin → spec 04.
- Changing the legacy `catalog.json` or `catalog_schema.py` → none; they stay as they are for legacy tests (spec 22 keeps reading them).

## Reuse first

- Mirror the shape and tone of the existing `catalog.json` templates; keep its "no external dataset" provenance.
- Use the plugin names, groups and descriptions shown in `design/red-team/v3/new-test.html` so UI and API agree.

## Steps

1. Read the legacy catalog and the approved editor screen.
2. Author the v3 JSON with the scenario rules each evidence type needs (a secret marker placeholder, a refusal instruction, a safe answer, a forbidden tool call).
3. Write the loader and validation.
4. Write unit tests that load the real file and tests that feed deliberately broken catalogs to the validator.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_plugins.py` passes: the real catalog loads with exactly 8 plugins, 8 strategies and 5 controls; each plugin has 4-6 templates; duplicate ids, an unknown severity, an unknown evidence type and a plugin with 3 templates are each rejected with a message naming the field. [unit]
- [x] A test asserts no template or scenario contains real-looking secrets (API-key prefixes, `@` email addresses other than `example.test`) and that `harmful` scenarios reference only the fictional forbidden topic. [unit]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-11**: Created `catalog_v3.json`, `plugins.py`, `tests/unit/test_red_team_plugins.py` and the inventory fragment. 8 plugins x 5 templates, 8 strategies, 5 controls. Legacy files untouched.
- **2026-11-11**: `.venv/bin/python -m pytest -q tests/unit/test_red_team_plugins.py` 19 passed; `.venv/bin/python -m pytest -q tests/unit` 120 passed (baseline 101 + 19), 0 failed; `.venv/bin/python -m compileall -q app scripts` exit 0.
- **2026-11-11**: Decisions for later specs: severities are lowercase (`critical, high, medium, low`; no plugin is critical); `harmful` uses evidence type `marker` and `hijacking` uses `off_topic`; scenario/prompts use `{marker}`, `{refusal}`, `{answer}` placeholders, filled with `plugins.fill` (not `str.format`); tool-plugin templates embed `{marker}` in the fictional call payload. No change needed outside Owns.
- **2026-11-11**: Lead review fixes: rewrote `ti-1`, `ti-3`, `ea-1` to describe the call in words (no `[[call` in any template prompt; new test); `basic` strategy now named "Plain", description "Sent as written" (new test); inventory tool_call note updated. Re-run: `tests/unit/test_red_team_plugins.py` 21 passed; `tests/unit` 122 passed, 0 failed; `compileall -q app scripts` exit 0.
