# Spec NN — <Title>

**Status:** Not started
**Depends on:** Spec NN, Spec NN
**Model:** <Heavy|Standard|Light> — `<claude id>` · `<openai id>` · `<gemini id>`
**Issue:** —
**Owns:** `path/to/file.ts`, `path/to/file.test.ts`, `path/to/other.tsx`, `specs/inventory/NN-<slug>.md`
**Reuses:** `path/to/existing.ts` (spec NN), `design/v3/<screen>.html`, `DESIGN-SYSTEM.md#<anchor>`, `INVENTORY.md#<anchor>`

## Goal

<One or two sentences in plain terms: what is true when this is done, and what
it explicitly defers. No "and also".>

## Scope

<The actual files, areas, and behaviours this spec touches — specific enough
that someone could start without re-deriving it. Intent level, not code level:
"status enum: DRAFT, ARCHIVED", not a Prisma block.>

## Explicit non-scope

- <Something a competent agent would plausibly do here but must not> → spec NN.
- <Another> → spec NN.

## Reuse first

- <The specific temptation, named.> Do not <create the second thing>.
- <Where the existing helper/component/token lives, and that it is the one to use.>

## Steps

1. <Concrete enough to start from, not a restatement of the Goal.>
2. <…>

## Done when

- [ ] `<unit cmd> path/to/file.test.ts` passes: <the behaviour it proves —
      the normal case and the edge case that matters>. [unit]
- [ ] `<unit suite cmd>` passes with 0 failures; real count in the Log. [unit]
- [ ] <Verifiable statement about behaviour, if one needs the app running.> [runtime]
- [ ] `specs/inventory/NN-<slug>.md` lists what this spec created for reuse. [static]
- [ ] `<typecheck cmd>` and `<lint cmd>` pass with 0 errors, 0 warnings. [static]
- [ ] `<build cmd>` passes. [static]
<!-- No [e2e] here — end-to-end tests live in the e2e spec. Add this spec's
     user-visible flow to that spec's flow table instead. -->

## Log

<!-- Added when work starts. Do not scaffold this empty — delete the heading
     until there is a first entry. -->
