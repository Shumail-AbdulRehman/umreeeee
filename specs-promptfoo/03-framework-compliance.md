# Spec 03 — Framework compliance from promptfoo's mapping

**Status:** Done
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

## Log

### 2026-11-22

- Verified the installed `node_modules/promptfoo/package.json` name, version `0.126.0`, and MIT license notice. Read the four mapping objects in `dist/src/tables-DdCbyxUP.js`, including the separate ATLAS AI Attack Staging object and the distinct legacy alias. Read exact OWASP control titles and verified the default pass threshold of 1 and `harmful` collection expansion in `dist/src/app/assets/index-Cvjh7gqz.js`. The static extractor reads these versioned chunks as text. It preserves package control IDs and mapping order, derives NIST, ATLAS and EU display titles from the shipped IDs, and includes the package license notice.
- Implemented the capability catalog and pure compliance tally in `backend/app/red_team/framework_compliance.py`. Explicit historical selections can contribute stored decisions when current offerings change. The current offered and selected scopes supply coverage-gap reasons. Reusable signatures are in `specs-promptfoo/inventory/03-framework-compliance.md`.
- `cd backend && .venv/bin/python -m pytest -q tests/unit/test_framework_compliance.py` returned 12 passed in 0.09 s using synthetic counts.
- `cd backend && .venv/bin/python scripts/extract_promptfoo_frameworks.py --check` exited 0 and reported a byte-for-byte match. The JSON contains 61 controls across four frameworks (OWASP 10, NIST 21, MITRE ATLAS 16, EU AI Act 14).
- `cd backend && .venv/bin/python -m pytest -q tests/unit` returned 542 passed and 8 deprecation warnings in 9.46 s.
- From `backend/`, `.venv/bin/python -m compileall -q app` and `.venv/bin/python -m py_compile scripts/extract_promptfoo_frameworks.py` both exited 0.
- `cd Frontend && npm run build` exited 0 in 5.17 s with 2,941 modules transformed. Vite warned about the existing missing `compareRedTeamTests` export used by `RedTeamPage.jsx` and reported plugin timing warnings.
- All five Done-when checks passed. This spec has zero MongoDB integration checks.
