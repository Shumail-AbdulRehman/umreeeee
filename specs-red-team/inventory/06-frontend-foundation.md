# Inventory fragment: spec 06 frontend foundation

### red-team-css
`Frontend/src/features/red-team/red-team.css` — feature stylesheet. `:root` defines every `--rt-*` alias from DESIGN-SYSTEM.md (`--rt-canvas`, `--rt-surface`, `--rt-surface-subtle`, `--rt-line`, `--rt-line-subtle`, `--rt-ink`, `--rt-ink-secondary`, `--rt-ink-muted`, `--rt-accent`, `--rt-accent-soft`, `--rt-success`, `--rt-success-soft`, `--rt-success-line`, `--rt-danger`, `--rt-danger-soft`, `--rt-danger-line`, `--rt-critical`, `--rt-warning`, `--rt-warning-soft`, `--rt-warning-line`, `--rt-bar-track`) plus `--rt-motion-fast`, `--rt-motion-standard`, `--rt-ease-out`. Shared classes, all `rt-` prefixed. **Added by:** spec 06.

Classes:
- Typography and utilities: `rt-page-title`, `rt-muted`, `rt-mono`, `rt-num`, `rt-nowrap`, `rt-empty`, `rt-sr-only`, `rt-mark`.
- Panels: `rt-panel`, `rt-panel-head`, `rt-panel-title`, `rt-panel-body`, `rt-panel-note`, `rt-panel-foot`.
- Badges (verdict, status, level, severity, mode, control status): `rt-badge` plus one tone class, optional `rt-badge-sm` (11px), `rt-judged` (dashed border for judge verdicts).
- Tones, for badges, banners and chips: `rt-tone-pass`, `rt-tone-fail`, `rt-tone-warn`, `rt-tone-accent`, `rt-tone-critical`, `rt-tone-neutral`.
- Banners: `rt-banner` plus a tone class.
- Bars and scales: `rt-bar` (72px inline; `rt-wide` for full width; `rt-bar-risk` for danger fill; the child `span` width is set inline as a percentage), `rt-scale` (critical fill), `rt-progress` (child `span` uses `style="--rt-progress: 0.46"`, scaled with `transform` at 250ms linear).
- KPI: `rt-kpi-value` (flex row), `rt-kpi-of` (the "/ 10" suffix).
- Filter chips: `rt-chip`, active when `aria-pressed="true"`; 44px tall below 600px.
- Tables: `rt-table-region` (focusable, labelled scroll wrapper, `position: relative`), `rt-table` (min-width 720px). Below 600px the table stacks into rows, and every cell needs `data-label` for its column heading. `rt-num` on a `th` or `td` right-aligns it on desktop.
- Dialogs: `rt-dialog` (760px, 12px radius, 20px/50px elevation, `::backdrop` tint). Set `data-input="pointer"` or `"keyboard"`; keyboard opens with no transition.
- Press: `rt-press` (scale .97 on `:active`, 160ms).

How specs 13-19 use them:
- Spec 13 (test list) and 18 (results): `rt-table-region` with `tabindex="0"` and `aria-labelledby`; `rt-table`; `rt-badge` with `labels.js` tones; `rt-chip` for filters.
- Spec 14 (editor): `rt-panel`, `rt-panel-head`, `rt-panel-body`, `rt-panel-title`, `rt-banner` for the validation message.
- Spec 15 (running): `rt-progress` (set `--rt-progress` from the percentage), `rt-badge` with `statusLabel`, `rt-dialog` for cancel confirmation (`rt-tone-fail` on the consequence banner).
- Spec 16 (report summary): `rt-kpi-value`, `rt-kpi-of`, `rt-scale`, `rt-bar rt-bar-risk`, `rt-badge` with `levelLabel`.
- Spec 17 (compliance): `rt-badge` with `controlStatusLabel`; `rt-panel`.
- Spec 19 (report states): `rt-banner` with tone classes; `rt-empty`.

### red-team-labels
`Frontend/src/features/red-team/labels.js` — pure display maps. Each helper returns `{label, tone}` (verdict adds `judged: boolean`; missing values add `missing: true`). Tones: `pass`, `fail`, `warn`, `accent`, `critical`, `neutral`, matching the `rt-tone-*` classes. **Exports:** `notScored` (the string `'Not scored'`), `verdictLabel(verdict, {verdict_source, control})`, `statusLabel(status, percent)`, `levelLabel(level)`, `severityLabel(severity)`, `modeLabel(mode)`, `controlStatusLabel(status)`, `evidenceSourceLabel(source)`. **Added by:** spec 06.

How later specs use it:
- Verdicts: pass the result's `verdict` and `verdict_source`. Set `control` for control cases so `pass` reads "Answered". `pending` (or `judging`) reads "Judging". Judged results read "Unsafe · judged" and set `judged: true`, so the badge can add `rt-judged`.
- Statuses: `statusLabel(status, percent)`. Running with a percentage reads "Running · 46%".
- Levels: `levelLabel` accepts Critical, High, Medium, Low and None in any case.
- Missing values: when `missing` is true, render the visible en dash inside `aria-hidden`, plus `<span class="rt-sr-only">{notScored}</span>`.
- Unknown values fall back to `readable` text; the helpers never return undefined.
- Control status keys: `failed`, `passed`, `not_tested`.
- Evidence sources: `policy`, `exact`, `judge`.

### red-team-motion-tokens
`--rt-motion-fast` (160ms), `--rt-motion-standard` (200ms) and `--rt-ease-out` (`cubic-bezier(.23, 1, .32, 1)`) are defined in `red-team.css`. They are timings, not colours. Components should use these, not restate the values. **Added by:** spec 06.
