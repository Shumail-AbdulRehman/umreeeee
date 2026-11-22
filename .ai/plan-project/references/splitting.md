# Splitting a project into very small specs

The goal is a unit a fresh session with an empty context window can read,
implement, prove with unit tests, and commit — then stop — while other
sessions work on other units at the same time. If a unit cannot be
finished in one sitting by someone who knows nothing yet, it is too big.

## The sizing rules

1. **One boundary per spec.** UI + background job → two specs. Persistence +
   realtime state → two specs. Three unrelated API routes → three specs. If you
   have to write "and also" in the Goal, split it.
2. **40–130 lines**, median around 55. Length correlates with trouble, not
   clarity. Four of the highest-divergence units in the reference corpus were
   its four longest specs.
3. **`Owns:` fits on one line.** If it does not, that is the split telling you
   where it goes.
4. **One commit.** If the natural commit message needs a semicolon, split it.
5. **A spec depends only on lower numbers.** No forward references, ever.
6. **A spec depends only on what it consumes.** Every other edge stops two
   coders working at once. See [`parallel-orchestro.md`](parallel-orchestro.md).

## A feature is several specs

This is the part people get wrong. "User authentication" is not a spec; it is
five. The standard decomposition, in dependency order:

| Layer | What it owns | Typical spec |
| --- | --- | --- |
| Contract | Types, schema, validation shapes | `NN-auth-types-and-schema` |
| Data | Tables/migrations, repository functions | `NN-auth-persistence` |
| Service | Business logic, framework-agnostic | `NN-auth-service` |
| Transport | Routes/handlers, validation at the edge, DTOs | `NN-auth-routes` |
| Client data | Query/mutation hooks, cache keys | `NN-auth-client-queries` |
| UI shell | Screens, layout, empty/loading/error states | `NN-login-screen` |
| Interaction | Submit, validation feedback, redirects | `NN-login-flow` |
| Edge cases | Session expiry, refresh, logout everywhere | `NN-session-lifecycle` |

Not every feature needs all eight. Most need four to six. Collapsing Service
into Transport is the most defensible merge for a small project — collapsing UI
shell into Interaction is the least, because it is where specs balloon.

## Worked example — "add commenting to a document viewer"

Wrong: one spec, "implement comments".

Also wrong: eight specs in a straight line, each depending on the one before.
That is eight rounds of execution where four will do.

Right, eight specs in four waves:

```
wave A
12  comment types and API contract           Owns: src/features/comments/types.ts, src/features/comments/contract.ts
wave B — all three start the moment 12 merges
13  comment persistence and repository       Depends on 12
14  comment query/mutation hooks (mocked)    Depends on 12
15  comment thread UI shell (read-only)      Depends on 12   ← builds from design/v3/document.html
wave C
16  comment service, permissions, routes     Depends on 13
17  composer and submit flow                 Depends on 14, 15
wave D
18  edit, delete, optimistic update          Depends on 16, 17
19  unread badge + notification hook-in      Depends on 16, 17
```

Note what this buys:

- **The contract unblocks three specs at once.** Hooks are written against
  `contract.ts` with the transport mocked in their unit tests, so they do not
  wait for the routes. The UI shell renders fixture data that matches the
  contract, so it does not wait for the hooks.
- **18 and 19 both depend on 16 and 17, not on each other.** They run side by
  side, and their `Owns` lines never touch.
- **Every spec proves itself with unit tests.** 13 against a test database, 14
  with the transport mocked, 15 by rendering the empty, loading and populated
  states. No spec here writes an e2e test — the comment flows become rows in the
  e2e spec's flow table.
- **Spec 18's `Explicit non-scope` says "notification badge → spec 19"**, so
  neither session drifts into the other's work.

## The DAG

Draw it before numbering. For each spec, ask: what must be true before this can
start? That answer *is* `Depends on`, and it is stated explicitly in every file
— never left implicit in the numbering.

Number so that dependencies are always lower. Where two specs are independent,
number by wave first, then by which one unblocks more work.

Keep it in `README.md` as a table. If the project is large enough that the table
is hard to read, add a Mermaid graph — but the table is the source of truth,
because it is what the validator parses.

**Write the waves while drawing it.** Number wave by wave, and record each
spec's wave in the `README.md` table, so the parallel plan is reviewable. Save
the full edge list, with what each edge consumes, to `docs/planning/dag.md`.

**Collect the flows while drawing it.** Every user-reachable capability the set
builds becomes one row in the e2e spec's flow table, with the specs that built
it. Doing it now, with the whole set in view, is what makes the single e2e spec
complete. See [`testing.md`](testing.md).

## Fixed positions

**Spec 00 is a decision, not a coding task.** Stack, storage, state strategy,
testing approach, design direction — with alternatives and rationale. Marked
`Done` once recorded.

**An early spec is the scaffold**: repo init, tooling, lint/format/typecheck
config, **the unit test runner green on one trivial test**, the folder tree from
`ARCHITECTURE.md` created empty, and the hot files — router, nav, i18n, seeds —
created in the split-per-feature shape `ARCHITECTURE.md` names, so later specs
add files instead of editing shared ones.

**Contracts come right after**, as small separate specs that can run side by
side: shared types and schemas, the API contract, and the design tokens from
`DESIGN-SYSTEM.md` written into a real token file. Everything after fans out
from them.

**Second to last is the e2e suite.** Depends on every implementation spec.
Installs the harness, writes a test for every row of its flow table, runs them.
The only spec with `[e2e]`. See [`testing.md`](testing.md).

**The last spec is the verification pass.** Depends on everything. Rebuild from
clean, run both whole suites (`[suite]`), re-check every earlier `Done when`
against the real artifact, fold the inventory fragments in, sweep for
duplication, and record every correction in its Log.

**A mid-plan fork gets its own decision spec.** When a real choice appears while
planning — "do we also do the mobile client?", "which payment provider?" — it
becomes a numbered decision spec with a recommendation and the alternatives, and
a human decides. Never bury a decision inside an execution spec, and never pick
the default silently.

## Adding specs to an existing set

Same shape, numbered from the next free number. Two extra obligations:

1. **Build or refresh `INVENTORY.md` first**, from the real code. Specs that add
   to a codebase are the ones most likely to duplicate what is already there.
2. **Cite real file paths and real line references**, verified now — not
   transcribed from a plan doc written earlier, which may already be stale.

If the existing repo has no spec set, create the four steering docs by reading
the code, and say in each one that it was derived from the code rather than
decided up front — so a later reader knows which parts are intent and which are
observation.

## Anti-patterns in a spec set

- A spec whose Goal contains "and also".
- A spec with no `Explicit non-scope` — it will grow.
- A deferral with no target spec number.
- Two specs listing the same path in `Owns`.
- A spec that creates an endpoint no other spec consumes.
- `Done when` bullets that are restatements of the Goal.
- A spec that pastes implementation code instead of stating intent.
- Twelve specs that each independently decide what a button looks like, because
  `DESIGN-SYSTEM.md` was left half-decided.
- An implementation spec with an `[e2e]` criterion. End-to-end tests live in
  the e2e spec; per-spec proof is `[unit]`.
- A spec with no `[unit]` criterion that still creates code.
- A straight-line DAG — every spec depending on the one before. That is a set
  Orchestro can only run one spec at a time.
- Two specs in the same wave that both have to edit the router, a barrel, or a
  nav list to be wired in. Split the file in the scaffold, or serialise them on
  purpose.
