# Inventory fragment: spec 18 results table and attack detail dialog

### red-team-results-table
`Frontend/src/features/red-team/ResultsTable.jsx` — default export `ResultsTable`; named export `VerdictBadge({verdict, source, control})` (rt-badge with `verdictLabel` tone, `rt-judged` for judge verdicts, en dash plus sr-only "Not scored" when missing). Imports `./red-team.css`. **Added by:** spec 18.

Props: `items`, `counts` {all, unsafe, defended, inconclusive, errors, controls}, `filters` {verdict, plugin, strategy, evidence}, `plugins`, `strategies` (arrays of `{id, name}` or plain strings), `page`, `pageSize`, `total`, `onFilterChange(nextFilters)`, `onPageChange(page)`, `onView(id, {input: 'pointer'|'keyboard'})`.

- `onFilterChange` receives the full next filters object. Verdict chip values: All `''`, Unsafe `'fail'`, Defended `'pass'`, Inconclusive `'inconclusive'`, Errors `'error'`, Controls `'control'` (the page maps this to `case_kind=control`, not a verdict). Evidence select values: `''`, `'policy'`, `'exact'`, `'judge'` (page maps to `verdict_source`).
- Chips are `rt-chip` with `aria-pressed`; the View button reads "View attack N" with N = `attack_index + 1`. Table uses `rt-table-region` + `data-label` cells; paging uses `Pagination` from `Surface.jsx`.

### red-team-attack-detail-dialog
`Frontend/src/features/red-team/AttackDetailDialog.jsx` — default export `AttackDetailDialog({result, loading, error, onClose, input, mode})`. Radix `DialogContent` with class `rt-dialog`, `DialogTitle` and `DialogDescription`; controlled by whether result/loading/error is present. **Added by:** spec 18.

- Content: ordered decision steps (decisive one in the verdict's tone), explanation, judge reasoning labelled "This is a judgement, not exact proof", original attack, "Sent to the model" only when `prompt` differs, reply as received, decoded reply, withheld or expired notice instead of any reply text, paired result from `paired`, labelled "Same attack without policies" for current `mode=protected`, otherwise "Same attack with policies", latency, tokens, cost.
- Focus returns to the element focused at open time on close. `data-input` is `input` prop if given, else pointer/keyboard from the last document event.
- Escape, backdrop click and Close call `onClose`; the parent clears `result` to close.

How spec 21 uses them: hold `filters`, `page`, selected id, detail, loading and error in `RedTeamPage.jsx`; reset `page` to 1 inside `onFilterChange`; on `onView(id, {input})` fetch detail then pass it as `result` (pass `input` through); pass `loading`/`error` while fetching; `onClose` clears state.
