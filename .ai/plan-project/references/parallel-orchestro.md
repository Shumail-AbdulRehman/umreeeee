# Parallel by default — planning for Orchestro

The spec set is executed mainly by **Orchestro** (`orchestro`, the lead/coder/
reviewer runtime). Its lead reads the same headers `spec-run` does, and on every
tick it dispatches **every spec whose `Status` is `Not started` and whose
`Depends on` are all `Done` — all at once**, each to its own coder in its own git
worktree, each ending in its own PR. `spec-run` remains the sequential fallback;
a set planned for parallelism runs fine one at a time, but the reverse is not
true.

So the shape of the DAG *is* the speed of execution. A set where every spec
depends on the one before it is a single-lane road no matter how many coders
the team has. Plan for width.

What Orchestro reads (from `src/lead/specs/dag.ts`):

- `**Depends on:**` — two-digit numbers and ranges (`02-05`). This is the only
  thing that serialises work.
- `**Status:**` — `Not started` makes a spec dispatchable once its dependencies
  are `Done`.
- `**Model:**` — the tier word, for routing to a coder.
- `**Owns:**` — comma-separated paths; carried on the board.

It does **not** check two ready specs for overlapping files before dispatching
them. Disjoint ownership is the planner's job, and the validator's.

## The rules

1. **`Depends on` lists only what the spec consumes.** A spec depends on another
   when it imports, calls, renders, migrates on top of, or tests against
   something that spec creates. "It came earlier in my head" is not a
   dependency. "It's the same feature" is not a dependency. Every unnecessary
   edge serialises two coders.
2. **Number by wave, not by narrative.** After the decision and scaffold specs,
   group specs into waves: wave N holds every spec whose dependencies all sit in
   waves < N. Number wave by wave. The numbering still only points backwards,
   and now it also reads as the execution schedule.
3. **Contracts first, then fan out.** The cheapest way to widen a DAG is to land
   the shared contract early — types, schemas, API shapes, the route table, the
   token file — in one small spec, so the data layer, the API, and the UI shell
   of a feature can all start the moment it merges, instead of each waiting for
   the one before.
4. **Disjoint `Owns` within a wave is mandatory.** Two specs that can run at the
   same time must never write the same file. Global uniqueness of `Owns` is
   already a validator error; it matters more here, because the collision is
   now a merge conflict between two PRs opened an hour apart.
5. **Design out the hot files.** The files every feature wants to touch — the
   router, a barrel `index.ts`, a DI container, a nav menu, a seed script, a
   central `en.json` — are where parallel PRs collide. The scaffold spec creates
   them in a shape that later specs **add files to rather than edit**:
   - routes discovered from the file system, or registered from a per-feature
     `routes.ts` the router globs;
   - one barrel per feature, never one for the whole app;
   - nav items, i18n strings, seeds, and fixtures split per feature.
   Write the chosen pattern into `ARCHITECTURE.md` as an invariant. When a hot
   file genuinely cannot be split, give it to exactly one spec and have the
   others depend on it.
6. **The tracker is the lead's.** Under Orchestro the lead writes the spec's
   `Status: Done` and the `PROGRESS.md` row when it merges the PR. Coders do not
   touch status rows — two coders editing the same table is a guaranteed
   conflict. `AGENT-GUIDE.md` says so.
7. **The inventory is per spec.** Each spec records what it created in its own
   fragment, `specs/inventory/NN-<slug>.md`, never by editing the shared
   `INVENTORY.md`. See [`reuse-inventory.md`](reuse-inventory.md).
8. **Keep the long chain short.** The critical path — the longest chain of
   dependencies — sets the minimum number of rounds the run takes. Aim for a
   chain no longer than about a third of the set. Where one chain dominates, look
   for the edge that is ordering-by-habit rather than consumption.

## What a wide set looks like

```
L00: 00                     decision
L01: 01                     scaffold, hot files pre-split, unit harness
L02: 02 03 04               contracts: types+schema · route table · tokens
L03: 05 06 07 08 09 10      data layer, services, UI shells — all at once
L04: 11 12 13 14 15         API routes, client hooks, interactions
L05: 16 17                  cross-feature wiring
L06: 18                     e2e suite
L07: 19                     verification pass
```

Eight rounds for twenty specs. The same twenty as a straight line is twenty
rounds.

## Write the waves down

`README.md` carries a `Wave` column in the spec index, and a short wave list
under it, so the parallel plan is reviewable and Orchestro's own view
(`orchestro specs graph specs/`) can be checked against it. The validator prints
the computed levels; if they disagree with the `Wave` column, the column is
wrong.

Save the raw DAG draft — the full edge list with one line of "consumes what" per
edge — to `docs/planning/dag.md`. It is the evidence that each edge is real.

## What the validator checks

- `Depends on` resolves and points backwards (unchanged).
- No two specs own the same path (unchanged — now also a merge-conflict check).
- It prints the levels, the widest level, and the critical path.
- It **warns** when the critical path covers more than half the specs, and when
  a spec's `Depends on` repeats an edge already implied through another
  dependency (harmless, but usually a sign of ordering-by-habit).
