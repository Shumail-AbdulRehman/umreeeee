# The `docs/` folder — research and raw planning

Everything the planner looked up or drafted on the way to the spec set is saved
under `<project>/docs/`, at the project root. Specs carry conclusions; `docs/`
carries the evidence. A spec that says "Vitest, not Jest" is trustworthy when
`docs/research/` holds what was checked, where, and when.

Nothing here is read by `spec-run` or Orchestro. It is for the humans and for a
later planning session that has to extend the set without redoing the research.

```
docs/
  README.md               one line per file below
  research/
    stack.md              versions, idioms, folder conventions — sources + dates
    libraries.md          every library export a spec names, and where it was confirmed
    models.md             the model ids written into **Model:** lines, and the pages checked
    <topic>.md            anything else looked up: an API, a provider, a competitor
  planning/
    brief.md              the user's brief, verbatim
    intake.md             every question asked and the answer given, verbatim
    repo-survey.md        existing repo only: what Phase 0's commands found
    dag.md                the raw dependency draft — every edge, "consumes what"
    splits.md             features → specs, and the splits considered and rejected
    validator.md          the final validate-specs.py output
```

## Rules

1. **Write as you go, not at the end.** Each phase saves its own output before
   the next phase starts. Research that only exists in the chat is lost when the
   session ends.
2. **Cite and date.** Every research note names its source (a URL, a context7
   library id, a file in `node_modules`) and the date it was read. "Vitest 4 is
   current" is not evidence; "vitest 4.1.2 — npm view vitest version,
   2026-10-19" is.
3. **Raw is fine.** These are working notes. Tables, bullet dumps, pasted command
   output — all acceptable. Polish goes into the steering docs, not here.
4. **Verbatim where it is the user's.** The brief and the intake answers are
   copied, not summarised: they are what the scope was decided from.
5. **An existing `docs/` is not overwritten.** If the project already has one,
   add `research/` and `planning/` inside it, and never replace a file you did
   not create. If those names are taken, use `docs/plan-project/research/` and
   `docs/plan-project/planning/` and say so in `specs/README.md`.
6. **No secrets.** API keys, tokens, `.env` values, and private URLs never go
   into `docs/`, even when a research step involved them.

## Which phase writes what

| Phase | Writes |
| --- | --- |
| 0 — ground truth, intake | `planning/brief.md`, `planning/intake.md`, `planning/repo-survey.md` |
| 1 — stack | `research/stack.md`, `research/libraries.md` |
| Design pipeline | nothing here — it has `design/` |
| 3 — split | `planning/splits.md`, `planning/dag.md`, `research/models.md` |
| 4 — validate | `planning/validator.md` |
