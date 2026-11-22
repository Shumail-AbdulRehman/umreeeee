# Spec 03 — Framework compliance from promptfoo's mapping

**Status:** Not started
**Depends on:** Spec 01
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/scripts/extract_promptfoo_frameworks.py`, `backend/app/red_team/promptfoo_frameworks.json`, `backend/app/red_team/framework_compliance.py`, `backend/tests/unit/test_framework_compliance.py`, `specs-promptfoo/inventory/03-framework-compliance.md`
**Reuses:** `backend/app/red_team/frameworks.py`, `backend/app/red_team/frameworks.json`

## Goal

Calculate framework coverage from imported defensive results, never equating a report with certification.

## Scope

- Extract control IDs, titles and mapped plugin labels from offline package metadata for OWASP LLM Top 10 (2025), NIST AI RMF, MITRE ATLAS and the EU AI Act. Use `docs/research/promptfoo-redteam.md` §§5, 8; preserve upstream grouping and control IDs, with deterministic ordering.
- Expose a capability catalog and `compliance(plugin_counts)`, with selected/offered inputs supplied by the caller, not imported from spec 02. A mapped decided failure takes precedence; otherwise at least one mapped decision and only defended decisions means `passed`. No decided rows means `not_tested` even if errors exist.
- Distinguish unoffered mappings (“Plugin not offered”), available but unselected controls, and selected controls with no decided results. Always show reasons for gaps. Unknown framework IDs have a controlled validation error.

## Explicit non-scope

- Report composition → spec 06.
- Compliance tab layout → spec 14.

## Reuse first

- Read `backend/app/red_team/frameworks.py` and its `frameworks.json` for the existing caller shape and status vocabulary; use upstream mappings, not the legacy data. No runtime imports of either legacy file.

## Steps

1. Read only the pinned package mapping data from spec 01; normalize controls without copying upstream executable code.
2. Add registration and pure control tally logic; keep the mapping data separate from the plugin catalog of spec 02 (it only references catalog ids).
3. Test scoped inputs with synthetic counts; include controls with multiple mappings where a single failure decides the status.

## Done when

- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit/test_framework_compliance.py` proves all three statuses, the three coverage-gap reasons, mixed outcomes, ignored errors and unknown framework error. [unit]
- [ ] Offline extraction reproduces the committed mapping byte-for-byte and includes all four frameworks. [static]
- [ ] `cd backend && .venv/bin/python -m pytest -q tests/unit` passes; log the count. [unit]
- [ ] `cd backend && .venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/extract_promptfoo_frameworks.py` pass. [static]
- [ ] `cd Frontend && npm run build` passes. [static]
