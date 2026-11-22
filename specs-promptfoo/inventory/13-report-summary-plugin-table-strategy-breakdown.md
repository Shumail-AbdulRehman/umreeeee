# Spec 13 reuse inventory

| Path | Surface | Use |
| --- | --- | --- |
| [ReportSummary.jsx](../../Frontend/src/features/red-team/ReportSummary.jsx) | `ReportSummary({ report, mode })` | Presents the stored same-suite comparison, score, coverage and provenance. |
| [PluginTable.jsx](../../Frontend/src/features/red-team/PluginTable.jsx) | `PluginTable({ plugins, paired })` | Presents plugin risk, decided coverage, outcomes and optional paired rates. |
| [PluginTable.jsx](../../Frontend/src/features/red-team/PluginTable.jsx) | `ReportTable({ titleId, headings, compact, children })`, `ReportOutcome({ outcome })` | Shared report table with a labelled keyboard-scroll region and shared presentation of outcome counts. |
| [StrategyBreakdown.jsx](../../Frontend/src/features/red-team/StrategyBreakdown.jsx) | `StrategyBreakdown({ strategies })` | Presents per-strategy coverage and outcomes using the shared report table. |

Report fixture fields for spec 06 handoff. A same-suite `paired` object carries matched `raw_rate` and `protected_rate` as fractions and `delta_pp` as protected minus raw in percentage points. The delta field distinguishes matched results from an older paired-run link. Plugin and strategy rows retain `id`, `name`, `decided`, `worked` and `rate`. Rows can carry `total`, `defended`, `errors` and `pending` for full coverage. Engine metadata can include `grader_model`.
