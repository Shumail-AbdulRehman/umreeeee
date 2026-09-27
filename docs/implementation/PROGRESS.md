# Implementation progress — updated 24 September 2026

Phase 1 record below is historical. Phase 2 functionality has since been implemented; Phase 3 is in progress as recorded at the end. Deployment remains out of scope.

## Phase 1 — 23 September 2026

Phase 1 application implementation is complete for a fresh MongoDB installation. Phase 2 and Phase 3 were not started. Legacy-data migration against a real application database is not signed off because no legacy `app.db`, application `.env`, or verified backup exists in this workspace. This file records actual checks and remaining external validation; a passing build alone is not a security sign-off.

## Implemented in this worktree

- MongoDB-only live storage, transaction topology check, liveness/readiness separation, expanded indexes, request IDs, safe error envelope, strict secrets, and bounded auth settings. The old JSON store is accepted only by the explicit migration command.
- Public signup no longer reuses an existing company slug. New JWTs use user ID and token version; inactive/unverified users and suspended companies are rejected. OTP delivery never returns/logs a code; challenges have random IDs and conditional consumption; password reset revokes old sessions. Login and recovery have Mongo-backed fixed-window limits.
- Canonical `org_admin`, `user`, `super_admin` checks. Employee invitation, pagination, group assignment, status changes, resend, last-admin protection, and admin-serialized mutations. Hard-delete HTTP routes were removed.
- Encrypted integration credentials, safe masked reads, provider URL allowlist and redirect rejection, server-owned system instructions, stored-credential model discovery, status/version support, and tenant-scoped prompt integration lookup. Prompt Studio explicitly says enforcement is not enabled.
- Server-owned groups, typed policy definitions and immutable policy revisions, settings, audit reads, Super Admin metadata/suspension, and real dashboard counts. Group/integration archives reject non-archived policy dependencies.
- Frontend admin pages connected to API data; no dashboard mock fallback, fake analytics navigation, or inactive topbar controls. Shared API errors, canonical permissions, mobile navigation, responsive shell, and keyboard-focused modal component.
- The policy list now exposes its server-supported category, group, and integration filters. Integration editing clears stale model selections when provider credentials or the Ollama origin changes, and ignores model-discovery responses after the editor closes.
- Dry-run-first migration and explicit Super Admin local command. Local setup instructions in `backend/README.md`.
- Provider model discovery now rejects malformed response shapes with a controlled error; JSON migration dry-run checks source-to-target ID and normalized identity collisions as well as missing source company references.
- `PRODUCT.md` records the delegated product-UI direction: calm, precise, trustworthy administration with honest enforcement status.
- Concurrent signup and single-use code/token flows retry transient Mongo transaction conflicts, then reject stale attempts. Administrative transactions recheck company status; provider calls recheck company/account availability and token version immediately before execution.
- User status/role/group filters, invitation delivery status, field-level server errors, policy dependency counts and filtered links, and keyboard focus restoration are connected to real data. The overview uses a task-focused status list instead of repeated metric cards.

## Verification completed

- Baseline before changes: frontend `npm run lint` and `npm run build` passed.
- Backend `.venv/bin/python -m pytest -q tests` → 53 passed with `TEST_MONGODB_URL` pointed at a disposable single-node replica set; only upstream deprecation warnings. Without a test URL, Mongo tests skip.
- After changes: frontend `npm run lint` and `npm run build` passed. Python `compileall` passed. `git diff --check` passed.
- Headless Chrome against a separate synthetic database: admin login, group creation, Ollama integration discovery/configuration with a fake local provider, scoped policy draft, invitation failure messaging, invitation acceptance, regular-user role navigation and server-owned membership, settings save, Prompt Studio execution, signup/verification, and password reset passed. Keyboard-only group creation, modal focus return, duplicate-name error recovery, and group/integration policy deep links passed. The main administration routes had no page-level horizontal overflow at 1366×768, 1024×768, and 390×844. Real provider credentials and sensitive prompts were not used.
- Migration CLI `--dry-run` against the synthetic browser database reported no conflicts and made no changes. An automated Extended JSON import test ran import/migration twice, preserved the source bytes, and verified no duplicate group or double-encrypted key.
- Dependency versions used: FastAPI 0.116.1, PyMongo 4.13.2, cryptography 50.0.1, regex 2026.9.10, pytest 9.1.1, httpx 0.28.1. Frontend lockfile was already present and `npm ci` completed.

## Acceptance coverage

| Check | Evidence |
|---|---|
| P1-T01–T06 | Signup slug admission and concurrency, delivery failure, verification/reset/invitation single-use and concurrent consumption, session revocation, inactive account, login throttling, resend cooldown and `Retry-After` tests. |
| P1-T07–T10 | HTTP tests of every ordinary admin mutation, cross-tenant resource lookups, serialized final-admin demotion, malformed IDs/fields/filter values, and safe error envelopes. |
| P1-T11–T16 | Encrypted integration storage and safe read DTO, blank-key edit, keyless Ollama, URL/redirect rejection, persistent group membership, archive dependency conflicts, policy revision/stale-write tests, and browser group/policy workflows. |
| P1-T17–T19 | Repeated synthetic migration/import, Super Admin suspension boundaries, and explicit Mongo-unavailable behavior. |
| P1-T20 | Headless Chrome viewport, keyboard-only group create, modal focus, and 409 form recovery observations. |

