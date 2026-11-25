# Platform implementation agent guide

## Read before implementing
Read PROGRESS.md (authoritative), ARCHITECTURE.md, DESIGN-SYSTEM.md, INVENTORY.md, docs/planning/platform-owner/api-contract.md and the assigned unit.

## Working rules
Implement one assigned boundary at a time. Independent file-owned units run in parallel per plan-project. Preserve all existing uncommitted changes; do not reset, commit, publish or deploy. The user requested local implementation, so skip external issue/PR operations. Inherit the session model; model headers only retain runner metadata. Do not change the pinned design or add dependencies without a concrete need.

## Verification and reuse
Resolve paths and exports against the real tree. Reuse existing primitives, authentication, resolver and transaction guards. Record new reusable pieces in the assigned inventory fragment. Lead owns PROGRESS.md and wiring files.

## Unit commands
Backend focused: cd backend && .venv/bin/python -m pytest -q tests/unit/test_platform_*.py
Backend all: cd backend && .venv/bin/python -m pytest -q tests/unit
Frontend focused: cd Frontend && npx vitest run src/features/platform
Frontend all: cd Frontend && npm test
Static: cd Frontend && npm run lint && npm run build
Only the e2e and final verification units run Playwright. Mongo tests use only a dedicated temporary fixture-created test database; never production.

## Acceptance tiers
[static] inspect/lint/build; [unit] meaningful isolated tests; [e2e] the single browser suite unit; [suite] final integrated checks; [requires: Mongo replica set] an explicitly gated test. No skipped test is a pass.

## Completion
Append dated evidence, counts and limitations to each spec Log. Do not claim Done without required verification. Report cross-unit issues to the lead; do not edit another owner’s files.
