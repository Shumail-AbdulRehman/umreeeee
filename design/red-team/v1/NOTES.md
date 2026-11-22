# v1: composition

Date: 2026-11-11. Stage: gpt-taste, adapted. Frozen after this stage.

## Direction

A calm Operate-mode admin module inside the existing Averiq shell: one list, one editor, one running view and one report, where the report leads with four honest numbers (risk, attack success, decided coverage, with-policies result) and then explains them by plugin, strategy, framework and individual attack.

## How gpt-taste was applied

gpt-taste is written for marketing pages. Its AIDA structure, hero, GSAP scroll choreography, picsum imagery and "never Inter" font rule do not apply: this is a dense admin tool and the Averiq brand (Inter, JetBrains Mono, violet accent) is a fixed input that overrides them. Its anti-default rules were applied: no meta-labels such as "SECTION 01", every button legible, no empty grid cells (the KPI grid and compliance grid always fill their rows), few intentional panels instead of decorative cards, and no horizontal page scroll. No randomised choices were made.

## Choices

- Type: Inter for UI, JetBrains Mono only for control IDs and attack text, matching Prompt Studio v3.
- Colour: approved Averiq tokens from `design/v3/styles.css`, plus three new semantic tokens (`--warning`, `--warning-soft`, `--critical`) taken from the app's amber and a darker rose. Risk levels are always text plus colour.
- Layout: report = 4-up KPI row, plugin table beside strategy bars, full-width compliance tabs, full-width results with a detail dialog. Editor = form column plus a sticky summary that recalculates attack count and time.
- Evidence first: every verdict names how it was decided; the dialog shows the decision steps in order (policy, exact evidence, judge) and highlights the decisive one.

## Checks run

Headless Chrome at 1440, 768 and 390 px: no horizontal page overflow, no text under 11 px, no script errors. Fixed during the stage: a screen-reader label escaping a scroll container, inputs overflowing the run-settings row, plugin names wrapping onto three lines, and two report columns on phones.

## Sample data

All names, models, figures and attack text are synthetic. Framework control names come from the permitted framework mapping in the supplied scheduler code (OWASP LLM Top 10 2025, MITRE ATLAS, NIST AI RMF, EU AI Act) and must be re-verified against the official sources before implementation.