## External sign-off still required if upgrading existing data

1. Supply an actual legacy database or explicit `app.db` export plus a verified backup. Run `python -m scripts.migrate_phase1 --dry-run`, review any identity/role conflicts, apply with `--backup-confirmed`, then repeat the dry run. No real application database or source file was modified here.
2. Configure a local SMTP sink or approved email service and confirm one delivered message end to end. Automated tests use fake delivery and the browser exercise confirmed the unavailable-delivery path only.
3. Do not present Phase 1 policies as enforced. Prompt execution remains explicitly unenforced until Phase 2. The legacy prompt-run history shape remains for Phase 2 migration.

## Phase 2 — 24 September 2026

The ordinary HTTP prompt route now uses `ProtectedPromptService.execute_protected` for policy snapshotting, input/output enforcement, idempotent admission, one-time provider dispatch, encrypted retained content, transactional terminal outcome/violation/notification persistence, and safe run detail. The old `PromptWorkspaceService` remains as historical internal code for Phase 1 tests but is not wired to an HTTP route. There is no ordinary public bypass around the protected path. BLOCK, LOG, ALERT, missing active policy, unavailable validator, provider failure, blocked output, and interrupted processing have explicit outcomes. Group and integration scope use AND semantics and server-owned membership/system instructions. The provider boundary supports OpenAI, Groq, DeepSeek, Anthropic, Gemini, and allowlisted Ollama with a bounded HTTP transport and no automatic retry.

Administrators can test a policy without a provider call and cannot activate an unavailable semantic detector. Violations and recipient-only notifications are persisted and reviewable. Dashboard, Insights, Activity, Violations, Catalog, Latency, and Spend now use live tenant/owner-scoped records rather than demonstration metrics. Per-model price estimates are administrator-managed and snapshot into each run. Settings expose active-policy requirement and retention. Prompt history/detail, notification panel, review form, and model prices are connected in the frontend. A dry-run-first legacy prompt migration, retention cleanup, and interrupted-run reconciler were added.

Local verification with a disposable transaction-capable MongoDB: the full backend suite passed with 75 tests. Frontend lint and build, Python compilation, and `git diff --check` passed. A headless browser with a synthetic organization and fake Ollama confirmed zero provider calls on an input BLOCK, one on an allowed request, a visible violation with a working safe-run deep link, and no document-level overflow/page errors on seven Phase 2 pages at 390 px. The 100-input/20-output detector evaluation and mock/semantic load measurements are recorded in [EVALUATION_RESULTS.md](../EVALUATION_RESULTS.md).

Known limits: the tiny synthetic set is not a security guarantee; at threshold 0.8, injection missed 4/20 jailbreaks and toxicity missed 8/20 harmful input examples. On this 8-logical-CPU machine, the 50-user warmed semantic check missed the 200 ms p95 target and 22/50 checks timed out safely under a 5-second budget. Native model execution is bounded by two slots and a 50-waiter queue but not forcibly killed if native code hangs. These are performance/coverage limitations, not a silent pass. No live provider credentials or real legacy application database were available for external sign-off.

## Phase 3 — 24 September 2026 (implementation in progress)

P3-01 and P3-02 are implemented: original 25-template synthetic catalog plus five controls, deterministic manifest and exact-evidence evaluator, tenant-scoped draft/edit/clone APIs, immutable launch snapshot, and transactional Mongo job outbox. P3-03 is implemented at the code boundary: durable Pika publishing/consumer acknowledgement, worker execution lease, shared integration admission, bounded retry, cancellation, and conservative uncertain-call recovery. A real RabbitMQ service was unavailable, so broker integration and multi-worker pacing cannot be signed off. P3-04 is implemented in the Red Team console: three-step editor, persisted list/detail/progress, cancellation, result inspection, paired comparison, JSON/CSV export, and browser print. P3-05 is partially verified at desktop/tablet/mobile widths; P3-06 local guide, route contracts, test evidence, limitations, report corrections, and explicit synthetic seed script have been added.

Backend full regression passed with 92 tests on a disposable Mongo replica set after a transient Phase 1 admin-race retry fix; focused post-report-edit checks were rerun. Frontend lint/build, Python compilation, and diff whitespace checks passed. Browser observations: logged-in Red Team draft reopened, launch persisted 10 pending jobs with RabbitMQ offline, cancellation finalized them, results loaded, print hook fired, and no page-level error or document horizontal overflow appeared at 1366, 1024, and 390 px. One draft-save render error was found and corrected during the walkthrough. No real provider calls were made.

Remaining for the Phase 3 completion gate: true local RabbitMQ publish/consume/reconnect/crash-after-confirm testing; shared pacing with multiple live workers plus ordinary traffic; deeper cancellation/authority race tests; keyboard/hidden-tab/logout workflow. Protected output withholding/source segregation and content-retention export are now covered by fake-provider/Mongo tests. See `docs/TEST_RESULTS.md` for the precise acceptance matrix. Do not report Phase 3 as complete or deployed until these checks pass.
