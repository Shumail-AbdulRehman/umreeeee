# Agent guide: Prompt Studio

## Read before implementing

1. PROGRESS.md is current-state authority and overrides previous-session assumptions.
2. ARCHITECTURE.md, DESIGN-SYSTEM.md, INVENTORY.md and inventory/ fragments.
3. The assigned spec and cited approved design screen.

## One bounded unit at a time

Implement only its Owns files and acceptance criteria. Log extra work rather than silently expanding scope. Other units may run concurrently; never edit their files or shared tracker rows. The lead records merged/local completion. Record reusable additions in the assigned inventory fragment. A fresh dispatched session reads the same handoff; no chat memory is required.

## Existing workspace and publication

The user approved the design and requested direct implementation in this existing, extensively dirty working tree. Preserve all pre-existing changes; never git add -A, stash/reset, commit mixed changes, push, create remote issues or publish a deployment as a side effect. This local execution records Issue: — and local verification rather than pretending a PR merged. Future isolated Orchestro execution may use the search-before-create issue/PR workflow from .ai/plan-project/references/github-workflow.md; never merge your own PR. Log unavailable tooling rather than blocking authorized local work.

## Verify before asserting

Resolve every file and library symbol against the actual tree, package manifest, installed types or dated official research in docs/research/. Separate existing packages from dependencies introduced by spec 01. Preserve the approved brand and every API/body/auth boundary. Do not print secrets or env values while debugging. Baseline hashes for protected sources are under /tmp/averiq-studio-implementation-baseline/.

## Reuse first

Search INVENTORY.md, inventory/ and source by responsibility before adding helpers. Use the existing Radix-backed primitives. No custom Markdown parser, raw HTML injection, duplicate API client or state library. Tokens are closed in DESIGN-SYSTEM.md; feature CSS uses declared incumbent aliases, not raw colors.

## Model sizing

Respect each spec's Heavy/Standard/Light tier; future dispatch may use any verified provider ID. If a unit stalls because of complexity, re-tier and document it. Headers do not change the app's configured models or this agent's current model.

## Testing and acceptance tiers

From Frontend: npm run test:components -- <test-file> for a component unit; npm test for all existing Node and new component tests; npm run lint; npm run build. Only spec 07 introduces and runs npm run test:studio and existing workflow browser checks. Only spec 08 runs both whole suites from a clean install. Tags: [static] file/lint/build, [unit] unit/component behavior, [runtime] one-process checks, [e2e] integrated flow, [suite] final whole proof, [requires: services] unverified external boundaries. Never tick a criterion without actual output/counts.

## Before completing

Prove the unit and whole unit suite, lint and build. This JavaScript repository has no TypeScript compiler command; do not invent one. Avoid snapshots and implementation-mirroring tests. Record created files, behavior, counts and limitations in the spec Log and its inventory fragment. No browser tests in ordinary implementation units. Log is append-only and last. The lead updates tracker status. If blocked, record evidence and the smallest missing decision; do not guess past auth/data contracts.
