# Red Team DAG draft

2026-11-11. Every edge and what it consumes.

| Spec | Depends on | Consumes |
| --- | --- | --- |
| 01-09 | 00 | The decisions record (plugin ids, strategy ids, limits, grading order, scoring rules, testing approach) |
| 10 | 01 | Plugin, strategy and control registries; scenario rules; templates |
| 10 | 02 | `apply()` to build sent prompts |
| 11 | 01 | Evidence types and marker kinds per plugin |
| 11 | 02 | `decoded_variants()` and `normalize()` |
| 12 | 01 | Plugin names, severities, groups |
| 12 | 03 | Plugin and system risk functions |
| 12 | 04 | `compliance()` |
| 13, 15-19 | 06 | Shared stylesheet and label maps |
| 14 | 06 | Stylesheet, labels |
| 14 | 07 | `editorSummary()` |
| 20 | 02 | `decoded_variants()` for result detail |
| 20 | 12 | `build_report()` |
| 21 | 08 | Service query objects, fixed polling hook |
| 21 | 13-19 | Every feature view it composes |
| 22 | 04 | `framework_catalog()` for capabilities |
| 22 | 10 | `build_manifest()` at create/edit/launch |
| 22 | 20 | Read-side functions it delegates to |
| 23 | 05 | Judge request builder and parser |
| 23 | 11 | `grade()` |
| 23 | 22 | v3 job rows and the judge snapshot written at launch |
| 24 | 01-23 | The integrated application |
| 25 | 00-24 | Everything |

Edges considered and rejected: 13-19 → 08 (components never call services; only 21 does); 12 → 11 (aggregation reads stored verdicts, not the grader); 20 → 11 (detail reads stored steps); 21 → 22 (the page is built against the documented contract and proven against the real API in 24); 09 → 23 (the recovery entry point is unchanged by 23).
