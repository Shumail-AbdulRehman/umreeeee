# Testing — unit tests per spec, one e2e spec at the end

A spec is not done because the code compiles. It is done when its behaviour is
proven by tests that ran in this session. What changes here is **which** tests
and **where**:

| Gate | Tag | Runs | Where |
| --- | --- | --- | --- |
| This unit's logic works | `[unit]` | the unit tests this spec wrote, then the whole unit suite | **every implementation spec** |
| The user's paths work, integrated | `[e2e]` | the end-to-end tests, written in one place | **the e2e spec only** — second to last |
| Everything, from clean | `[suite]` | the whole unit suite **and** the whole e2e suite | **the verification pass only** — last |

**No implementation spec writes or runs an end-to-end test.** Not a scoped one,
not a smoke set, not "just one for this screen". End-to-end runs are the slowest
gate a session can owe, and with Orchestro running a dozen specs at once they
are also the most contended — a dev server per worktree, a browser per worker,
ports colliding. Unit tests are fast, isolated, and run in parallel without
interfering. The integrated proof is bought once, at the end, by a spec whose
whole job it is.

## What every spec owes: `[unit]`

Every spec that creates or changes code carries at least one `[unit]` bullet,
and it names the test files:

```markdown
- [ ] `pnpm test src/features/cards/card-service.test.ts` passes: moving a card
      to a column it is already in is a no-op; moving to a missing column
      throws `ColumnNotFound`. [unit]
- [ ] `pnpm test` (the whole unit suite) passes with 0 failures; the real count
      is in the Log. [unit]
```

- **Name the behaviour, not "tests pass".** The first bullet says what the test
  proves, so a reviewer can tell a real test from a placeholder.
- **The whole unit suite is cheap, so every spec runs it.** That is the
  regression cover that the old per-spec smoke set used to give, at a fraction
  of the cost. If the unit suite ever takes more than about a minute, that is a
  finding — say so in the Log, do not drop the run.
- **UI specs unit-test components too**: render with the project's component
  test library (Testing Library, `@testing-library/react-native`, the
  framework's equivalent) and assert on roles and text — a loading state, an
  empty state, an error message, a disabled submit. Not snapshots.
- **Mock at the boundary, not inside the unit.** The network client, the clock,
  the database driver — through the seam `ARCHITECTURE.md` names. A test that
  mocks the function it is testing proves nothing.
- **Test files live next to the code** (or wherever `ARCHITECTURE.md` says) and
  belong to the spec that owns the code. They go in its `**Owns:**` line.

## The unit harness

The scaffold spec installs and configures the unit runner and leaves it green on
one trivial test, so no later spec decides it. It fixes the commands every later
spec cites:

| Stack | Runner | Component tests |
| --- | --- | --- |
| Vite / React / Node | **Vitest** | `@testing-library/react` + `jsdom` |
| Next.js | **Vitest** (or Jest if already present) | `@testing-library/react` |
| React Native / Expo | **Jest** (`jest-expo`) | `@testing-library/react-native` |
| Python | **pytest** | — |
| Go | `go test` | — |
| Anything else | the stack's standard runner — record it in spec 00 | — |

`AGENT-GUIDE.md` names two commands: the single-file run and the whole-suite
run. Specs cite those, never a hand-assembled command line.

## The e2e spec: one, second to last

```markdown
# Spec 23 — End-to-end suite

**Status:** Not started
**Depends on:** 01-22
**Model:** Heavy — …
**Owns:** `playwright.config.ts`, `e2e/`
```

It **installs the harness, writes every end-to-end test, and runs them** — one
spec, one session, whole-app view. It depends on every implementation spec, so
Orchestro dispatches it alone after the last wave merges. Template:
[`../templates/NN-e2e-suite.md`](../templates/NN-e2e-suite.md).

Its Scope is a **flow list** the planner writes while the whole set is in view:
every user-reachable capability, one line each, with the spec that built it.

```markdown
| Flow | Built by | Proves |
| --- | --- | --- |
| Sign up, sign out, sign back in | 05, 06, 09 | the session survives a reload |
| Create a board, add three cards | 11, 14 | cards are still there after a reload |
| Drag a card between columns | 15 | the new column persists |
```

That table is the e2e coverage contract. A capability missing from it is a
capability with no integrated proof. If the list runs past about 15 flows, it is
still one spec — the tests are mechanical once the flows are named — but give
it the `Heavy` tier and say in `README.md` that it is the long one.

### What the e2e spec must settle

- **`webServer`** in the config, so the suite boots the app itself
  (`reuseExistingServer: !process.env.CI`).
- **`baseURL`**, so tests say `page.goto('/board')`, not a port.
- **Chromium only** for a v1, unless the brief says otherwise — and say so.
- **Trace and screenshot on failure** (`trace: 'on-first-retry'`). An unattended
  failure with no trace is unreadable.
- **One test-data strategy**: seeded fixture, API setup, or UI setup. Pick one,
  record it in `ARCHITECTURE.md`.
- **One file per flow area** under `e2e/`, named for the area.

### Rules for the tests

- **Role- and text-based locators** (`getByRole`, `getByLabel`, `getByText`).
  Add a `data-testid` only where semantics genuinely cannot reach the element.
- **Assert persisted state.** Reload and assert again — an optimistic update
  that never reached the server is the most common false pass.
- **Web-first assertions**, never `waitForTimeout`.
- **Independent tests.** Any one can run alone.

### When an e2e test fails

The e2e spec is allowed to fix a **test**. It is not allowed to fix the **app**.
A failure that is a real bug in an earlier spec's code becomes a new numbered
fix spec, filed in `README.md` and `PROGRESS.md`, and the e2e spec's Log names
it. Otherwise the last spec silently turns into "fix everything", which is the
oversized unit this whole method exists to avoid.

### Done when, on the e2e spec

```markdown
- [ ] `pnpm test:e2e` passes headless with 0 failures; the real count
      (e.g. `18/18`) is in the Log. [e2e]
- [ ] Every row of the flow table has at least one test, named in the Log. [static]
- [ ] Every failure that was an app bug has a fix spec number in the Log. [static]
```

## The verification pass: `[suite]`

The last spec runs both suites from a clean install — the whole unit suite and
the whole e2e suite — and records the real numbers. It is the only spec tagged
`[suite]`. Template: [`../templates/NN-verification-pass.md`](../templates/NN-verification-pass.md).

## Non-web stacks

The e2e spec is "prove it end to end with something that runs", not "Playwright
specifically". Substitute and say so in `AGENT-GUIDE.md`:

| Stack | Harness |
| --- | --- |
| Web app / SPA / SSR | **Playwright** |
| React Native | **Maestro** (or Detox if already present) |
| Electron / Tauri | **Playwright** via its Electron support |
| Headless API / CLI | Playwright's `request` fixture, or supertest/httpx against a **really started process** |
| Library | Integration tests from a consuming test package |

## Where this is enforced

1. `AGENT-GUIDE.md` states the rule and both unit commands, and the e2e command
   with the note that only the e2e spec runs it.
2. `validate-specs.py` errors when a code-owning spec has no `[unit]` bullet,
   when `[e2e]` appears anywhere but the e2e spec, when `[suite]` appears
   anywhere but the verification pass, and when there is not exactly one e2e
   spec sitting directly before the verification pass and depending on every
   implementation spec.
3. The Log is where the real counts land. A Log without them is how you spot a
   session that skipped the run.
