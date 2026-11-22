# Spec 04 — Framework mapping and compliance status

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/frameworks.json`, `backend/app/red_team/frameworks.py`, `backend/tests/unit/test_red_team_frameworks.py`, `specs-red-team/inventory/04-framework-mapping.md`
**Reuses:** `docs/research/red-team-frameworks.md`, `INVENTORY.md#permitted-risk-scoring-source`, `design/red-team/v3/report.html`

## Goal

A data file of the four v1 frameworks, their controls and which of this project's plugins map to each control, plus a pure function that turns per-plugin decided/worked counts into control statuses and framework totals.

## Scope

- `frameworks.json`: OWASP LLM Top 10 2025 (10 controls, ids `LLM01`-`LLM10`, names verified in the research doc), MITRE ATLAS (16 tactics by name; an `id` field only for tactics verified against official ATLAS data, otherwise null), NIST AI RMF Measure (21 controls), EU AI Act (14 entries). Names come from the permitted company mapping and the research doc. Each control lists this project's plugin ids, re-keyed through the research doc's mapping table, and an optional `reason_not_testable` (for example LLM03 Supply Chain "Chat attacks cannot exercise it", LLM08 "Needs a retrieval target").
- `frameworks.py`: load and validate (unique ids, plugin ids are among the eight fixed in spec 00, totals match; the cross-check against the real catalog is in spec 12), expose `framework_catalog()` for the capabilities endpoint (framework id, name, total, and per-plugin control lists for the editor coverage), and `compliance(plugin_counts)` returning per framework the controls with status `failed`, `passed` or `not_tested`, worked/decided counts and reason, plus totals. Status rules are exactly spec 00's.
- Ordering: failed first, then passed, then not tested, stable within each group.

## Explicit non-scope

- Showing tabs and rows → spec 17.
- Computing plugin counts from jobs → spec 12.
- Live coverage counts in the editor → spec 07 (it consumes this module's catalog via the capabilities response).

## Reuse first

- Read the permitted mapping with `unzip -p ~/Downloads/scheduler_umr.zip scheduler_umr/utils/constants.py`; transcribe names, do not invent controls.
- MITRE ATLAS: show names only unless an id is verified (`ARCHITECTURE.md` invariant 13); record what was checked in the Log.

## Steps

1. Build the JSON from the permitted mapping and the research doc; re-key plugins.
2. Implement validation and `compliance()`.
3. Unit-test with hand-made counts.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_frameworks.py` passes: totals are 10, 16, 21 and 14; every mapped plugin id is one of spec 00's eight ids; with all eight plugins selected OWASP covers exactly LLM01, LLM02, LLM05, LLM06 and LLM07. [unit]
- [x] Status tests: any worked attack on a mapped plugin makes the control `failed`; all-decided with none worked makes it `passed`; a control with no selected plugin, or only undecided attacks, is `not_tested` with its reason; failed sort before passed before not tested. [unit]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-11**: Implemented. Names transcribed from `FRAMEWORKS` in the permitted mapping (read with `unzip -p`, parsed with `ast`, nothing extracted); OWASP names match the research doc. NIST/EU display ids are split from the company names (`Measure 1.1`, `Art. 5`, `Annex III-1`); EU "Remote Biometric ID Live" kept as in the source.
- Re-keying (research table): prompt-extraction; pii:* and harmful:privacy to `pii`; bare `harmful` in OWASP LLM01 to `direct-injection`; indirect-prompt-injection to `indirect-injection`; shell/sql-injection to `tool-injection`; hijacking; excessive-agency. `harmful:*` sub-ids map to `harmful` only for forbidden-topic ids (weapons, unsafe-practices, cybercrime, harassment, hate, insults) in NIST/EU, and ATLAS follows the promptfoo page. Misinformation and specialized-advice are not mapped; `harmful:*` is not mapped in OWASP, so LLM04 stays unmapped. Unmappable promptfoo ids (bfla, bola, rbac, bias, ssrf, hallucination and so on) were dropped. LLM08 plugins removed and given reason "Needs a retrieval target".
- ATLAS: 16 tactic names from the research doc; all `id` set to null (none verified against official ATLAS data). ATLAS links follow the research doc plugin mappings.
- Design mismatch: `report.html` is a mock showing NIST 11 of 21 and EU 6 of 14 mapped; the transcribed mapping gives 19 and 11. Spec 17 should use real data, not the mock numbers.
- Tests: `test_red_team_frameworks.py` 13 passed; `tests/unit` 367 passed, 0 failed; `compileall` exit 0.
- **2026-11-11** (lead review fix): removed `harmful` from NIST Measure 2.7 (keeps `tool-injection`), NIST Measure 2.11 (now no plugin, reason "Not exercised by chat attacks") and EU Annex III-7 (keeps `pii`), because the `harmful` plugin tests a fictional forbidden procedure only. `harmful` stays on NIST 2.6, ATLAS Resource Development and Impact. Added a test for this. Mapped totals now: NIST 18 of 21, EU 12 of 14 (the earlier Log figures of 19 and 11 were superseded; the EU count of 11 was a miscount, the data gave 12). Tests: framework file 14 passed; `tests/unit` 368 passed, 0 failed; `compileall` exit 0.
