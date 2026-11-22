# The design pipeline — v1 → v2 → v3

Any project with a user interface is designed **during planning**, before
`DESIGN-SYSTEM.md` is written, by three skills in a fixed order. Each stage
reads the previous stage's output and writes its own folder. Nothing is
overwritten, so every step is reviewable as a diff.

```
<project>/design/
  README.md        which version is current, what each stage changed, approval
  brief.md         the design brief every stage reads — written once, first
  v1/              gpt-taste   — the idea: layout, type, colour, composition
  v2/              animate     — v1 + motion
  v3/              impeccable  — v2 fine-tuned: polish, audit, fixes
```

`design/` sits at the **project root**, beside `specs/` and `docs/`. `design/v3/`
is the visual source of truth that `DESIGN-SYSTEM.md` is derived from and that
every UI spec cites.

## The three skills

They ship with this skill under `companions/`, so an install of plan-project
installs all three. Use them in this order:

| Stage | Skill | How to run it |
| --- | --- | --- |
| v1 | **gpt-taste** | `/gpt-taste`, or read `companions/gpt-taste/SKILL.md` and follow it |
| v2 | **animate** | `/animate`, or read `companions/animate/SKILL.md` |
| v3 | **impeccable** | `/impeccable`, or read `companions/impeccable/SKILL.md` |

If the agent has the skill registered (Claude Code lists it), invoke it through
the Skill tool. Otherwise read the companion's `SKILL.md`, relative to this
skill's directory, and follow it as written — including its own reference
files. Do not paraphrase a companion from memory; the files are there.

## Before stage 1 — the brief

Write `design/brief.md` from the intake. Every stage reads it, so it carries
everything a designer would ask:

- **What the product is**, who uses it, and the one job it must make easy.
- **The screens to design** — the 3–6 that define the product, by name and
  purpose (e.g. sign-in, dashboard, board view, card detail, settings). Not
  every screen; the ones that set the visual language.
- **The stack's constraints** — e.g. "React + Tailwind; these will be rebuilt as
  components" — so a stage does not lean on something the app cannot use.
- **Brand input**, from the Phase 0 design answer:
  - *Zeki branding* — the palette, Poppins, and logo rules from
    [`brand-zeki.md`](brand-zeki.md) are **fixed inputs**. Say so in the brief in
    those words: they override any stage's own font or colour preferences
    (gpt-taste's "never Inter" list does not get to swap out Poppins, and no
    stage re-colours the brand yellow). Copy the needed logo files from
    `assets/zeki/` into `design/brief-assets/`.
  - *User-supplied* — the palette, kit, reference site or Figma frames,
    transcribed. Fixed inputs, the same way.
  - *Open* — no constraint; gpt-taste decides.
- **Anti-goals** — what it must not look like.

## Stage 1 — gpt-taste → `design/v1/`

Run gpt-taste against the brief. Output is a **static, self-contained
prototype**: one HTML file per screen (or one file with every screen as a
section), its CSS and JS beside it, opening straight from disk with no build
step. CDN links are fine; a dev server is not.

Also write `design/v1/NOTES.md`: the direction in two sentences, the type and
colour choices with one line of why, and any randomised choices the skill made.

## Stage 2 — animate → `design/v2/`

Copy `design/v1/` to `design/v2/` unchanged, then run animate **on v2 only**.
Work through the moments that move: entrances, hover and press feedback, state
changes (loading → loaded, empty → filled), overlays opening and closing, page
or view transitions. animate's own first question is whether something should
move at all — answering "no" for most elements is the skill working.

Respect `prefers-reduced-motion` in every animation.

Add `design/v2/NOTES.md`: every motion decision as a row — element, trigger,
property, duration, easing, reduced-motion fallback. This table becomes the
`States and motion` section of `DESIGN-SYSTEM.md`.

## Stage 3 — impeccable → `design/v3/`

Copy `design/v2/` to `design/v3/` unchanged, then run impeccable **on v3 only** —
its critique/audit pass first, then polish on what it finds: hierarchy, spacing
rhythm, typography, contrast, states, responsive behaviour, edge cases. Point it
at `design/v3/` explicitly (`--target`), so it does not wander into `src/`.

Impeccable keeps its own `PRODUCT.md` / `DESIGN.md`. If it writes them, move
them into `design/v3/` — `specs/DESIGN-SYSTEM.md` is the one design document an
implementing session reads, and two competing ones at the root is how drift
starts.

Add `design/v3/NOTES.md`: what changed from v2 and why, and the audit findings
it fixed or left.

## Approval, then the design system

Show the user `design/v3/` (and the path to open it) and ask, in one
`AskUserQuestion`: approve, or redo a stage — and which. Redoing stage N
rewrites `vN/` onward, never the stages before it. Record the outcome and the
date in `design/README.md`.

Then write `specs/DESIGN-SYSTEM.md` **from `design/v3/`**, not from memory of
it: read its CSS custom properties, font stack, spacing, radii, shadows, and
`v2/NOTES.md`'s motion table, and transcribe them into the closed token list.
Mark it `Source: design/v3 (approved YYYY-MM-DD)`. A value in v3 that is not in
`DESIGN-SYSTEM.md` does not exist for the implementing agents — so do not skip
the transcription to save time.

## How specs use it

- Every UI spec's `**Reuses:**` cites its screen, e.g.
  `design/v3/board.html`, plus the `DESIGN-SYSTEM.md#…` anchors it uses.
- Its Scope says: **rebuild the screen in the app's component system from the
  prototype**, using tokens — never paste the prototype's HTML, CSS, or GSAP
  code into the app. The prototype is the picture; the tokens are the
  materials.
- `design/` is read-only after approval. A spec that needs a design change
  updates `DESIGN-SYSTEM.md` and says so in its Log; it does not edit `v3/`.

## Skip it only for

A project with no user interface. Say so in `README.md`, and do not create
`design/`.
