# Red Team design system

Source: `design/red-team/v3/` (approved 2026-11-11). Adapted from `specs-red-team/DESIGN-SYSTEM.md`; the root `DESIGN.md` governs the rest of the app. Use `design/red-team/v2/NOTES.md` for motion provenance and `design/red-team/v3/NOTES.md` for accepted refinements.

## Direction

Calm Operate-mode admin UI. On a stored report prioritize what changed with policies, what evidence supports the decision, and what coverage is missing. No generic dashboard filler, decorative gauges, fake live activity or implied certification. State “Live evaluation is unavailable” where appropriate; distinguish fixtures, historical reports, absent data and zero.

## Colour tokens

Closed list: the swatches are from approved `design/red-team/v3/styles.css`, not new values for the app. Use the existing app aliases from `Frontend/src/features/red-team/red-team.css`, backed by `Frontend/src/index.css`. No raw values, palette classes, new tokens or local duplicates in UI specs or implementation.

| Role | Approved swatch | Existing feature alias | App base or existing derivation |
| --- | --- | --- | --- |
| Canvas | `#f7f7fb` | `--rt-canvas` | `--bg` |
| Surface | `#fefeff` | `--rt-surface` | `--panel` |
| Subtle surface | `#f4f4f7` | `--rt-surface-subtle` | `--panel-2` |
| Border | `#e0e0e8` | `--rt-line` | `--line` |
| Divider | `#ebebf1` | `--rt-line-subtle` | `--line-2` |
| Primary ink | `#25252e` | `--rt-ink` | `--ink` |
| Secondary ink | `#575763` | `--rt-ink-secondary` | `--ink-2` |
| Muted ink | `#686875` | `--rt-ink-muted` | `--ink-3` |
| Accent/focus | `#5741bf` | `--rt-accent` | `--indigo` |
| Selected background | `#f0edfc` | `--rt-accent-soft` | `--indigo-bg` |
| Success ink | `#176b52` | `--rt-success` | `--green` |
| Success fill | `#e9f5ef` | `--rt-success-soft` | `--green-bg` |
| Success border | `#c9e3d7` | `--rt-success-line` | Existing green/surface mix |
| Danger ink | `#a53043` | `--rt-danger` | `--rose` |
| Danger fill | `#fcf0f2` | `--rt-danger-soft` | `--rose-bg` |
| Danger border | `#ecc9d0` | `--rt-danger-line` | Existing rose/surface mix |
| Critical fill | `#8f2337` | `--rt-critical` | Existing rose/ink mix |
| Warning ink | `#7a5418` | `--rt-warning` | `--amber` |
| Warning fill | `#fdf5e7` | `--rt-warning-soft` | `--amber-bg` |
| Warning border | `#efdcb6` | `--rt-warning-line` | Existing amber/surface mix |
| Progress track | `#ebebf1` | `--rt-bar-track` | `--line-2` |

Light only. Critical uses surface ink on critical fill; high uses danger; medium warning; low success; none a neutral surface with muted ink. Keep text labels for every level. A graded decision may use the existing dashed border, but source is always available as text.

## Typography

Inter (`--font-sans`) for UI; JetBrains Mono (`--font-mono`) for identifiers, prompt and reply. Approved scale: 11px badges/chips, 12px metadata/table heads, 13px body/cells, 15px panel title, 17px dialog title, tabular KPI figures 24–30px, page title 25px (22px below 600px), mobile descriptions at least 12px.

## Spacing, radii, elevation

4px scale (4, 8, 12, 16, 20, 24, 32). Panel padding 16–20px; cells 12px × 12–16px. Use incumbent control (7px), badge (4px), panel (10px) and dialog (12px) radii and fully rounded filter chips. Elevation is reserved for dialogs and the mobile navigation drawer.

## Layout conventions

Keep the app's shell, sidebar and topbar. `tests.html` leads with readiness, filters and list; `new-test.html` is a form plus sticky 300px summary, stacked below 1180px. `running.html` leads with phase and progress, then provisional results. `report.html` keeps paired comparison prominent, then KPI row, plugin/strategy panels, compliance, results and method notes. Risk spans two of four columns at 1180px and up; below 600px use full-width KPIs and labelled table rows. Use focusable labelled local scrolling where needed; the page must not scroll sideways. `states.html` is the reference for empty, not ready, cancelled and failed states.

## Component conventions

- Use existing `ui/button`, inputs, badges, semantic table and Radix dialog; use one existing severity/status label map. Primary for New test/Save draft, outline for secondary, danger for the cancel confirmation only. Disabled launch has explanatory text, not a mystery button.
- Show source and evidence with every decision: policy block vs grader verdict, not “AI verdict.” Prompt/reply are plain text with a clear retention fallback. Missing score uses existing “Not scored” accessible text; rates of zero remain visible.
- Label loading, empty and failure separately. A cancel dialog names consequences and preserves finished results; never use `window.confirm`. Plain copy names the state and action rather than praising the user or the engine.

## States and motion

Reuse `--rt-motion-fast` (160ms), `--rt-motion-standard` (200ms) and `--rt-ease-out` from the feature stylesheet. Approved button press uses subtle scale; hover uses color transition; pointer dialog has brief opacity and scale, keyboard dialog avoids transform; progress updates may use the incumbent 250ms linear bar. Counts, results, panels and page loads do not animate. Reduced motion removes transforms and nonessential transitions. Visible 2px accent focus outline at 2–3px offset; never remove focus to make a prototype match.

## Accessibility floor

WCAG 2.2 AA target: 4.5:1 text contrast, 44px mobile control targets, labels on every field, visible focus, named/labelled scroll containers, status live regions and `aria-describedby` for associated errors. Tabs use Arrow/Home/End and named panels; dialogs trap, dismiss and restore focus. Focus must not jump on background polls. The prior approved prototype passed axe at 1440px and 390px; verify this refactor independently rather than inheriting that result.
