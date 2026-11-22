# Inventory fragment: spec 13 test list

### red-team-test-list
`Frontend/src/features/red-team/TestList.jsx` — default export `TestList`, a controlled landing view (readiness strip, search, status and mode selects, New test button, grouped tests table, Pagination). Imports `./red-team.css`. No fetching, no debouncing. **Added by:** spec 13.

Props:
- `items`, `total`, `page`, `pageSize` (default 20), `onPageChange(page)`.
- `query`, `status`, `mode` (strings, `''` = all) and `onFilterChange(next)`; `next` is always the full `{query, status, mode}` object with the changed key replaced. Clear filters calls it with all three `''`. Page reset on filter change is spec 21's job.
- `readiness`: `{ state: 'ready' | 'waiting', lastSeenSeconds, queueConnected, requestsPerMinute }`, or omitted to hide the strip. `waiting` renders a `role="status"` banner.
- `onNew()`, `onOpen(testId)`.

Test item fields read: `id`, `name`, `model` / `provider` (fallback `config_snapshot.model` / `.provider`), `mode`, `status`, `progress.{total_jobs, terminal_jobs}` (running percent), `created_at`, `comparison_group_id`, `format`, `summary.risk.{score, level}`, `summary.attack_success.rate` (fraction 0-1), legacy `score` (number or `score.compliance_score`, fraction; shown as "Earlier format · compliance N%"). Missing values render an aria-hidden en dash plus sr-only "Not scored".

Grouping: items sharing `comparison_group_id` render in one `<tbody>`, raw first, the rest as "With policies" rows (accessible name "With policies, <test name>"). Groups keep first-appearance order. Page size applies to items, so a group split across pages shows alone.

Spec 21: fetch `listRedTeamTests({ page, q?, status, mode })`, own debounce on `query`, map readiness, `onNew` opens the editor (spec 14), `onOpen` routes by status (draft to editor, running to spec 15, else report).
