# Red Team v3 critique: Assessment B (deterministic evidence)

Target: `design/red-team/v3/` (tests.html, new-test.html, running.html, report.html, styles.css, prototype.js).
Raw evidence: `docs/planning/red-team/detector-v3.json`, `docs/planning/red-team/evidence-browser-v3.json`.
Scripts and screenshots: `/tmp/claude-1000/-home-shumail-umer-FYP-FYP-Part-1/0b901e85-ca2c-4b3b-b884-1e80899ba04b/scratchpad/critique-b/` (`evidence.cjs`, `followup.cjs`, `shots/`).
Brand inputs (Inter, JetBrains Mono, Averiq tokens, raw hex) are not counted as defects.

## 1. Tooling actually run

| Tool | Status |
|---|---|
| `npx impeccable --json …` | `npx --offline` failed (`ENOTCACHED`: the registry lookup is not cached). I ran the same package, impeccable 4.1.0, straight from the npx cache (`~/.npm/_npx/1a4eb60c8f6b0f89/node_modules/.bin/impeccable --json <4 files>`). Exit **2** (findings): 19 findings. The raw JSON is saved. |
| Playwright 1.64.0 + system Chrome 150 (`executablePath: /usr/bin/google-chrome`) | Run. I loaded each page over `file://` in a fresh context per page and viewport, and set the title to `[Human] …`. Viewports: 1440x900, 768x1024 and 390x844. |
| axe-core 4.13.0 (`Frontend/node_modules/axe-core`) | Run with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`. Coverage: every page at 1440 and 390; report with the dialog open (leak and judge); new-test with the warning showing. axe did not run at 768. |
| `npx impeccable live` | **Not run.** It requires creating `.impeccable/live/config.json` and injecting a script tag into project files, and this task forbids project edits. Instead I injected the same overlay engine (`detect-antipatterns-browser.js` from the installed impeccable plugin) with Playwright `addScriptTag` at 1440 and read the `[impeccable]` console group. No server was started, so there was nothing to stop. |

**Console errors:** the prototype logged none, and no page exceptions occurred. Every recorded error is axe-core's XHR preload of `styles.css`, which `file://` blocks under CORS. These errors appear only on runs where axe was injected; the 768 runs, which had no axe, are clean.

## 2. Detector findings (CLI, 19 total) with my verification

| Rule | Count (per page) | Verdict |
|---|---|---|
| `tiny-text` (11px body text) | 10 (tests 3, new-test 3, running 2, report 2) | **Partly real.** The 11px text at 1440 is meta chrome or chip copy: `.nav-section`, `.preview-label`, `.profile-avatar`, `.sev`, `.fw-tag`, `.strat-num small`, `.tabs [role=tab] span`, `.provisional`. That is acceptable for labels, but `.sev` (11px) sits next to `.level`/`.verdict` (12px) and the tab sub-counts carry data. **Real defect at ≤600px:** the inherited shell rule `.page-heading p{font-size:11px}` (styles.css line 7) shrinks the page description to 11px on phones. Because it is more specific than `.report-meta`, it also drops `p.report-meta` (mode, model, dates) on report and running from 12px to 11px. |
| `cramped-padding` (`.table-wrap` children flush against `border-top`) | 4 (tests 1, running 1, report 2) | **Contextual false positive.** The border is a section divider above a table. Every `th`/`td` has 10–12px x 16px padding, so no text touches the line. |
| `overused-font` (Inter) | 4 (1 per page) | **False positive.** Inter is a fixed brand input. |
| `gpt-thin-border-wide-shadow` (1px border + 50px blur) | 1 (report, `.attack-dialog`) | **Contextual, advisory.** A wide shadow is a normal elevation cue on a modal. If wanted, drop `border` on `.attack-dialog` or reduce to `0 16px 40px`. Not a defect. |

Browser overlay (`[impeccable]` console group, 1440): 3 findings on tests, running and report (tiny-text x2, overused-font) and 4 on new-test. The extra one is **`straggler`**: "cost." sits alone on the last line of `.sum-foot`. It is real but cosmetic. Fix: add `text-wrap:pretty` to `.sum-foot` (and `.section-help`, `.panel-foot`).

## 3. axe results (WCAG 2.0/2.1/2.2 A+AA)

**Violations**

