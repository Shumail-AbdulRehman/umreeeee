# v2: motion

Date: 2026-11-11. Stage: animate. Frozen after this stage. Copied from v1; only `styles.css`, `prototype.js` and the progress bar in `running.html` changed.

Most of the module does not move. Risk scores, counts, bars, the editor summary, tab panels and page loads change instantly: they are data the administrator is reading, or actions repeated tens of times a session. There is no pulsing "live" indicator, because a run updates by polling and a pulse would imply activity the page cannot see.

Tokens reused from the approved Prompt Studio v2: `--motion-fast` (160ms), `--motion-standard` (200ms), `--ease-out` (`cubic-bezier(.23,1,.32,1)`). No new motion tokens were added.

| Element | Trigger | Property | Duration | Easing | Purpose | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| Buttons | Press | transform scale(.97) | 160ms | `--ease-out` | Feedback | No scale; colour feedback only |
| Buttons | Hover | background, border, color | 160ms | ease | Feedback | Same (colour only) |
| Plugin rows, strategy chips | Hover, check | background, border | 160ms | ease | State indication | Same (colour only) |
| Table rows, links, tabs | Hover, select | background, color | 160ms | ease | Feedback | Same (colour only) |
| Judge fields | Judge toggle | opacity | 160ms | ease | State indication | Same (opacity only) |
| Attack detail dialog | Open/close by pointer | opacity, transform scale(.96 to 1), centred | 200ms | `--ease-out` | Preventing a jarring change | Opacity only |
| Attack detail dialog | Open/close by keyboard | none | 0 | - | Keyboard actions are immediate | Same |
| Dialog backdrop | With dialog | opacity | 200ms | `--ease-out` | Reads as one surface with the dialog | Same |
| Running progress bar | Poll result | transform scaleX | 250ms | linear | State indication | Instant |

Not animated, by decision: KPI numbers counting up, bar widths growing on load, tab panel crossfades, staggered row entrances, the "Judging" verdict badge, editor summary recalculation.

Feel-check left for review: the dialog's 200ms scale at 2-5x speed in DevTools, and the progress bar step size at real poll intervals (2 s).
