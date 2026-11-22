# Spec file format

This is a **contract**, not a style preference. Orchestro and `spec-run` both
parse these files to decide what runs next — Orchestro dispatches every spec
whose dependencies are `Done` in parallel — and `spec-run` checks after every
session that the file is still readable by the next one. Deviating breaks the
runner silently.

## The file

`specs/NN-<kebab-slug>.md`, two-digit zero-padded number, numbered by dependency.

```markdown
# Spec 04 — Card CRUD and drag-and-drop

**Status:** Not started
**Depends on:** Spec 02, Spec 03
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `src/features/board/components/card-item.tsx`, `src/features/board/components/card-item.test.tsx`, `src/features/board/hooks/use-card-drag.ts`, `src/features/board/hooks/use-card-drag.test.ts`
**Reuses:** `src/features/board/api/cards.ts` (spec 02), `design/v3/board.html`, `DESIGN-SYSTEM.md#surfaces`, `INVENTORY.md#confirm-dialog`

## Goal

One or two sentences in plain terms. What is true when this is done, and what
it explicitly defers.

## Scope

The actual files, areas, and behaviours this spec touches — specific enough
that someone could start without re-deriving it. Intent level, not code level.

## Explicit non-scope

- Attachments and due dates on the card face → spec 06.
- Multi-board routing → spec 07.

## Reuse first

- Card read/write goes through `src/features/board/api/cards.ts`. Do not
  query the store directly from a component.
- Confirmation uses the existing `ConfirmDialog` (`INVENTORY.md#confirm-dialog`).
  Do not add a second dialog primitive.

## Steps

1. …
2. …

## Done when

- [ ] `pnpm test src/features/board/hooks/use-card-drag.test.ts` passes: a drop
      on another column calls `moveCard` once with the target column; a drop on
      the same column calls nothing. [unit]
- [ ] `pnpm test src/features/board/components/card-item.test.tsx` passes: the
      delete action asks for confirmation before calling `deleteCard`. [unit]
- [ ] `pnpm test` (whole unit suite) passes with 0 failures; count in the Log. [unit]
- [ ] `pnpm typecheck` and `pnpm lint` pass with 0 errors, 0 warnings. [static]
- [ ] `pnpm build` passes. [static]

## Log

<!-- added when work starts, never scaffolded empty -->

---

## The header block

Everything above the first `##`. `spec-run` greps it with `-m1` and re-checks it
after every session; Orchestro's lead parses `Depends on`, `Status`, `Model`
and `Owns` from it with line-anchored regexes. So:

- `**Status:**` and `**Depends on:**` **must be there, must be first**, and must
  stay above the first `##` heading. If a session moves them, the runner reports
  damage.
- Each key sits on **one line**. `**Owns:**` that will not fit on one line is
  the clearest signal you have that the spec should be two specs.

| Key | Required | Value |
| --- | --- | --- |
| `**Status:**` | yes | Exactly one of `Not started` · `In progress` · `Blocked` · `Done` |
| `**Depends on:**` | yes | `Spec 01, Spec 02`, a range `00-06`, or `—` for none |
| `**Model:**` | yes | `<Heavy\|Standard\|Light> — <claude id> · <openai id> · <gemini id>`. See [`model-selection.md`](model-selection.md) |
| `**Issue:**` | yes | `—` until the implementing session opens one, then `#<n>`. See [`github-workflow.md`](github-workflow.md) |
| `**Owns:**` | yes | Comma-separated paths this spec creates or is the sole editor of. `—` for a decision spec |
| `**Reuses:**` | recommended | Paths, `DESIGN-SYSTEM.md#anchor`, or `INVENTORY.md#anchor` this spec must build on rather than reinvent |

`Model` is read by `spec-run`, which passes the `claude-*` id to that spec's
session as `--model`. It is not a comment: a malformed or non-existent id is a
failed session. `Issue` is written back by the implementing session once the
GitHub issue exists, and is what stops a second issue being opened for the same
spec on a later run.

`Owns` is what makes ownership collisions machine-checkable: two specs listing
the same path is an error, and it is the most common cause of two sessions
writing conflicting versions of one file. Under Orchestro those two sessions run
at the same time, so the collision becomes a merge conflict between two PRs. A
spec's own test files belong in its `Owns`.

`Depends on` is what serialises work. List only the specs whose output this one
consumes — see [`parallel-orchestro.md`](parallel-orchestro.md). Every extra
edge costs a parallel round.

## Required sections, in this order

`Goal` · `Scope` · `Explicit non-scope` · `Reuse first` · `Steps` · `Done when` · `Log`

- `Reuse first` may be omitted only on spec 00 and on a spec that genuinely
  builds the first of its kind. Say which in `Scope` if you omit it.
- **`Log` is always last.** `spec-run` verifies this. It is a diary, append-only,
  dated, never rewritten. It is allowed to be longer and messier than the rest
  of the file — corrected numbers, the real path found instead of the assumed
  one, "here is what I actually did and why".
- Do not scaffold an empty `Log`. Add the heading when the first entry is written.

## `Explicit non-scope` — the highest-value section

Each entry names something a competent agent would **plausibly** do that this
unit must not, and **names the spec that picks it up**. The arrow and number are
machine-checked.

