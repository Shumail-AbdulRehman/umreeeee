# Spec 00 — Red Team on promptfoo: decisions

**Status:** Done
**Depends on:** —
**Model:** Heavy — `claude-opus-5-5` · `gpt-6.2-sol` · `gemini-4-argon`
**Issue:** —
**Owns:** —
**Reuses:** `docs/planning/promptfoo/brief.md`, `docs/planning/promptfoo/intake.md`, `docs/research/promptfoo-redteam.md`, `docs/research/promptfoo-integration.md`, `docs/research/promptfoo-local-probe.md`, `design/red-team/v3/`

## Goal

Record every decision the promptfoo specs inherit, with what lost and why, so no implementing Codex session re-decides them.

## Scope

**Engine.** promptfoo `0.126.0` (MIT), pinned exactly in a root `package.json` with a Linux-generated `package-lock.json`, run as a CLI subprocess by the existing Python red-team worker: `redteam generate` writes the attack suite, `redteam eval` runs and grades it. Lost: the in-house engine (owner: "remove our custom logic"); the experimental JS API `promptfoo.redteam.run` (JavaScript-only, typed differently from the docs); `npx promptfoo@latest` (unpinned); Option A, promptfoo as an external tool (rejected by the owner).

**Attack generation: promptfoo hosted generation** (owner: "just go with the full promptfoo one"). The worker presets the account email from `PROMPTFOO_ACCOUNT_EMAIL` into promptfoo's config dir before every run; the address is verified once by the owner through promptfoo's emailed link. Lost: local generation (the 2026-11-22 probe got 0 tests: `hijacking` is remote-only and Groq gpt-oss refused to write attacks); the `CI` placeholder-email bypass (hosted-API behaviour with a null email is unverified).

**Grading: local, on an organization integration** chosen per test (the "grader"), passed to promptfoo as its grading provider. `OPENAI_API_KEY` is never placed in the subprocess environment, because its presence silently switches generation to local. Lost: promptfoo's hosted grading (sends target replies to promptfoo).

**Target routing: the bridge.** promptfoo's target is a thin, standard-library-only Python provider that forwards each attack over loopback HTTP to a bridge server running inside the worker process, which executes it through the existing services: raw → `ProviderService`, protected → `ProtectedPromptService.execute_protected` with the frozen launch snapshot. Lost: a provider that imports the backend (a second ~300 MiB Python process per worker); promptfoo's HTTP provider to the public API (no per-call idempotency key, Heroku 30 s router limit); `exec:` (no token usage or guardrails).

**Verdict authority.** A protected-mode block whose matched rule is outside `system_prompt` decides `pass` with source `policy`. Otherwise promptfoo's grader decides: `gradingResult.pass` true → `pass`/`grader`, false → `fail`/`grader`. Provider errors, grader errors and missing results → `error`. promptfoo PASS means the target defended.

**Raw versus protected stays.** A generated suite is stored once and reused by its clone, so the paired run sends the identical attacks (promptfoo generation is not reproducible). Pairing is by suite and promptfoo test index.

**Catalog.** A curated, committed catalog derived from the installed promptfoo package: about 20 plugins that need no extra per-plugin config, all single-turn encodings, and the hosted strategies the owner wants (`jailbreak:meta`, `jailbreak:composite`, `crescendo`, `goat`, `multilingual` only if the research shows it is a strategy id in 0.126.0). Plugins that need extra config (`indirect-prompt-injection`, `policy`, `intent`, domain plugins) are out of v1. Lost: exposing every promptfoo plugin (100+, many needing config).

**Scoring and compliance.** promptfoo's per-plugin risk formula already ported in `backend/app/red_team/risk_scoring.py` stays (promptfoo does not ship it in its output or exports). Framework mappings are extracted from the installed promptfoo package by a committed script, not hand-written; a framework control is compliant only when every mapped decided attack defended (promptfoo's rule).

**Limits.** Attacks are capped at 200 generated tests per test; tests per plugin 1-10; eval concurrency 2; one promptfoo run per worker at a time; overall run timeout 2 hours.

**Execution model.** One queue job per test (not per attack). The existing outbox dispatcher, lease fencing and recovery process stay. An interrupted run is never replayed: generation-phase interruptions requeue; eval-phase interruptions finalize the test as `failed` with reason `interrupted`, keeping imported results.

**Legacy data.** Existing red-team tests of the old engine are exported to a JSON file and then deleted by a one-off script with dry-run and apply modes; no legacy screens remain.

**Deployment.** Heroku buildpacks `heroku/nodejs` (index 1) then `heroku/python`; `engines.node` `24.x`; the worker dyno is Standard-2X (1 GB) because Node alone uses ~315 MiB; promptfoo is invoked by absolute path `<repo>/node_modules/.bin/promptfoo`. Slug limit is 1000 MB compressed; promptfoo adds ~130 MB compressed.

**Design.** The approved `design/red-team/v3/` screens (list, new test, running, report, states) remain the visual source of truth. The owner's request for a good, non-generic design is met by reusing that design, which already went through gpt-taste, animate and impeccable, plus a polish spec for the new promptfoo-specific parts. Lost: a new three-stage design pass (the owner's usage limit).

**Testing.** Backend pytest with fakes: a fake `promptfoo` executable (a small script that writes the same files) for runner and worker tests; no live promptfoo, provider or RabbitMQ in automated tests. Frontend Vitest + Testing Library; Playwright with intercepted APIs in the e2e spec only. One live smoke run is a `[requires:]` criterion in the verification pass.

**Implementer.** Codex (`gpt-6.2-sol`) implements every spec; Claude reviews.

## Explicit non-scope

- Writing the catalog content → spec 02.
- The Heroku buildpack and dyno changes → spec 01.
- Deleting the old engine → spec 19.

## Steps

1. Confirm each decision against the three research files and the intake.
2. Leave this file as the record; a changed decision needs a new decision spec.

## Done when

- [x] Every decision names what lost and why, and matches the intake answers. [static]
- [x] `python3 /home/shumail/.claude/skills/plan-project/scripts/validate-specs.py specs-promptfoo` reports no errors for this file. [static]

## Log

- **2026-11-22**: Recorded the planner's decisions. This completed decision record has no implementation issue.
