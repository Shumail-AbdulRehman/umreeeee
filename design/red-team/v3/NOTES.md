# v3: independent critique and polish

Date: 2026-11-11. Status: ready for design approval; application code is unchanged.

## Review provenance

Two isolated agents reviewed an unchanged copy of v2. Neither read the other's output. Full reports are in `docs/planning/red-team/`.

- **Assessment A** (design-director review) scored the pre-polish prototype 25/40 on Nielsen's heuristics. Its AI-slop verdict was a pass, with two mild template tells: equal-weight KPI cards and an identical-card compliance grid. Cognitive load failed 4 of 8 checks, driven by about 32 editor decisions.
- **Assessment B** (deterministic evidence) ran the impeccable 4.1.0 detector (19 findings), axe-core 4.13.0 and 25 interaction checks in Chrome. It found one real bug: Raw mode did not hide "Run as" because `.field{display:grid}` overrode `hidden`. It also found one serious axe violation: scrollable tables were not focusable.

Detector exceptions accepted as non-defects: Inter is a fixed brand input; `.table-wrap` "cramped padding" is a divider with padded cells; the dialog shadow advisory is normal for a modal.

## Changes from v2

1. **The raw versus protected answer leads the report.** One risk card shows raw 9.4 Critical and with-policies 4.1 Medium side by side, with the reduction and trend stated. The plugin table has a "With policies" column. Every attack dialog shows the same attack with policies. Paired runs are grouped in the test list. "Decided" is demoted to a quieter card.
2. **The numbers and rules are now consistent.**
   - The editor's framework coverage is computed live from the selected plugins, so selecting none shows 0.
   - The compliance rule is stated: a control fails when any mapped attack worked.
   - The 80% pass threshold appears in the report as "Defended 78.4%, below the 80% threshold".
   - OWASP and ATLAS counts were recomputed from one plugin-to-control mapping.
   - ATLAS rows use tactic IDs (AML.TA00xx).
   - There is one "Not tested" label, with its reason.
   - Results use only strategies the run used.
   - The trend names the same test.
3. **Judged verdicts are visibly weaker evidence.** They show "Unsafe · judged" and "Defended · judged" badges with dashed borders. The attack-success card splits proven from judged. The dialog's decisive step is coloured by its verdict, and a defended example was added. Results lead with verdict filter chips.
4. **Missing states, in `states.html`:**
   - empty test list
   - test runner not active
   - cancelled run
   - failed run, with a recovery path
   - report without a judge
   - earlier-format report (its list row now links there)
   - a cancel confirmation dialog in `running.html`, listing the consequences
5. **The editor's load is reduced.**
   - Strategies are split into Encodings and Framing, and Plain is always sent rather than shown as a locked checkbox.
   - Seed and temperature moved into a closed "Advanced" section.
   - Threshold, seed and temperature are now number inputs with ranges.
   - Attacks per plugin is clamped to 1 to 10.
   - The warning is a `role="status"` region linked to the launch button.
   - "Save draft" gives feedback, and there is an explicit Cancel.
6. **Responsive layout.**
   - A menu button opens the navigation as a drawer at 960px and below.
   - Tables stack into labelled rows at 600px and below.
   - The plugin table no longer scrolls at desktop widths.
   - The sidebar rhythm is tightened so the active item is visible at 900px tall.
   - Mobile descriptions are 12px.
7. **Accessibility.**
   - Scroll regions are focusable and labelled.
   - The avatar label is valid.
   - "Not scored" is announced instead of a dash.
   - Tabs support Home and End.
   - The running page has a polite live "Updated" line.
   - Phone tap targets are 44px.
   - Raw mode now hides "Run as".
8. **Copy.** Jargon was replaced: "test runner" and "queue" instead of worker, dispatcher and broker, and "control questions" instead of benign controls. A "How these numbers are calculated" section explains attack success, risk and judged verdicts. Em dashes were removed from the copy.

## Verification after polish

Headless Chrome at 1440, 768 and 390 px on all five screens: no horizontal page overflow, no text under 11 px, no script errors. axe-core (WCAG 2 A/AA, 2.1 AA, 2.2 AA) found zero violations at 1440 and 390. The interaction checks all passed:
- Raw mode hides "Run as".
- Zero plugins and over-100 selections block launch with an announced message.
- Coverage recalculates.
- The cancel dialog opens and returns focus.
- The verdict filter shows the 3 unsafe sample rows.
- End selects the last framework tab.

Small targets left in place on purpose: checkboxes sit inside full-row labels, and the inline links inside sentences on `states.html` fall under the WCAG inline exception.

## Left for implementation

- **Framework control IDs and mappings:** ATLAS tactic IDs and the plugin-to-control mapping must be re-verified against the official OWASP, MITRE, NIST and EU sources.
- **Sample figures:** the risk numbers here are illustrative, not computed.
- **Not designed:** "Retry errored attacks" as a separate action (cloning covers re-runs) and column sorting.
