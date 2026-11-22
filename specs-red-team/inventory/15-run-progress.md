# Inventory fragment: spec 15 run progress

### red-team-run-progress
`Frontend/src/features/red-team/RunProgress.jsx` — default export `RunProgress`, the in-progress view with the cancel confirmation (Radix dialog from `ui/dialog.jsx`, never `window.confirm`). Imports `./red-team.css`. **Added by:** spec 15.

Props:
- `test` — `{status, progress: {total_jobs, terminal_jobs, running, queued, retry_wait, pending, finished, cancelled}}`. Bar value is `finished` (falls back to `terminal_jobs`), max `total_jobs`.
- `provisional` — `{attack_success_rate (fraction 0-1), worked, decided, finished}`. Rate shows via `formatPercent`, beside a "Provisional" badge. Overall risk always reads "Not yet".
- `latest` — rows `{id, attack_index, plugin_name, strategy_name, verdict, verdict_source, state, evidence}`; verdict badge from `verdictLabel` ("Judging" for pending).
- `requestsPerMinute` — pace; remaining minutes = ceil((queued + running + retry_wait) / pace).
- `updatedAgo` — seconds, shown in a polite live "Updated N s ago." line.
- `dispatchPending` — shows "waiting for the queue, not a result".
- `busy` — disables the Cancel test trigger and the confirm button.
- `onCancel` — called exactly once on confirm (dialog closes).

Dialog: trigger "Cancel test"; title "Cancel this test?"; three consequences (queued will not run, in-progress may finish and cost money, finished results stay in a cancelled report). "Keep running" closes and Radix restores focus to the trigger.

How spec 21 uses it: render it for `running`/`queued`/`cancelling` tests, feeding polled data (spec 08); `onCancel` should call the cancel API. The component renders no page title, mode or launch metadata; spec 21 supplies the heading. A `cancelling` status shows the badge only; spec 21 should pass `busy` while the cancel call is in flight. Extra classes `rt-run`, `rt-run-counts`, `rt-run-kpis` are unstyled hooks (red-team.css was not edited).
