---
name: plan-project
description: Plan a project or feature as a set of very small, dependency-ordered spec files shaped to run in parallel under Orchestro, plus four steering docs — agent guide, architecture, design system, and a reuse inventory — and a progress tracker. UI projects are designed first through a three-skill pipeline (gpt-taste → animate → impeccable, saved to design/v1, v2, v3; optionally Zeki-branded). Specs prove themselves with unit tests; one e2e spec runs at the end. Research and raw planning are saved to docs/. Use when starting a new project, adding a feature to an existing codebase, or when asked to plan, spec out, break down, or scope work before implementing. Output is Orchestro and `spec-run` compatible.
---

# plan-project

Turn a brief — or an existing repository — into a spec set small enough that a
fresh, context-free agent session can pick up exactly one unit, finish it,
prove it with unit tests, and leave a written handoff — and shaped so that many
of those sessions can run **at the same time**.

**This skill plans. It does not implement.** Planning ends when the spec set
validates. Execution is **Orchestro**, with `spec-run` as the sequential
fallback (see [Hand off](#phase-5--hand-off)).

## What it produces

```
<project>/
  specs/
    README.md              index — every spec, its wave, dependency order
    PROGRESS.md            the tracker — status table + append-only dated log
    AGENT-GUIDE.md         how an implementing agent works in this repo
    ARCHITECTURE.md        folders, layers, boundaries, data model, invariants
    DESIGN-SYSTEM.md       the closed token list, transcribed from design/v3
    INVENTORY.md           reuse registry — what already exists
    inventory/             one fragment per spec, written during implementation
    00-<decision>.md       a blocking decision, not a coding task
    01-<slug>.md           …one small unit each
    NN-e2e-suite.md        the single end-to-end spec — second to last
    NN-verification-pass.md   the final gate
  design/                  UI projects only
    brief.md · README.md
    v1/                    gpt-taste — the idea
    v2/                    animate — v1 + motion
    v3/                    impeccable — fine-tuned; the visual source of truth
  docs/
    research/              everything looked up, with sources and dates
    planning/              brief, intake answers, DAG draft, splits, validator output
```

Four steering docs, one tracker, one index, many small specs — plus the design
that the UI specs build from and the research the decisions rest on.

## When to use it

- A brand-new project, from a one-paragraph brief.
- A feature added to an existing codebase — same shape, specs numbered from the
  next free number, `INVENTORY.md` built by reading the real code first.
- A refactor or migration big enough that it won't fit in one sitting.

Not for a one-file fix, a bug, or anything you could finish in the current
session. Say so and just do the work.

**Save as you go.** Every phase below writes its research and raw output into
`docs/` before the next phase starts — see
[`references/docs-folder.md`](references/docs-folder.md). Research that only
exists in the chat is lost when the session ends.

---

## Phase 0 — Ground truth, then intake

**Never write a scope section from memory.** Establish what is actually there
before asking the user anything, so the questions are informed.

Greenfield: confirm the directory is empty or note what is in it.

Existing repo — run these, read the results, and save them to
`docs/planning/repo-survey.md`:

```bash
git log --oneline -15; git status --short
cat package.json 2>/dev/null | head -60          # or pyproject.toml, go.mod, Cargo.toml…
find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
ls .claude/ AGENTS.md CLAUDE.md .kiro/ specs/ context/ design/ docs/ orchestro/ 2>/dev/null
```

Then interview. Use `AskUserQuestion` for forks with real cost either way; ask
in **one batched call**, not a drip. The questions worth asking are the ones
whose answers change the spec set:

1. **Scope boundary and explicit non-goals** — what v1 is *not*. This is the
   single highest-value answer; without it every spec grows.
2. **Stack**, if not already fixed by the repo.
3. **Brand input for the design pipeline** — four answers. Every UI project is
   designed by the pipeline in Phase 1b; this decides what it is given:

   | Answer | What it means |
   | --- | --- |
   | **Zeki branding** | The house brand — navy/yellow palette, Poppins, the Zeki logo — is a fixed input to every design stage. Load [`references/brand-zeki.md`](references/brand-zeki.md); `DESIGN-SYSTEM.md` starts from [`templates/DESIGN-SYSTEM-zeki.md`](templates/DESIGN-SYSTEM-zeki.md). |
   | **User-supplied** | They have a palette, brand kit, reference site or Figma file. It is a fixed input, transcribed verbatim. |
   | **Open** | No constraint — the pipeline decides the look. |
   | **No UI** | Headless project. No design pipeline, no `DESIGN-SYSTEM.md`; say so in `README.md`. |

4. **Auth / multi-user / persistence** — these restructure the architecture.
5. **Deployment target**, if it constrains the stack.

Save the brief and every question with its answer, verbatim, to
`docs/planning/brief.md` and `docs/planning/intake.md`.

Anything they did not answer is not product truth. Do not invent scope no
answer supports; put it in `Open questions` in `README.md` instead.

---

## Phase 1 — Stack and patterns

Spec `00` is always a **decision spec**: it records the stack, the storage
engine, the state strategy, and the testing approach (the unit runner, and the
e2e harness the e2e spec will install), with rationale and the alternatives that
lost. A decision spec's "done" is the decision being made, not code being
written — mark it `Done` once recorded.

**If the stack is React / React Native / Node**, load
[`references/stack-patterns/react-node.md`](references/stack-patterns/react-node.md).
It is the house architecture and it is not up for re-derivation.

**If it is anything else** — Django, Rails, Go, Flutter, SwiftUI, Laravel,
Spring — load
[`references/stack-patterns/unknown-stack.md`](references/stack-patterns/unknown-stack.md)
and research the current idiom before writing `ARCHITECTURE.md`. Use the
`context7` MCP (`resolve-library-id` → `query-docs`) for framework docs and
`WebSearch` for structure conventions. **Do not write an architecture from
training-data memory for a stack you did not verify.** Save what you checked,
with sources and dates, to `docs/research/stack.md`.

---

## Phase 1b — The design pipeline (UI projects)

Before any steering doc, design the product with three skills, in order, each
building on the last. Full procedure:
[`references/design-pipeline.md`](references/design-pipeline.md).

| Stage | Skill | Output |
| --- | --- | --- |
| Brief | — | `design/brief.md` — product, the 3–6 defining screens, stack limits, brand input, anti-goals |
| v1 | **gpt-taste** | `design/v1/` — static prototype of those screens: the idea |
| v2 | **animate** | `design/v2/` — a copy of v1, given motion |
| v3 | **impeccable** | `design/v3/` — a copy of v2, critiqued and polished |

The three skills ship inside this one, under `companions/`. Invoke them as
skills when the agent has them (`/gpt-taste`, `/animate`, `/impeccable`);
otherwise read `companions/<name>/SKILL.md` and follow it.

Each stage copies the previous folder and works only on its own — `v1/` and
`v2/` are never edited after their stage ends. A brand answer from Phase 0 is a
fixed input to all three stages, and it overrides any skill's own font or colour
preferences.

**Stop for approval after v3.** Ask the user to approve `design/v3/` or redo a
stage. Only an approved v3 feeds the design system.

---

## Phase 2 — The four steering docs

Write these before splitting anything. Every spec is generated against them, so
a contradiction here propagates into every unit.

Full contents and required sections:
[`references/steering-docs.md`](references/steering-docs.md).

| Doc | Owns | One-line test of a good one |
| --- | --- | --- |
| `AGENT-GUIDE.md` | Read order, one-unit-per-session rule, the issue/PR ritual, parallel-work rules, verify-before-asserting, done bar, the unit commands | A fresh session that reads only this knows how to behave |
| `ARCHITECTURE.md` | Real folder tree, layer boundaries, data model, naming, protected files, numbered invariants, how hot files are split | Someone could create the empty folder tree from it exactly |
| `DESIGN-SYSTEM.md` | Closed token list with real hex values, type scale, spacing, radii, states, motion, a11y — transcribed from `design/v3/` | A token not listed there does not exist |
| `INVENTORY.md` | Every reusable component/hook/util/constant/type with its path | Answers "does this already exist?" without a grep |

The rules that carry most of the weight:

- **`DESIGN-SYSTEM.md` is a closed list, transcribed from the approved
  `design/v3/`** — its custom properties, font stack, spacing, radii, shadows,
  and `design/v2/NOTES.md`'s motion table. Mark it
  `Source: design/v3 (approved <date>)`. Specs may only name tokens that appear
  in it; inventing a plausible-sounding variant is a real, observed failure
  mode. Raw hex codes and raw palette classes are banned everywhere except this
  file and `design/`. On a **Zeki-branded** project, start from
  `templates/DESIGN-SYSTEM-zeki.md` and fill the remaining rows from v3.
- **Zeki-branded projects also own their logo files.** The first UI spec copies
  the needed files out of [`assets/zeki/`](assets/zeki/) into the project and
  records them in its inventory fragment. The brand's usage rules live in
  [`references/brand-zeki.md`](references/brand-zeki.md), and the checks that
  prove them belong in the verification pass.
- **`INVENTORY.md` is the anti-duplication mechanism.** For an existing repo,
  build it by reading the real code. During implementation each spec writes its
  own fragment, `specs/inventory/NN-<slug>.md`, instead of editing the shared
  file — parallel sessions editing one file is a merge conflict. See
  [`references/reuse-inventory.md`](references/reuse-inventory.md).
- **`ARCHITECTURE.md` designs out the hot files** — the router, barrels, nav,
  i18n, seeds — so features add files instead of editing shared ones. See
  [`references/parallel-orchestro.md`](references/parallel-orchestro.md).

Skip `DESIGN-SYSTEM.md` only for a project with no user interface at all — and
say so explicitly in `README.md` rather than silently omitting it.

---

## Phase 3 — Split into specs, wide not long

Read [`references/splitting.md`](references/splitting.md) for the sizing rules
and a worked split, [`references/parallel-orchestro.md`](references/parallel-orchestro.md)
for the DAG shape, and [`references/spec-format.md`](references/spec-format.md)
for the exact file format — a contract with Orchestro and `spec-run`, not a
style preference.

The short version:

- **One boundary per spec.** UI + background job is two specs. Persistence +
  realtime state is two specs. Three unrelated routes is three specs.
- **A feature is several specs**, near-always: contract → data → API → UI shell
  → interactions. Splitting is correct; one oversized unit is the failure mode.
- **40–130 lines.** Length correlates with trouble, not clarity.
- **Plan for parallel execution.** Orchestro dispatches every spec whose
  dependencies are `Done` at the same moment, each in its own worktree. So:
  `Depends on` lists only what a spec actually consumes; shared contracts land
  early so features fan out from them; specs are numbered wave by wave; no two
  specs own the same file; and the longest chain stays short. Write the raw DAG
  — every edge and what it consumes — to `docs/planning/dag.md`, and the waves
  into `README.md`.
- **Number by dependency.** A spec may only depend on lower numbers.
- **Size the model with the spec.** Every spec's `**Model:**` line carries a
  tier and one model per provider. Read
  [`references/model-selection.md`](references/model-selection.md), and check
  the ids against the providers' model pages before writing them — save what
  you checked to `docs/research/models.md`.
- **Every spec starts with `**Issue:** —`.** See
  [`references/github-workflow.md`](references/github-workflow.md).
- **Unit tests in every spec, end-to-end tests in one.** Each implementation
  spec writes and runs unit tests for its own code (`[unit]`), then the whole
  unit suite. No implementation spec writes or runs an e2e test. See
  [`references/testing.md`](references/testing.md).
- **The last two specs are fixed:** the **e2e suite** (installs the harness,
  writes a test for every flow in its flow table, runs them — `[e2e]`) and then
  the **verification pass** (clean build, both suites, every earlier `Done when`
  re-checked, duplication sweep — `[suite]`).
- **UI specs build from the design.** Each cites its screen in `design/v3/` and
  the `DESIGN-SYSTEM.md` anchors it uses, and rebuilds the screen in the app's
  components — never pastes the prototype's code.
- **A mid-plan fork gets its own decision spec.** Never bury a decision inside
  an execution spec.

Save the feature-to-spec split, and the splits you rejected, to
`docs/planning/splits.md`.

---

## Phase 4 — Validate before handing over

A spec set is not finished because it reads well. Run the validator, and save
its final output to `docs/planning/validator.md`:

```bash
python3 <this skill>/scripts/validate-specs.py <project>/specs
```

It mechanically checks what actually went wrong in prior corpora: missing or
malformed headers, `Log` not last, dependencies that don't resolve or point
forward, two specs owning the same file, deferrals with no target spec,
`Reuses` paths that exist nowhere, untiered `Done when` bullets, code specs with
no `[unit]` criterion, `[e2e]` or `[suite]` outside their one spec, a missing or
misplaced e2e spec, raw hex outside the design system, and tracker rows that
don't match the spec files. It also prints the waves and the critical path, and
warns when the set is too serial for parallel execution.

Fix everything it reports as `ERROR`. Justify or fix every `WARN` — a warning
you chose to accept goes in `README.md` under `Known gaps`, not into silence.

Then do the checks a script cannot do:

1. **Coverage.** Every endpoint, component, or module a spec creates is
   consumed by some later spec, and every user-reachable capability is a row in
   the e2e spec's flow table.
2. **Prior-state truth.** Every "X is already installed" / "the existing Y" in
   any spec is derivable from an ancestor spec's `Done when`, or from a file
   that is actually on disk right now.
3. **Parallel safety.** For each wave, read the `Owns` lines side by side and
   ask what else each spec will *have* to edit to be wired in — a route table, a
   barrel, a nav list. Anything two specs in one wave would both touch is a
   conflict the validator cannot see: split the file in the scaffold, or give
   it to one spec and make the others depend on it.

---

## Phase 5 — Hand off

Don't start implementing. Tell the user how to run it.

**Orchestro (the default — runs specs in parallel):**

```bash
/orchestro                       # set up the team on this repo, if not done yet
orchestro specs graph specs/     # the waves, as Orchestro sees them
orchestro specs ready specs/     # what dispatches first
```

**spec-run (sequential fallback):**

```bash
spec-run status     # the table and what runs next
spec-run            # work the whole queue, one fresh session each
```

Both give each spec its own empty context window and treat the spec's `Log`
plus `PROGRESS.md` as the only handoff — which is why the format is a contract
and not decoration.

---

## Hard rules

1. **Ground every claim.** A path, a package, a library export, a prior state —
   check it against the tree, `package.json`, or the installed `.d.ts` before
   writing it into a spec, and save what you checked to `docs/research/`.
2. **Specs are instructions, not descriptions.** Imperative, at the intent
   level, never the code level — a spec that emits implementation code is a
   defect.
3. **`Explicit non-scope` is mandatory and every entry names its target spec.**
4. **`Done when` is a checklist of binary, tiered facts**, ending with the
   build command. Never "the flow works well".
5. **Reuse before creating.** Every spec names what it reuses.
6. **Surface decisions, never bury them.**
7. **Don't scaffold an empty `Log`.**
8. **Tier every spec and check the model ids.**
9. **One spec, one issue, one PR.** Never merge the PR that closes it.
10. **Every dependency is a consumption.** An edge that only encodes "this felt
    earlier" costs a parallel round. Two specs in one wave never write the same
    file.
11. **Unit tests per spec, e2e once.** `[e2e]` lives only in the e2e spec,
    `[suite]` only in the verification pass.
12. **Design before tokens.** On a UI project, `DESIGN-SYSTEM.md` is transcribed
    from an approved `design/v3/`, never invented beside it.

## Reference index

| File | Read it when |
| --- | --- |
| [`references/spec-format.md`](references/spec-format.md) | Writing any spec file — the exact format and the runner contract |
| [`references/parallel-orchestro.md`](references/parallel-orchestro.md) | Phase 3 — shaping the DAG for parallel execution, hot files, waves |
| [`references/testing.md`](references/testing.md) | Writing `[unit]` criteria, the e2e spec, and the verification pass |
| [`references/design-pipeline.md`](references/design-pipeline.md) | Phase 1b — gpt-taste → animate → impeccable, `design/v1–v3` |
| [`references/docs-folder.md`](references/docs-folder.md) | Every phase — what goes in `docs/research` and `docs/planning` |
| [`references/steering-docs.md`](references/steering-docs.md) | Phase 2 — required sections of all four steering docs |
| [`references/brand-zeki.md`](references/brand-zeki.md) | The project uses Zeki branding — palette, type, logo assets and their rules |
| [`references/model-selection.md`](references/model-selection.md) | Phase 3 — tiering each spec and writing its `**Model:**` line |
| [`references/github-workflow.md`](references/github-workflow.md) | The issue-per-spec / PR-per-spec workflow the implementing sessions follow |
| [`references/splitting.md`](references/splitting.md) | Phase 3 — sizing rules, a worked split |
| [`references/reuse-inventory.md`](references/reuse-inventory.md) | Building `INVENTORY.md`, the per-spec fragments, the duplication sweep |
| [`references/stack-patterns/react-node.md`](references/stack-patterns/react-node.md) | The stack is React, React Native, or Node |
| [`references/stack-patterns/unknown-stack.md`](references/stack-patterns/unknown-stack.md) | The stack is anything else |
| `companions/` | The three design skills — gpt-taste, animate, impeccable |
| `templates/DESIGN-SYSTEM-zeki.md` | Zeki-branded project — the brand tokens, pre-filled |
| `assets/zeki/` | The Zeki logo files a branded project copies into itself |
| `templates/` | Copy-and-fill starting points for every file above |
| `scripts/validate-specs.py` | Phase 4 — always |
