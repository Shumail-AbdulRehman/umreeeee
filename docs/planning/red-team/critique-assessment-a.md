# Red Team v3: design critique, Assessment A

Date: 2026-11-11. Reviewer: independent LLM design-director review (Assessment A). Target: `design/red-team/v3/` (tests, new-test, running, report, styles.css, prototype.js). Inputs read: `design/red-team/brief.md`, `PRODUCT.md`, `DESIGN.md`, v1 and v2 `NOTES.md`. The detector output (Assessment B) was not opened.

Method: read every file, then rendered all four pages in headless Chrome (fresh context, file:// URLs) at 1440x900, 1280x800, 768x1024 and 390x844. Opened the attack dialog from `data-open-attack="leak"` and `"judge"`, checked focus return on Escape, tab order through the editor, tablist arrow keys, editor edge states (zero plugins, 320 attacks, judge off, raw mode), text sizes, target sizes, contrast of secondary text and badges, and horizontal overflow per table. Screenshots and scripts: `/tmp/claude-1000/-home-shumail-umer-FYP-FYP-Part-1/0b901e85-ca2c-4b3b-b884-1e80899ba04b/scratchpad/critique-a/`.

Fixed inputs (Inter, JetBrains Mono, graphite sidebar, violet accent, Averiq tokens) are respected and are not critiqued.

Note: `v3/` is byte-identical to `v2/` apart from the missing `NOTES.md` (`diff -rq v2 v3`). No v3 polish has been applied yet, so this critique is effectively of v2.

---

## AI slop verdict

**Pass. This does not read as AI-generated.** It is a restrained product-register screen set that looks like the rest of Averiq: no gradient text, no glassmorphism, no side-stripe borders (`.c-fail` and `.decisive` use full borders and fills, not stripes), no cyber theatre, no motion on data, no pulsing "live" dot. Copy is plain and specific ("You can leave this page; the test keeps running.").

Two mild template tells remain:
- **The four-card KPI row** on `report.html` (`.kpi-grid`) is close to the hero-metric template: four equal cards, big number, small label. Each card has an explanation under it, which saves it, but the cards are equally weighted when they should not be (see P1-1).
- **The compliance grid** (`.control-grid`) is ten nearly identical bordered cards in two columns. It is a status list styled as a card grid. A dense list or table row per control would read faster and take half the height.

---

## Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Readiness bar, honest progress and "Provisional" labels are strong. The running page has no "Updated N s ago", and "Save draft" gives no feedback. |
| 2 | Match with the real world | 3 | Plain copy overall. Jargon leaks in: "Worker / Dispatcher / Broker", "Benign controls", "promptfoo scoring model", "Seed", "Temperature", "Low effort". |
| 3 | User control and freedom | 2 | "Cancel test" has no confirmation and no cancelled state. The editor has no Cancel or Discard. The results filters have no "Clear filters". |
| 4 | Consistency and standards | 2 | Data and rule contradictions across screens (see P1-2). "Not testable" and "Not tested" are both used. The NIST and EU tabs have no counts. Every ATLAS control ID reads "ATLAS". |
| 5 | Error prevention | 2 | The over-100 and zero-plugin guards are good. Pass threshold, seed and temperature are free-text inputs. Cancel is unguarded. |
| 6 | Recognition rather than recall | 3 | Evidence is named on every verdict and the summary stays visible. Raw and protected runs are separate rows and separate reports, so comparing them relies on memory. |
| 7 | Flexibility and efficiency | 2 | Has filters, Select all/Clear and Clone as protected. No table sorting, no previous/next in the dialog, no re-run, and "Compare attack pairs" leads nowhere. |
| 8 | Aesthetic and minimalist design | 3 | Calm and dense. The KPI row is equally weighted. The strategy panel leaves a large empty area. The risk scale bar repeats the number. |
| 9 | Recognise, diagnose, recover from errors | 2 | Row errors ("Provider timed out") and the over-100 message are specific. A failed test, a "not ready" worker, editor field validation and retrying errored attacks are not designed. |
| 10 | Help and documentation | 3 | Good inline help: grading steps, field help, panel footers, limitations note. Nothing explains risk scoring or the judge rubric beyond a library name. |
| | **Total** | **25 / 40** | **Acceptable.** A solid foundation, with gaps in consistency, recovery and the policy comparison. |

---

## Cognitive load

Checklist failures: **4 of 8 (high).**

| Item | Result | Note |
|---|---|---|
| Single focus | Pass | Each page has one job. |
| Chunking (4 or fewer per group) | **Fail** | 8 strategy chips in one flat grid. The summary has 5 rows plus 4 framework rows. |
| Grouping | Pass | Plugins are grouped by risk area. Sections are clear. |
| Visual hierarchy | Borderline pass | The editor is clear. On the report, four equal KPI cards give "Decided" the same weight as "Overall risk" and "With policies". |
| One thing at a time | Pass | A single long form is acceptable for this audience, with defaults pre-set. |
| Minimal choices (4 or fewer per decision) | **Fail** | 8 plugins, 7 selectable strategies, and 4 results filters. |
| Working memory | **Fail** | To learn whether policies fix a plugin, the user must remember the raw report's numbers and open a different report. |
| Progressive disclosure | **Fail** | Seed, temperature, pass threshold and judge model are always visible. Framework tags show on every plugin row. |

Options at each editor decision point:

| Section | Options | Assessment |
|---|---|---|
| Target | 5 (name, integration, model, 2-way mode, run as) | Acceptable |
| What to attack | 10 (8 plugins, Select all, Clear) | Overloaded, though defaults help |
| How attacks are disguised | 8 (7 selectable, Plain fixed) | Overloaded and ungrouped |
| Grading | 3 (toggle, 2 selects) | Good |
| Run settings | 4 (2 of them expert-only) | Borderline |
| Summary | 2 actions | Good |

That is about 32 decisions on one page. They are pre-filled, which is why it stays usable.

---

## What's working

1. **Evidence-first verdicts.** Every result names its evidence ("Marker found after decoding", "Refusal word", "LLM judge", "Judge could not decide"). The dialog's three ordered steps (Policy check, Exact evidence, LLM judge) highlight the decisive step and mark skipped ones ("Not used in raw mode", "Not needed"). The judge example says "This is a judgement, not exact proof." This is the strongest part of the module and meets the brief.
2. **Honest arithmetic and status.** Report numbers reconcile: 88 decided = 71 exact + 17 judge; 8 not counted = 6 inconclusive + 2 errors; plugin and strategy rows both sum to 19 of 88; 23 judge calls = 17 + 6. The running page refuses to show a partial risk score ("Calculated when the test finishes…"), tags provisional figures, and the pace note explains the time remaining from the real 6 requests per minute limit. "Synthetic test coverage, not certification" and the Limitations line state the framing correctly.
3. **Accessible plumbing.** Skip link, visible 2px focus on every control, a real `<dialog>` that returns focus to its opener on Escape, a tablist with roving tabindex and arrow keys, sr-only labels on toolbar selects, and every badge carries a text label. Secondary text measured 5.0 to 8.5:1 and nothing functional is below 11px. Reduced motion is handled, and keyboard-opened dialogs skip the animation.

---

## Priority issues

### P1-1. The report does not answer "do our policies fix it"

**What.** The protected result is a single card (`.kpi-compare`: "4.1 / 10 Medium, 3.4% attack success"). Its only link, "Compare attack pairs", points to `report.html`, the page itself. The plugin table, strategy list, compliance grid and dialog show raw results only. In `tests.html` the raw and protected runs of "Support bot · weekly baseline" are two unrelated rows with identical names.

**Why it matters.** This is one of the brief's three core questions, and the module's reason for existing ("compare it with your policies turned on"). Right now the admin cannot see which plugins the policies fixed and which they left open without flipping between two reports and remembering numbers. That fails the working-memory check.

**Fix.**
- `report.html` `.kpi-grid`: make the first and fourth cards one wider comparison card: "Raw 9.4 Critical → With policies 4.1 Medium", with 21.6% → 3.4% beneath. Demote "Decided" to a line under "Attack success" (for example "88 of 96 decided · 8 not counted").
- `#by-plugin` table: add a "With policies" column (risk plus level), or a "Raw → Protected" risk pair, and sort by the remaining protected risk.
- Make "Compare attack pairs" go to a real paired view: the Results table filtered to attacks that worked raw, with a "With policies" verdict column.
- `.attack-dialog`: add a fourth block "Same attack with policies" showing the protected verdict and the policy that blocked it.
- `tests.html`: group a raw/protected pair into one row. The Mode cell lists both, the Risk cell shows "9.4 Critical → 4.1 Medium", and both runs stay reachable from the row.

### P1-2. Contradictory data and rules undermine trust in a trust product

**What.**
- **Compliance verdict rule.** OWASP LLM06 is marked "Failed" at "1 of 21 attacks worked" (95% defended). The editor's "Pass threshold 80%" (`new-test.html`, Run settings) never appears in the report. The real rule appears to be "any attack worked = Failed", and it is stated nowhere.
- **Editor framework coverage** (`.sum-frameworks`) is static.
  - It claims OWASP 6 of 10. The plugin tags cover 5 OWASP items (LLM01, 02, 05, 06, 07) and the report's OWASP tab shows 5 tested.
  - It claims ATLAS 4 of 6. The report shows 5 tested.
  - With zero plugins selected it still shows 6 of 10, 4 of 6, 7 of 21 and 5 of 14 (verified in the browser).
- **Strategy mismatch.** Results row #40 uses strategy "Hex", but the run's strategies (Success by strategy, 88 decided) are Authority, Role-play, Base64 and Plain only.
- **Trend baseline.** The trend "4.4 points vs Oct 28 (26.0%)" compares against "Support bot · October baseline", a differently named test. Nothing says the configuration matched.
- **ATLAS IDs.** Every ATLAS `.control-id` reads "ATLAS", so the ID column carries no information.
- **Two "not run" labels.** "Not testable" (LLM03) and "Not tested" sit side by side. The brief asks for "Not tested" with a reason.
- **Static judge-call count.** The judge-call default in the HTML is "up to 25", but the script computes 24.

**Why it matters.** Administrators will compare these numbers. One visible contradiction makes every other figure suspect, and the brief forbids implying certification. A "Failed" that ignores the user's own threshold, or a "Passed" based on 10 attacks, needs its rule stated.

**Fix.**
- `#compliance-title` `.panel-note`: state the rule, for example "Failed = at least one attack worked. Passed = none worked out of N." Or apply the pass threshold and show it, for example "Threshold 80% defended: met / not met" in the report meta row.
- `prototype.js` `update()`: compute `.sum-frameworks` from the checked plugins' mappings and show "None" at zero plugins.
- Results row #40: change the strategy to one the run actually used.
- Trend line: write "Down 4.4 points from 26.0% (previous run of this test, Oct 28)". If the configuration differs, say so.
- `.control-id`: use real ATLAS tactic IDs.
- Use "Not tested" with a reason everywhere, and remove "Not testable".

### P1-3. Tablet and phone lose navigation and the columns that matter; the plugin table clips at 1440

**What.**
- **No navigation at 960px and below.** `.global-sidebar{display:none}` and `.breadcrumb{display:none}` apply, and the topbar offers no menu trigger. At 768 and 390 the only way out is the "← Red Team" back link. DESIGN.md requires a navigable sidebar dialog on mobile.
- **Key columns scroll off-screen at 390.**
  - `#by-plugin` shows Plugin, Severity and Decided. Attack success, Risk and Worst strategy are hidden.
  - Results shows #, Plugin and Strategy, with Verdict cut in half and View off-screen.
  - The tests list hides Overall risk and Attack success.
- **Clipping on laptops.** The plugin table clips at 1440: the `.table-wrap` scrollWidth is 814 against a clientWidth of 778, so the "Worst strategy" header is cut and "No attack worked" wraps to two lines. At 1280 it is 814 against 670.

**Why it matters.** The answer columns (Risk, Verdict) are the ones that disappear. A reader on 1280 or 1440 sees a clipped header on the first screen of the report.

**Fix.**
- **Navigation.** Add a menu button to `.topbar` below 960px that opens `.global-sidebar` as a modal dialog. The pattern already exists as `.history-trigger` in Prompt Studio.
- **Column order.** In `#by-plugin` use Plugin, Risk, Attack success, then the rest. In Results use #, Verdict, Plugin, Strategy, Evidence, View.
- **Phone layout.** At 600px and below, render `table.data` rows as stacked two-line rows: name and verdict on line 1, meta on line 2. Alternatively make the first column sticky.
- **Desktop overflow.** Remove `min-width:720px` for `.report-grid table.data`, or move "Worst strategy" under the plugin name as `<small>`, or switch `.report-grid` to one column below about 1500px.

### P2-4. Missing states the brief lists

**What.** The prototype does not design these states:
- an empty test list
- a failed test
- a cancelled run, and a confirmation before "Cancel test" (`.btn-danger-quiet`, `running.html`)
- the readiness bar when the worker or broker is down
- a report produced without a judge
- an earlier-format report. Its row in `tests.html` links to the new-format `report.html` and puts "Compliance 62% · earlier format" in the Overall risk column.
- results-level retry for "Error" rows
- a "last updated" time on the running page

Zero plugins and over 100 attacks are handled well: a warning plus a disabled "Save and launch".

**Why it matters.** These are the moments when admins most need honest guidance, and the "queue/worker" model makes not-ready and failed states likely.

**Fix.**
- `tests.html` empty state: one line explaining what a test does, plus a "New test" button.
- Readiness bar variants. Amber "Worker not seen for 5 min. Tests will queue until it returns." Rose "Broker unreachable. New tests cannot start", with "New test" disabled and its reason.
- `running.html`:
  - "Cancel test" opens a confirm that says "Finished results are kept; the report will be marked Cancelled with no overall risk".
  - Add a cancelled variant of `.progress-panel`.
  - Add "Updated 4 s ago" to `.progress-head`.
- `report.html` failed or cancelled banner above `.kpi-grid` naming the cause, for example "Stopped at 46 of 101: provider quota exceeded", with "Re-run".
- No-judge report: the "Decided" copy reads "No judge used: 14 undecided results are inconclusive and not counted".
- Earlier-format report: show the old compliance figure under its own label, with "Re-run in the current format".
- Error rows: add "Retry errored attacks (2)" to the Results toolbar.

### P2-5. Judge verdicts look identical to proof, and "what broke" is not first

**What.**
- In Results, "Unsafe" from the LLM judge uses the same `.v-unsafe` badge as "Unsafe" from an exact marker. Only the Evidence column differs.
- In the dialog, `.evidence-steps .decisive` is always danger-red, so a judged verdict looks exactly as certain as a leaked marker. A decisive "Defended" step would also turn red.
- "Attack success 19 of 88" does not split proven from judged.
- Results default to attack-number order with all verdicts, so "what exactly broke" sits under an unfiltered list of 101.

**Why it matters.** The brief requires judge verdicts to be visibly labelled as judgements, not proof. Separately, the fastest route to "what broke" should be one glance.

**Fix.**
- Add a judged variant of the verdict badge: "Unsafe · judged", with a dashed border reusing the `.provisional` treatment.
- Colour `.decisive` from the verdict: danger for unsafe, success for defended, and a neutral or violet tint when the decider is the judge.
- In the Attack success card, add "13 proven by evidence, 6 judged".
- Default the Results "Verdict" filter to "Unsafe", sort by plugin risk, and add a count such as "19 unsafe · 61 defended · 6 inconclusive · 2 errors" next to `#results-title`.

### P2-6. Editor: expert settings always visible, free-text numbers, flat strategy grid

**What.**
- Pass threshold, Seed and Temperature are free-text `<input>`s with no type, unit or range (`.field-grid.four`).
- The eight strategies are a flat `.chip-grid`, and "Low effort" or "Medium effort" is never explained.
- The disabled "Save and launch" has no `aria-describedby` pointing at `[data-sum-warning]`.
- The warning is not a live region.
- "Benign controls 5" is unexplained.

**Why it matters.** Invalid input such as "eighty" or a temperature of 7 is possible. The strategy grid exceeds the four-option guideline. A screen-reader user is not told why launch is disabled.

**Fix.**
- Move Seed, Temperature and Pass threshold into a `<details>` "Advanced" block inside `#s-run`, closed by default.
- Use `type=number` with min, max and step, and a "%" suffix for the threshold.
- Split strategies into two labelled fieldsets: "Encodings" (Base64, ROT13, Leetspeak, Hex) and "Framing" (Plain, Role-play, Hypothetical, Authority).
- Replace "Low effort" with "Easy for a person to try" and reuse the same wording in the report footer.
- Give the submit button `aria-describedby` pointing at the warning, and give `.sum-note` `role="status"`.
- Add a tooltip or help line: "Benign controls: normal requests that should be answered, to catch over-blocking."

---

## Persona red flags

**Alex, impatient power user (admin).**
- Cannot step through results in the dialog. There is no previous/next, so each attack is open, read, Escape, find the next "View".
- No column sorting in any table. "Sorted by risk" is fixed.
- "Compare attack pairs" is a dead self-link.
- No "Re-run" or "Duplicate" on a finished report. Only "Clone as protected" exists.
- Has to scroll past 8 plugins and 8 strategies even when only adjusting the target. A saved "default plan" or "copy settings from last run" is missing.

**Sam, keyboard and screen-reader user.**
- The running page updates by polling with no `aria-live` region, so progress and new results change silently.
- The disabled "Save and launch" gives no reason.
- Table placeholders "—" are read as "em dash" rather than "Not scored yet".
- `.profile-avatar` has `aria-label` on a role-less `<span>`, which most screen readers ignore.
- The tablist lacks Home and End keys.
- Below 960px there is no navigation at all.
- On the plus side, focus is always visible, the dialog returns focus, and the tablist arrows work.

**Riley, stress tester.**
- Selecting zero plugins leaves framework coverage at "6 of 10". The summary lies.
- The trend compares against a differently named test.
- An "Error" row has no retry.
- Cancelling mid-run goes nowhere.
- The earlier-format row opens a current-format report.
- "View" on a "Defended" row (#18) opens "Unsafe: the hidden marker leaked". This is a prototype shortcut, but it shows the dialog has only an unsafe template. Defended, inconclusive and error dialogs are undesigned.

---

## Minor observations

**Targets and sizing**
- `.link-button` "View" is 28px tall on desktop and 40px on phones (below 44).
- `.back-link` and the "Compare attack pairs" link are 18px tall.
- The dialog close `.icon-button` is 36px on phones.
- The page gutter is 12px at 390px.

**Navigation**
- The breadcrumb ("Evaluate > Red Team > Report") and the "← Red Team" back link duplicate each other on desktop. Keep one.
- All sidebar links in the prototype point to `tests.html`. The Settings icon is a plus-in-circle, which reads as "add".

**Copy**
- The Mode filter's "Raw and protected" option should read "All modes".
- The dialog shows only the decoded reply for encoded attacks. Show the raw reply too (collapsed) so the decoding is auditable.
- The judge dialog omits "Original attack", while the leak dialog shows it. Keep the blocks consistent.
- "Risk follows the promptfoo scoring model" names a library rather than explaining. Prefer "Risk combines severity, how often attacks worked, and how easy the strategy is for a person."
- "Worst plugin 8.6, plus 0.75 because four plugins are High" is honest but cryptic. Consider "Highest plugin risk 8.6, raised to 9.4 because 4 plugins are High."
- Readiness copy: "Worker seen 12 s ago · Dispatcher seen 8 s ago · Broker reachable" is infrastructure language for an org admin. Lead with "Ready to run" and put the parts behind a details toggle.
- Middots (·) are used as separators in names, meta lines and chips. Overuse makes test names like "Support bot · weekly baseline" look like breadcrumbs.

**Layout and visuals**
- The `.scale` bar under the risk number repeats the number (it is `aria-hidden`, which is fine). It could go to save space.
- The strategy panel leaves a large empty area beside the tall plugin table at 1440.
- The NIST and EU tabs have no count line, unlike OWASP and ATLAS, and their panels are placeholders.

**Data presentation**
- The running page's latest-results table shows "Judging" with a violet badge identical to the "Running" status. That is fine, but give it the same "Provisional" wording.
- Em dashes appear only as empty-cell glyphs (`tests.html`, `running.html`). Prefer "Not scored" or "Pending" text.

**Process**
- `v3/` has no `NOTES.md` and is identical to `v2/`. The impeccable stage has not produced output yet.

---

## Questions to consider

1. Should a "test" be a pair by default? If comparing against policies is the module's purpose, could every test run raw and protected together and report them as one?
2. What is the compliance pass rule, and does the user's pass threshold drive it? If the rule is "any success fails", what is the threshold for?
3. Is 10 attacks enough to print "Passed" next to an OWASP control? Would "No attack worked (10 tried)" be more honest than a green "Passed"?
4. Should judged verdicts count in Attack success at full weight, or should the headline show a range (proven only, up to proven plus judged)?
5. Who is the reader of the report? A security lead reviewing weekly would want the trend and the protected delta first. A first-time admin would want "what should I do next" (for example "Assign a guardrail policy covering prompt leakage"). Neither currently gets a next-step action.
6. Does the readiness bar need to exist on the list at all once things are healthy, or only appear when something is wrong?
