# Spec NN — Verification pass

**Status:** Not started
**Depends on:** 00-NN
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `specs/INVENTORY.md`
**Reuses:** every earlier spec's `Done when`

## Goal

The final gate. Prove from a clean state that what the spec set promised is
actually true — and record every place it was not.

This spec **observes and reports**. It does not fix. Anything found becomes a
new spec.

## Scope

- A clean rebuild: fresh install, typecheck, lint, build.
- Every earlier spec's `Done when` re-checked against the real artifact, not
  against the ticked box.
- The whole unit suite and the whole end-to-end suite, each run in one go.
- Folding `specs/inventory/*.md` into `INVENTORY.md`.
- The duplication sweep.
- The steering docs re-read against the code that now exists.

## Explicit non-scope

- Fixing anything found. Each finding becomes its own numbered spec → append to
  `README.md` and `PROGRESS.md`.
- New features of any kind.

## Steps

1. Clean install from lockfile. Run `<typecheck>`, `<lint>`, `<build>` and
   record the real output.
2. Run the whole unit suite, then the whole e2e suite, from the clean install.
   Record both real pass counts, e.g. `412/412` and `18/18`. A test that passed
   for the e2e spec and fails now is a finding.
3. Walk every earlier spec's `Done when`. For each ticked box, confirm it
   against the artifact. Note every box that does not hold.
4. Fold every `specs/inventory/NN-*.md` fragment into `INVENTORY.md` under
   its section, then delete the fragments. Run the duplication sweep (see the skill's `reuse-inventory.md`): near-
   duplicate exported symbols, similar component names, raw hex outside the
   token file, and `INVENTORY.md` entries whose file no longer exists.
5. Re-read `ARCHITECTURE.md` against the real tree — every invariant, one at a
   time. Note drift.
6. Re-read `DESIGN-SYSTEM.md` against the real styles. Note any token used that
   is not listed, and any listed token that is unused.
7. Record everything in the Log with real numbers, and file the follow-up specs.

## Done when

- [ ] Clean install + `<typecheck>` + `<lint>` (0 errors, 0 warnings) + `<build>` all pass. [static]
- [ ] Whole unit suite and whole e2e suite pass from a clean install; both real counts are in the Log. [suite]
- [ ] Every inventory fragment is folded into `INVENTORY.md`. [static]
- [ ] Every earlier spec's `Done when` has been re-checked and the result recorded. [static]
- [ ] Duplication sweep run; findings in the Log. [static]
- [ ] Every invariant in `ARCHITECTURE.md` checked against the tree. [static]
- [ ] No token used outside `DESIGN-SYSTEM.md`'s list. [static]
- [ ] Every finding has either a follow-up spec or a line saying why it is accepted. [static]

## Log

- **YYYY-MM-DD** — <real numbers, real findings, real corrections>
