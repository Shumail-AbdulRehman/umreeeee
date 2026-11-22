# Red Team design system

Source: design/red-team/v3 (approved 2026-11-11), built on design/v3 (Prompt Studio, approved 2026-11-04). User approval: "approve now write an impmenntation plan for it make sure its detailed". Root `DESIGN.md` governs the rest of the app.

## Direction

A calm Operate-mode admin module. The report answers three questions in order: how risky is this model, what broke, and do our policies fix it. Evidence is named on every verdict. Avoid cyber-security theatre, decorative dashboard cards, gauges that hide numbers, fake live activity and any implication that a passing report certifies safety.

## Colour tokens

Prototype values from `design/red-team/v3/styles.css`. The app implements them through incumbent aliases from `Frontend/src/index.css` (right column); feature CSS uses the alias, never the value.

| Token | Value | Use | App alias |
| --- | --- | --- | --- |
| `--canvas` | `#f7f7fb` | Page background | `--bg` |
| `--surface` | `#fefeff` | Panels, dialogs | `--panel` |
| `--surface-subtle` | `#f4f4f7` | Table heads, paired rows, code blocks | `--panel-2` |
| `--line` | `#e0e0e8` | Borders | `--line` |
| `--line-subtle` | `#ebebf1` | Row dividers | `--line-2` |
| `--ink` | `#25252e` | Primary text | `--ink` |
| `--ink-secondary` | `#575763` | Body text | `--ink-2` |
| `--ink-muted` | `#686875` | Metadata, labels | `--ink-3` |
| `--accent` | `#5741bf` | Primary actions, selection, focus | `--indigo` |
| `--accent-soft` | `#f0edfc` | Selected chips and rows | `--indigo-bg` |
| `--success` | `#176b52` | Defended, passed, with-policies rate | `--green` |
| `--success-soft` | `#e9f5ef` | Defended/passed badge fill | `--green-bg` |
| `--success-line` | `#c9e3d7` | Defended/passed badge border | `--rt-success-line` = `color-mix(in oklch, var(--green) 25%, var(--panel))` |
| `--danger` | `#a53043` | Unsafe, failed, High level | `--rose` |
| `--danger-soft` | `#fcf0f2` | Unsafe/failed badge fill, failed banner | `--rose-bg` |
| `--danger-line` | `#ecc9d0` | Unsafe/failed badge border | `--rt-danger-line` = `color-mix(in oklch, var(--rose) 25%, var(--panel))` |
| `--critical` | `#8f2337` | Critical level fill (white text), raw risk bar | `--rt-critical` = `color-mix(in oklch, var(--rose) 82%, var(--ink))` |
| `--warning` | `#7a5418` | Medium level, inconclusive, below threshold | `--amber` |
| `--warning-soft` | `#fdf5e7` | Medium/inconclusive fill, not-ready strip | `--amber-bg` |
| `--warning-line` | `#efdcb6` | Medium/inconclusive border | `--rt-warning-line` = `color-mix(in oklch, var(--amber) 25%, var(--panel))` |
| `--bar-track` | `#ebebf1` | Bar and scale tracks | `--line-2` |

Light mode only, matching the app. Level colours: Critical = `--critical` fill with surface text; High = danger soft; Medium = warning soft; Low = success soft; None = surface-subtle with muted text. Judged verdicts reuse the verdict colour with a 1px dashed border on `--panel`.

## Typography

Inter for UI (`--font-sans`), JetBrains Mono (`--font-mono`) for control IDs, attack text and replies. Scale: 11px badges and chips, 12px metadata and table heads, 13px body and table cells, 15px panel titles, 17px dialog titles, 24-30px KPI numbers (`font-variant-numeric: tabular-nums`), 25px page title (22px below 600px). Mobile descriptions stay at least 12px.

## Spacing, radii, elevation

4px base: 4, 8, 12, 16, 20, 24, 32. Panel padding 16-20px; table cells 12px x 12-16px. Radii: controls and badges 7px (badges 4px), panels 10px, dialogs 12px, filter chips fully rounded. Elevation only for dialogs and the mobile navigation drawer (`0 20px 50px` at 18% ink).

## Layout conventions

Existing app shell, sidebar and topbar are unchanged. Report: KPI row (risk card spans two of four columns at 1180px and up, full width below 600px), then plugin table beside the strategy panel (stacked below 1180px), then full-width compliance, results, method disclosure and limitations. Editor: form column plus a sticky 300px summary (stacked below 1180px). Tables scroll inside a focusable labelled region; below 600px they stack into labelled rows. The page never scrolls sideways.

## Component conventions

- Buttons: existing `ui/button` variants; primary for New test and Save and launch; outline for secondary; danger only inside the cancel confirmation.
- Verdict badges: Unsafe, Unsafe · judged, Defended, Defended · judged, Inconclusive, Error, Answered, Judging.
- Status badges: Draft, Queued, Running · NN%, Cancelling, Completed, Partially failed, Failed, Cancelled.
- Mode badge: Raw (neutral), Protected (accent soft).
- Every verdict shows its evidence text; the attack dialog lists the decision steps in order and highlights the decisive one in the verdict's colour.
- Destructive action (cancel test) uses a confirmation dialog that lists consequences; never `window.confirm`.
- Empty, not-ready, cancelled, failed, no-judge and earlier-format states follow `design/red-team/v3/states.html`.
- A missing value is announced as "Not scored" (visible en dash, screen-reader text).

## States and motion

From `design/red-team/v2/NOTES.md`: button press `scale(.97)` 160ms `--ease-out`; hover and selection colour transitions 160ms `ease`; attack dialog opacity plus `scale(.96 → 1)` 200ms `--ease-out` for pointer, none for keyboard; progress bar `scaleX` 250ms linear. Reduced motion removes all transforms. Data, counts, bars, tab panels and page loads never animate. Focus-visible: 2px accent outline, 2-3px offset.

## Accessibility floor

WCAG 2.2 AA: text contrast at least 4.5:1, focus visible on every control, 44px targets below 600px, labels on every field, warnings in `role="status"` linked by `aria-describedby`, scroll regions focusable and labelled, tabs with Arrow/Home/End, dialogs trap and restore focus. The approved prototype passed axe (WCAG 2 A/AA, 2.1 AA, 2.2 AA) with zero violations at 1440 and 390 px.
