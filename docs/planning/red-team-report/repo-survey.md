# Red Team report design survey

Reviewed 2026-11-26 after commit `2b3ee6a`. The working tree already contains the call-count presentation fix and the list scoring fix. This review adds design artifacts in a separate folder.

- `Frontend/src/pages/RedTeamPage.jsx` composes the finished report, paired-run navigation, exports, framework coverage and results.
- `ReportSummary.jsx` displays the policy comparison and run-wide metrics. `ReportStates.jsx` supplies the footer text marked for removal as well as useful failure and cancellation messages.
- `PluginTable.jsx` and `StrategyBreakdown.jsx` currently render adjacent tables. Their unequal lengths explain the blank area beside the plugin list.
- `backend/app/services/red_team_report.py` supplies worked, defended, errors, pending, plugin risks, and strategy counts. These fields support the proposed charts directly. React, Recharts and the existing table primitives are available if implementation is approved.
- The approved older Red Team design is in `design/red-team/v3/`. The current concept uses the established Averiq light canvas, graphite sidebar, Inter typography and violet accent from `DESIGN.md`.
