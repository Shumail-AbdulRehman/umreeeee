# Spec NN — End-to-end suite

**Status:** Not started
**Depends on:** 01-MM
**Model:** Heavy — `<claude id>` · `<openai id>` · `<gemini id>`
**Issue:** —
**Owns:** `<playwright.config.ts>`, `e2e/`, `specs/inventory/NN-e2e-suite.md`
**Reuses:** every earlier spec's `Done when`, `ARCHITECTURE.md#test-data`

## Goal

The only spec that writes or runs end-to-end tests. Install the harness, write
one test file per flow area covering every row of the flow table below, and get
the suite green against the real, running app — so the integrated paths are
proven once, after every implementation spec has merged.

## Scope

- Install and configure the harness fixed in spec 00: `<Playwright>`, with
  `webServer` booting the app, `baseURL`, `<chromium only>`, trace and
  screenshot on failure, and the test-data strategy from `ARCHITECTURE.md`.
- Add the `<test:e2e>` script named in `AGENT-GUIDE.md`.
- Write the tests for every flow below. Role- and text-based locators; assert
  persisted state after a reload; web-first assertions, no sleeps; each test
  runs alone.

### Flow table — the coverage contract

| Flow | Built by | Proves |
| --- | --- | --- |
| <Sign up, sign out, sign back in> | <05, 06, 09> | <the session survives a reload> |
| <Create a board, add three cards> | <11, 14> | <cards are still there after a reload> |
| <…> | <…> | <…> |

## Explicit non-scope

- Fixing application code. A failure caused by an app bug becomes a new
  numbered fix spec, appended to `README.md` and `PROGRESS.md`; this spec's Log
  names it and the test stays failing (marked `fixme` with the fix spec number).
- Unit tests — each spec owns its own.
- Clean-install verification and the duplication sweep → the verification pass.

## Reuse first

- Seed data comes from the per-feature seeds/fixtures the earlier specs
  created (`INVENTORY.md`, `specs/inventory/`). Do not build a second seeding
  path.
- Use any `data-testid` conventions already recorded in the inventory; add one
  only where semantics cannot reach the element, and record it.

## Steps

1. Install the harness and its browser; configure it as above.
2. Write a single trivial test that loads the app; get it green. This proves the
   harness before any real test depends on it.
3. Write one file per flow area under `e2e/`, covering every row of the flow
   table.
4. Run the whole suite headless. For each failure, decide: test bug (fix the
   test) or app bug (file a fix spec, mark the test `fixme` with its number).
5. Record the real count, every fix spec filed, and the runtime in the Log.

## Done when

- [ ] `<test:e2e>` passes headless with 0 failures (excluding `fixme` tests
      that name a fix spec); the real count is in the Log. [e2e]
- [ ] Every row of the flow table has at least one test, named in the Log. [static]
- [ ] Every app bug found has a numbered fix spec in `README.md` and `PROGRESS.md`. [static]
- [ ] `<typecheck cmd>` and `<lint cmd>` pass with 0 errors, 0 warnings. [static]
- [ ] `<build cmd>` passes. [static]
