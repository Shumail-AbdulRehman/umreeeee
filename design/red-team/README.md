# Red Team module design review

Date: 2026-11-11. Current version: **v3, approved 2026-11-11**.

Open any v3 HTML screen directly from disk; no build or server is needed. These are static prototypes: none calls the application API, and every name, model, figure and attack is synthetic sample data. The optional font stylesheet is external; system fonts remain a fallback.

| Stage | Role | Output | State |
| --- | --- | --- | --- |
| v1 | gpt-taste (adapted to an admin tool) | Composition for the test list, editor, running test and report | Frozen |
| v2 | animate | Feedback-only motion; data never moves | Frozen |
| v3 | impeccable | Two independent reviews (25/40 before polish), then polish; zero axe violations after | Approved 2026-11-11 |

## Review targets

- `v3/tests.html`: all tests with target, mode, status, overall risk and attack success; worker and broker readiness.
- `v3/new-test.html`: plugin and strategy selection, grading with an optional LLM judge, run settings and a live summary of attack count and time.
- `v3/running.html`: honest progress of a launched test, with provisional figures and no final score until it finishes.
- `v3/report.html`: raw versus protected risk, attacks that worked, threshold, what broke by plugin, by strategy, compliance coverage by framework, results with verdict filters, and an attack detail dialog (use the View buttons).
- `v3/states.html`: empty list, test runner not active, cancelled, failed, no judge and earlier-format reports. The cancel confirmation is in `v3/running.html`.
- `v3/screenshots/`: desktop and phone captures of every screen, for a quick look without opening the HTML.
- `v2/NOTES.md`: motion decision table. `v3/NOTES.md`: critique findings and polish changes.
- `brief.md`: purpose, fixed inputs, content rules and anti-goals.

## Relationship to the approved Prompt Studio design

The root `design/v1-v3` folders hold the Prompt Studio design approved on 2026-11-04 and are unchanged. This module reuses its Averiq shell, tokens and motion tokens, adding only `--warning`, `--warning-soft` and `--critical` semantic colours.

## Approval

Approved 2026-11-11. User answer, verbatim: “approve now write an impmenntation plan for it make sure its detailed”. This approves v3 and authorizes the implementation plan (`specs-red-team/`). It does not authorize application code changes; those start only when the user asks to run the specs. Approved v1-v3 are now read-only.
