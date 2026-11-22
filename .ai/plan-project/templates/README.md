# <Project> — spec index

<One paragraph: what this project is, and the single most important scope
boundary. Written so someone who has never seen it can decide whether a given
piece of work belongs here.>

This folder breaks the work into small, independently workable specs — goal,
exact scope, explicit non-scope, steps, and a done-when checklist each. They are
shaped to run **in parallel under Orchestro**: every spec whose dependencies are
done can start at once. Run them sequentially with `spec-run` if you prefer;
`00` is the decision everything else depends on.

- **Design:** [`../design/v3/`](../design/v3/) is the approved visual source of
  truth (v1 gpt-taste → v2 animate → v3 impeccable). *(Delete for a no-UI project.)*
- **Research and raw planning:** [`../docs/`](../docs/).

Track progress in [PROGRESS.md](./PROGRESS.md).

## Steering docs — read before any spec

| Doc | What it settles |
|---|---|
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | How to work here: read order, one spec per session, verification bar |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Folder tree, layer boundaries, data model, invariants |
| [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) | The closed token list: colour, type, spacing, states, motion |
| [INVENTORY.md](./INVENTORY.md) | What already exists — check it, and `inventory/`, before creating anything |

## Spec list

`Wave` is the parallel round a spec runs in: every spec in a wave depends only
on earlier waves, so all of them can be dispatched at once. Every spec proves
itself with unit tests; end-to-end tests are written and run once, in the e2e
spec.

`Model` is the tier each spec is sized for — the per-provider ids are on the
spec's own `**Model:**` line.

| # | Spec | Wave | Model | What it covers |
|---|---|---|---|---|
| 00 | [<Decision>](./00-<slug>.md) | 0 | Heavy | <Stack, storage, state, testing, design direction. Read first.> |
| 01 | [<Scaffold>](./01-<slug>.md) | 1 | Standard | <tooling, unit runner, folder tree, hot files split per feature> |
| 02 | [<Contract>](./02-<slug>.md) | 2 | Heavy | <one line> |
| 03 | [<Title>](./03-<slug>.md) | 2 | Standard | <one line> |
| NN | [End-to-end suite](./NN-e2e-suite.md) | N | Heavy | Installs the harness, one test per flow, runs them. |
| NN | [Verification pass](./NN-verification-pass.md) | N+1 | Heavy | Final gate: clean build, both suites, every done-when re-checked, duplication sweep. |

## Waves

```
W0: 00
W1: 01
W2: 02 03 04
…
WN: NN (e2e)
WN+1: NN (verification)
```

Check it against `orchestro specs graph specs/` — if they disagree, this list is
wrong.

## Dependency order

| Spec | Depends on |
|---|---|
| 00 | — |
| 01 | 00 |
| 02 | 01 |

## Status shorthand

- **Not started** — nothing done yet
- **In progress** — actively being worked, or resumed from a stopped session
- **Blocked** — waiting on a decision or another spec
- **Done** — done-when checklist fully checked, and actually verified

## Open questions

<Anything the intake did not settle. Do not invent scope to fill these — they
stay here until a human answers them. Delete the section if empty.>

## Known gaps

<Validator warnings that were deliberately accepted, with one line of why.
Delete the section if empty.>
