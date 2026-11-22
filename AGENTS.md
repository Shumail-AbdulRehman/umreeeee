# Agent instructions

<!-- BEGIN plan-project (npx github:mplus-s/plan-project) -->

## Planning a project or feature

When asked to plan, spec out, break down, or scope work before implementing —
a new project, a feature on an existing codebase, or a refactor too big for one
sitting — follow the procedure in `.ai/plan-project/SKILL.md`. Read it in full first.

It produces `specs/`: four steering docs, a progress tracker, an index, and
many small dependency-ordered spec files, each sized so a fresh session with no
context can finish one unit and prove it with unit tests — shaped so many of
them run in parallel. A UI project is designed first (gpt-taste → animate →
impeccable, into `design/v1–v3`), and research is saved to `docs/`. Key
rules: ground every claim against the real tree; one boundary per spec (40–130
lines); depend only on what you consume; `Explicit non-scope` is mandatory and
names its target spec; `Done when` is binary and tiered (`[static]`
`[unit]`; `[e2e]` only in the one e2e spec, `[suite]` only in the final
verification pass); specs state intent, never code.

Validate before handing over:
`python3 .ai/plan-project/scripts/validate-specs.py <project>/specs`

Not for a one-file fix or a bug — say so and just do the work.

<!-- END plan-project -->