| Rule | Impact | Where | Verdict |
|---|---|---|---|
| `scrollable-region-focusable` | serious | report.html @1440 and @390: `section[aria-labelledby="by-plugin"] > .table-wrap`; running.html @390: `.table-wrap` (Latest results) | **Real.** Both tables scroll horizontally but contain no focusable element. Chrome 130+ makes such scrollers focusable on its own; Safari and Firefox do not. The by-plugin table also scrolls **at 1440**: content needs 814px in a 778px column, and the cause is seven columns at 16px side padding plus `white-space:nowrap` on the first column (styles.css line 237). |

**Needs review (incomplete)**

- `aria-prohibited-attr` (serious): `span.profile-avatar[aria-label="Alex Morgan"]` in the topbar, on all four pages. **Real:** `aria-label` on a generic `span` is prohibited and is ignored by assistive technology.
- `color-contrast` (serious): `.limitations` (1440); dialog `pre` and `mark`; `.judge-note`; table cells at 390. Every one is marked "elmPartiallyObscured/Obscuring", meaning overlap or scroll, not a measured failure. I checked them with my own computed contrast sweep, which also covers hidden tab panels and the closed dialog. Results: **no AA failures** except the disabled "Previous" pager button (2.28:1 at opacity .5). Disabled controls are exempt under WCAG 1.4.3.
  - Minimum ratios in use: `--ink-muted` on `--surface-subtle` 5.00, `--ink-muted` on `--canvas` 5.14, `--success` on `--success-soft` 5.76, `--danger` on `--danger-soft` 6.08, `--warning` on `--warning-soft` 6.24, `mark` 6.47, white on `--critical` 8.46.

No violations on tests.html or new-test.html, including new-test with the warning visible.

## 4. Interaction assertions

25 assertions. 23 pass and 2 fail as written; one of the two failures is a real bug.

**FAIL, real bug: Raw mode does not hide "Run as".**
- `prototype.js` sets `hidden` on `label.field[data-subject]`, but `.field{display:grid}` (styles.css line 151) overrides the UA `[hidden]{display:none}`.
- The computed display stays `grid` and the field stays visible: 86px tall at 1440 and 92px at 390.
- Screenshots: `shots/new-test-raw-1440.png` and `shots/new-test-raw-run-as-still-visible-390.png`.

**FAIL as written, not a defect: dialog focus trap.**
- The native `showModal()` dialog contains one focusable element (the Close button), and Tab alternates Close → document/browser chrome → Close.
- No page element outside the dialog was ever reachable in 20 Tabs, and a scripted `.focus()` on a background tab was refused, so the background is inert. This is conforming native behaviour.
- Optional: wrap focus in JS if a strict loop is wanted.

**PASS**
- Dialog:
  - Enter on View opens the dialog with focus on Close.
  - Escape closes it and returns focus to the opener.
  - Clicking `data-open-attack="judge"` loads the judge content.
  - The Close button and a backdrop click both close the dialog and return focus to the opener.
- Tabs: click selects MITRE ATLAS. ArrowRight and ArrowLeft move between tabs, wrap in both directions and move focus. Exactly one `aria-selected=true` at a time, and `hidden`, computed display and `tabIndex` all stay consistent.
- Editor states:
  - The initial summary reads 96 attacks / 101 calls.
  - **Clear** disables "Save and launch" and shows "Choose at least one plugin.".
  - All plugins x all 8 strategies x 10 gives 640 attacks, shows the over-100 warning and disables launch.
  - Unchecking the judge disables both judge selects, sets `aria-disabled=true` and changes the summary to "None"; re-checking enables them again.
  - Raw mode updates the help text.
- Mode radiogroup: arrow keys move the selection and show a visible focus ring.
- Reduced motion: under `reduce` the dialog transform is `none` when closed, during opening (5 samples, 30ms apart) and when open. The control run without `reduce` shows `scale(.96 → 1)`.

**Observations (not asserted)**
- `[data-sum-warning]` has no `role="status"`/`aria-live`, and the submit button has no `aria-describedby`, so screen readers are not told why launch became disabled.
- `#per` has `max="10"` but the script accepts typed 50, producing 3,200 attacks; the warning still blocks launch.
- Home/End do nothing on the tabs. This is optional in the ARIA Authoring Practices Guide.
- `[role=tabpanel]` has no `tabindex="0"`; the NIST and EU panels contain no focusable content.

## 5. Responsive and target-size findings

**Overflow**
- No horizontal document overflow at any viewport, and no element sticks out past the viewport outside an intentional scroller.
- Intentional horizontal scrollers:
  - `.table-wrap` on tests (from 768 down; 796px of content), running (at 390) and report (all widths, see §3).
  - `.tabs` on report at 390 (599px in a 364px box).

