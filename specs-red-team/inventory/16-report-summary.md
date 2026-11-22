# Spec 16 inventory: report summary, plugin table, strategy breakdown

**Added by:** spec 16. All in `Frontend/src/features/red-team/`; each imports `./red-team.css`.

| Export | File | Props | Notes |
|---|---|---|---|
| `ReportSummary` (default) | `ReportSummary.jsx` | `report` (v3 payload), `mode` ('raw'/'protected', falls back to `report.mode`, then 'raw') | Three `<article>`s (Overall risk, Attacks that worked, Decided) in a grid. Paired card/line from `report.paired`; otherwise "Clone as protected/raw to compare." Reduction = raw minus protected, whichever run is this one. Trend sentence from `report.trend`. "By exact evidence" = `decided.exact + decided.policy`. |
| `PluginTable` (default) | `PluginTable.jsx` | `plugins`, `paired` (the `report.paired` object, a plain `{plugin_id: rate}` map, or null) | Rows render in given order. Focusable labelled region (`rt-table-region`, `data-label` cells). Missing paired rate reads "Not scored"; no worked attacks reads "No attack worked". |
| `StrategyBreakdown` (default) | `StrategyBreakdown.jsx` | `strategies` | Given order; summary sentence names the two highest-rate strategies with worked > 0. |

Bars and scales are `aria-hidden`; every number is text. Nothing animates.

## Spec 21 usage

Render `<ReportSummary report={report} mode={test.mode} />`, then a two-column grid of `<PluginTable plugins={report.plugins} paired={report.paired} />` and `<StrategyBreakdown strategies={report.strategies} />`. Fetching the report is spec 21's job; these components take plain props.