```markdown
- Attachments on the card face → spec 06.
- Dark theme tokens → spec 09.
```

A deferral with no target, or a target that does not exist, is an error: it
excludes work nobody will ever do. In a prior corpus 4 of ~21 deferrals were
permanently orphaned, and four specs each individually-correctly deferred
wiring one button — leaving three backend units with zero callers. That
intersection is why coverage is checked across the whole set, not per spec.

## `Done when` — binary, tiered, ends with the build

Every bullet is checkable by inspection or by running something, and carries a
verifiability tier:

| Tier | Tag | Meaning |
| --- | --- | --- |
| S | `[static]` | Typecheck, lint, build, or file inspection |
| U | `[unit]` | Unit or component tests that ran — this spec's test files, then the whole unit suite |
| R | `[runtime]` | Needs the app running, single process |
| E | `[e2e]` | The end-to-end suite. **The e2e spec only** |
| F | `[suite]` | Both whole suites from a clean install. **The verification pass only** |
| X | `[requires: X, Y]` | Needs live external services or multiple clients — list them |

- **At least one `[static]` on every spec**, and the last two are always the
  typecheck/lint and build commands.
- **At least one `[unit]` on every spec that creates or changes code**, naming
  its test file and the behaviour it proves, plus one bullet running the whole
  unit suite. UI specs unit-test their components too — roles and text, not
  snapshots.
- **No `[e2e]` outside the e2e spec, no `[suite]` outside the verification
  pass.** End-to-end runs are slow and, with specs running in parallel, they
  contend for ports and browsers. They are paid once, at the end. See
  [`testing.md`](testing.md).
- `[requires:]` names its dependencies so nobody silently reports "passes" on
  something they could not run. In a prior corpus 57% of criteria needed live
  services with no marker, and the build was the only gate that ever gated.

Never write "the design flow works well", "the UI looks correct", or "tested
manually" without saying what was run.

## Intent level, never code level

> status enum: `DRAFT`, `ARCHIVED`

not

> ```prisma
> enum ProjectStatus { DRAFT ARCHIVED }
> ```

The implementing agent owns syntax, naming details, and library specifics. The
spec owns *what must be true when it is done*. **A spec that emits
implementation code is a defect** — it dates instantly, it conflicts with the
real file, and it invites copy-paste over comprehension.

The exception: a shared helper that several specs must use **verbatim** belongs
in `ARCHITECTURE.md` in full, once, and the specs point at it.

## Prior-state assertions

"X is already installed", "the existing Y", "as set up in spec 02" — these are
load-bearing and they go wrong. Every assertion about prior state must be
derivable from an ancestor spec's `Done when`, or from a file that is on disk
right now.

A false prior-state claim sends the implementer to reconcile reality mid-unit,
which is exactly when scope blows out. A prior corpus claimed "Prisma is already
installed" when it was not — twice, in one corpus.

## Symbol provenance

Distinguish the two sources explicitly, because they fail differently:

- **Library exports** — resolve against the installed `.d.ts` or the docs
  (`context7`). If it is not there, the spec is wrong.
- **Project symbols** — created by this spec or an ancestor, checked against
  that ancestor's `Done when`.

A prior corpus told an implementer to "use `useLiveblocksFlow`", a name that
does not exist in Liveblocks. The implementer created it as a project hook
because the spec said to, a later spec referenced it again, and a hallucinated
library export became permanent project API by inheritance.

## Length

**40–130 lines. Median around 55.** A spec running long is a signal the unit
should be split — in the reference corpus, the four longest specs were also four
of the highest-divergence units. Length correlated with trouble, not clarity.

## Special specs

**Spec 00 — the decision spec.** Records the stack, storage, state strategy,
testing approach, and design direction, each with the alternatives that lost and
one line of rationale. `Owns: —`. Its `Done when` is the decision being recorded,
not code existing, so it is marked `Done` as soon as it is written and the
scaffold exists. Later forks get their own decision specs — clearly marked, never
buried inside an execution spec.

**Spec 00, the e2e spec, and the verification pass are always `Heavy`**, and so
is any spec touching the data model, auth, routing, the shared data layer, or
the token system. Everything else is `Standard` unless it is mechanical enough
to be `Light` — config, copy, scaffolding, transcription.

**Second to last — the e2e suite** (`NN-e2e-suite.md`). Always present on a
project with a runnable surface, depends on every implementation spec
(`Depends on: 01-21`). It installs the e2e harness, writes a test for every row
of its flow table, and runs them (`[e2e]`). It fixes tests, never the app: an
app bug becomes a new fix spec. Template:
[`../templates/NN-e2e-suite.md`](../templates/NN-e2e-suite.md).

**The last spec — the verification pass.** Always present, always last, always
depends on everything (`Depends on: 00-22`). It rebuilds from clean, re-checks
every earlier spec's `Done when` against the real artifact, runs the whole unit
suite and the whole e2e suite (`[suite]`, with the real counts in its Log),
folds the inventory fragments into `INVENTORY.md`, and does the duplication
sweep described in `reuse-inventory.md`. Its Log is where "spec 05 claimed X,
actually Y" gets recorded.