**Text under 11px:** none at any viewport.

**Targets under 44x44 at 390** (deduplicated; the effective size uses the wrapping `label` for inputs):

| Selector | Size | Note |
|---|---|---|
| `.page-heading a.back-link` (new-test, running, report) | 71.8x18 | also under 24px; passes 2.5.8 only through the spacing exception |
| `article.kpi-compare > a` ("Compare attack pairs", report) | 328x18 | under 24px tall |
| `td > button.link-button[data-open-attack]` ("View", 8x on report) | 32.3x40 | |
| `.quick > button.link-button[data-select="none"]` ("Clear") | 34.5x40 | |
| `.quick > button.link-button[data-select="all"]` ("Select all") | 56x40 | |
| `.attack-dialog .icon-button[data-close-attack]` | 36x36 | dialog open at 390 |
| `.segmented label` (Mode) | visible pill 162x33.5 | The hit area is already 44px because `.field input{min-height:44px}` (line 232) also matches the transparent radio. The visual control is smaller than its hit area. |

**Already fine at 390:** `.btn`, `.btn-small`, `.toolbar select`, `.field input/select` (44px), tabs (61px tall), `.pick-row`, `.chip-check`, `.toggle-row` (58px or more).

**Dialog at 390:** fits (358x796), with no horizontal overflow; the `pre` blocks wrap. `.dialog-body` scrolls by 22px; Chrome puts it in the Tab order, but it has no `tabindex`.

**Shell at 1440x900:** the active "Red Team" `.nav-link[aria-current=page]` is clipped by the sidebar `nav` scroller: 2.5px of it is visible, and the `nav` content is 607px tall in a 569px box. This comes from the inherited shell, not the Red Team module.

## 6. Concrete fixes

1. **"Run as" stays visible in Raw mode.** Add `[hidden]{display:none!important}` to the base in `styles.css`, or at least `.field[hidden]{display:none}` beside `.field` (line 151).
2. **By-plugin table scrolls at 1440.** Add `.report-grid table.data th,.report-grid table.data td{padding-inline:12px}`, which saves 56px against the 36px shortfall, or remove `white-space:nowrap` from `.report-grid table.data td:first-child strong` (line 237).
3. **Scrollable regions without keyboard access.**
   - report.html: give the by-plugin `div.table-wrap` the attributes `tabindex="0" role="region" aria-labelledby="by-plugin"`.
   - running.html: give `div.table-wrap` the same attributes with `aria-labelledby="recent-title"`.
4. **Avatar label.** In all four HTML files, change `<span class="profile-avatar" aria-label="Alex Morgan">` to `role="img" aria-label="Alex Morgan"`, or replace the `aria-label` with `<span class="sr-only">`.
5. **Mobile copy size.** In `@media(max-width:600px)` (line 232), add `.page-heading p,.report-meta{font-size:12px}` to override the 11px shell rule on line 7.
6. **Mobile targets.** In the same media block (line 232):
   - Change `.link-button{min-height:40px}` to `.link-button{min-height:44px;min-width:44px;padding-inline:8px}`.
   - Add `.back-link{display:inline-flex;align-items:center;min-height:44px;margin-bottom:0}`.
   - Add `.kpi a{display:inline-flex;align-items:center;min-height:44px}`.
   - Add `.attack-dialog .icon-button{width:44px;height:44px}`.
   - Add `.segmented span{padding-block:12px}`, so the visible pill matches the 44px hit area.
   - Optionally scope the 44px input rule away from radios: `.field input:not([type=radio])`.
7. **Small labels (optional consistency).** Raise `.sev` (line 86) and `.tabs [role=tab] span` (line 128) to 12px to match `.level`/`.verdict`.
8. **Warning announcement.** In new-test.html, add `role="status"` to `p.sum-note[data-sum-warning]`, give it an id, and point `button[type=submit]` at it with `aria-describedby`. In `prototype.js`, clamp `per.value` to 1–10.
9. **Straggler.** Add `text-wrap:pretty` to `.sum-foot`, `.section-help` and `.panel-foot`.
10. **Shell (optional, outside module scope).** Bring the active nav item into view: tighten `.nav-section` margins (`25px 11px 10px` → `16px 11px 8px`), or call `scrollIntoView({block:'nearest'})` on `.nav-link[aria-current=page]` on load.
