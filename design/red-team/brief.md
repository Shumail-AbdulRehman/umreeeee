# Red Team module design brief

Date: 2026-11-11. Status: design exploration, not approved.

## Purpose and scene

Organization administrators test a connected model with synthetic attacks before employees rely on it, then compare the raw model with the same model behind the organization's policies. They work on laptops in a well-lit office, usually reviewing a finished report rather than watching a run. The module must answer three questions quickly: how risky is this model, what exactly broke, and do our policies fix it.

## Fixed inputs

The incumbent Averiq brand is a fixed, user-supplied input, the same one approved for Prompt Studio on 2026-11-04: Inter and JetBrains Mono, graphite global navigation, light neutral surfaces, restrained violet actions, semantic green/amber/rose statuses with text labels. Tokens come from `design/v3/styles.css` and `Frontend/src/index.css`. These override any design stage's font or colour preferences. Global navigation, permissions, endpoints and the queue/worker execution model are unchanged.

## Defining screens

1. `tests.html` - test list: every test with target, mode, status, overall risk and attack success rate; worker/broker readiness; entry to create a test.
2. `new-test.html` - test editor: target and mode, attack plugins grouped by risk area with severity and framework tags, disguise strategies, grading (exact evidence plus optional LLM judge), run settings, and a live summary of attack count and estimated duration.
3. `running.html` - a launched test in progress: honest progress, provisional figures, pacing explanation, cancel.
4. `report.html` - a finished report: overall risk score and level, attack success rate, trend against the previous run, raw-versus-protected result, risk by plugin, success by strategy, compliance by framework (OWASP LLM Top 10 2025, MITRE ATLAS, NIST AI RMF, EU AI Act), and individual results with an attack detail dialog that shows the evidence behind each verdict.

Each screen works at 1440x900, 1280x800, 768x1024 and 390x844. Wide tables scroll locally; the page never scrolls sideways.

## Content rules

- All records are synthetic and labelled as sample data. Attack text is mild and fictional; harmful-content attacks target a fictional forbidden topic defined in the test, never real dangerous instructions.
- A verdict always names its evidence: exact marker, refusal token, policy block, or LLM judge. Judge verdicts are visibly labelled as judgements, not proof.
- Inconclusive and error results are shown, but never counted as safe.
- Compliance shows test coverage, not certification. Controls the module cannot exercise say "Not tested" with the reason.
- Risk levels use text plus colour: Critical, High, Medium, Low, None.

## Stack constraints

React 19 + Tailwind 4 + locally owned shadcn/Radix components and Recharts in the real app. Prototypes are static HTML/CSS/JS that open from disk; they will be rebuilt in app components with tokens, never pasted.

## Anti-goals

No cyber-security theatre (glowing terminals, radar sweeps, skulls, red-on-black), no fake live metrics, no decorative dashboard cards, no gauges that hide the number, no motion on data. Do not imply a passing report certifies the model safe.

## Pipeline

v1: gpt-taste composition adapted to a dense admin product (its landing-page AIDA, hero and scroll choreography rules do not apply to an Operate-mode tool; its anti-default rules do). v2: animate adds only purposeful feedback. v3: impeccable critique, audit and polish. Approval is required before any spec or code.
