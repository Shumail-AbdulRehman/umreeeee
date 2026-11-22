# Assessment B: independent technical/browser evidence

Date: 2026-11-04. Target: `design/v3/` only. This assessment did not read Assessment A and made no design or frontend source edits. One CLI detector run was performed; it was not repeated.

## Reproducible artifacts

- `docs/planning/detector-v3.json`: complete CLI findings, exit code 2 (findings, not a crash).
- `docs/planning/evidence-browser-v3.json`: viewport geometry, axe nodes, interaction assertions and overlay console evidence.
- Tested a fresh Chrome/Playwright context using `/usr/bin/google-chrome`, with synthetic prototype content only.

## Mechanical counts

146 detector records: 139 warnings and 7 advisories. By rule:

| Rule | Count | Verified interpretation |
| --- | ---: | --- |
| undersized-ui-text | 105 | Real repeated text-size issue: 8–10px functional/history/meta/control copy. Same elements repeat across the three HTML screens. Increase functional labels to at least 11px, most controls to 12px, in v3. |
| tiny-text | 29 | Overlaps the same size issue; this is not 29 independent WCAG failures. Actual response prose is 13–14px. |
| icon-tile-stack | 4 | Inspect in context: mobile history control is beside its conversation heading, not a feature-card stack. Empty-state Averiq emblem is purposeful brand orientation; no repeated feature grid exists. These are contextual exceptions rather than evidence of template cards. |
| cramped-padding | 4 | The studio shell deliberately has no outside inset because its separately padded history, transcript and composer meet the shared dividers. Check each child, rather than adding a second inset to the shell. |
| overused-font | 4 | Inter is explicitly fixed by the incumbent Averiq brief/root DESIGN.md. A font swap would violate the refinement brief. |

CLI records identify rendered selectors/snippets at HTML line 0 and one stylesheet record, rather than reliable handwritten source line numbers. Scope fixes using the actual CSS selectors, not the repeated line-0 location.

## Accessibility findings

Desktop 1440×900: all three states returned zero axe violations for WCAG 2 A/AA, 2.1 AA and 2.2 AA rule tags.

Mobile 390×844: each state plus the opened generation-options state returned the same serious `summary-name` finding:

- Target: `.generation-options > summary` in `conversation.html`, `new-chat.html` and `blocked.html`.
- Cause: the visible Options text is hidden with `display:none` at the mobile breakpoint, and its SVG is aria-hidden. The summary has no accessible name.
- Fix: retain an accessible name (for example an explicit `aria-label="Generation options"` or visually hidden text) when reducing the visible control to an icon.
- This is one root defect observed in four scans, not four independent defects.

No page JavaScript errors occurred in these checks. No claim of comprehensive WCAG conformance is made.

## Responsive geometry and interactions

- No horizontal page overflow for all three states at 1440×900 and 390×844.
- Composer remained fully within the viewport for all six state/size combinations.
- Mobile Options and Send measured 35×36px, and native select heights were 36px. They exceed WCAG 2.2 AA's 24px base size but fall short of this skill's 44px touch-target quality floor. Increase mobile hit areas; do not call this an automatic WCAG AA failure.
- Native mobile history dialog received focus, trapped Tab cycling, closed on Escape and restored focus to its trigger.
- Stubbed clipboard success copied the exact code text and announced Copied. Stubbed clipboard rejection produced a useful select-to-copy fallback.
- The prototype's response-copy implementation uses rendered `.innerText`; the production plan requires raw original Markdown. This is an expected prototype/implementation distinction, but must not be copied into the app as the final behavior.
- Small follow-up: a successful copy changes the button's aria-label to Copied to clipboard; a later failure does not reset that label. Restore the action label or use a stable label plus the existing live region.
- A 300-character unbroken code line scrolled locally (317px client width, 2151px scroll width) without page overflow. The comparison table similarly scrolled locally (317px client width, 390px scroll width). Horizontal code scrolling was exercised, not only inferred from CSS.

## Overlay evidence and process cleanup

Mutable browser injection succeeded: title changed to `[Human] ...` and a temporary script executed. Started the skill live server on loopback port 8400, injected its `detect.js` in three separate navigations and recorded console summaries: conversation 35, new-chat 30, blocked 33 browser anti-pattern records. These rendered counts are distinct from the single 146-record CLI scan and must not be summed together.

The overlay was injected into this assessment's own headless tab. No human-visible overlay in the user's browser is claimed. The live server was stopped using `impeccable live-server stop --keep-inject`; no source injection or design edit was made. Parent-owned static server on port 5188 was left intact.

## Limits

This is a visual prototype audit, not production Markdown or backend verification. It does not exercise real API contracts, authentication, real mobile virtual keyboards, physical touch hardware, output-withholding code, clipboard permissions outside this browser, or a Markdown parser. Unit/security and application-flow tests belong in the eventual implementation specs. Review findings are saved before parent synthesis so they cannot anchor Assessment A.
