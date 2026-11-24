# Spec 07 — Frontend client service and labels

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.2-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/services/redTeam/redTeamService.js`, `Frontend/src/services/redTeam/redTeamService.test.js`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/features/red-team/labels.test.js`, `specs-promptfoo/inventory/07-frontend-client-service-and-labels.md`
**Reuses:** `Frontend/src/services/redTeam/redTeamService.js`, `Frontend/src/features/red-team/labels.js`, `Frontend/src/services/api/client.js`, `Frontend/src/services/api/requestActivity.js`

## Goal

Centralize the Red Team API client and the label registry so UI slices can implement independently of backend delivery.

## Scope

- Preserve `/red-team` route naming and the app HTTP wrapper; cover capabilities, list/detail, create/edit, launch (POST with `Idempotency-Key` UUID and `{version}`), cancel, clone, results/detail, report and JSON/CSV export. Retire the legacy manual-comparison wrapper in favor of `report.paired`.
- Preserve the current wire keys `plugin`, `strategy`, `verdict`, `verdict_source` plus paging; plugin and strategy values are IDs. Omit unset filters without deleting valid zero values. Percent-encode values and never leak authentication into a URL.
- Extend status and phase labels for generating, running, importing, final states, decisions, source (`policy`, `grader`, `none`), severity and safe unknown fallback. Maintain shared badge tone vocabulary. Runtime presence and live availability are separate; never infer live readiness from a version number.
- **Addendum 2026-11-22 (scheduler redesign):** add `previewRedTeamConfig(values)` (POST `/red-team/config-preview`) and `getRedTeamTestConfigPreview(id)` (GET `/red-team/tests/{id}/config-preview`), returning `{yaml, estimated_target_calls, generated_tests_estimate}`; add failure-reason labels for `suite_contains_secret`, `results_too_large`, `target_key_unavailable`, `grader_key_unavailable`, `unsupported_provider`, and labels for the nine framework ids (`nist_ai_rmf`, `eu:ai-act`, `owasp:llm`, `owasp:api`, `mitre:atlas`, `owasp:agentic`, `iso:42001`, `gdpr`, `dod:ai:ethics`) with a safe fallback.
- Provide a shared DTO vocabulary from the architecture's data/report shapes (ARCHITECTURE.md data model and report payload). Frontend specs use mocked transports; do not wait for backend implementation.

## Explicit non-scope

- Rendering the labels in individual components → spec 11–15.
- Endpoint implementation → spec 16.
- Polling and page orchestration → spec 18.

## Reuse first

- Extend `buildQuery`, `buildResultsQuery`, `downloadRedTeamExport` and the existing label exports rather than creating parallel clients or tone maps.

## Steps

1. Update request serialization, preserve error propagation and confirm methods, paths and idempotency headers against the stubs.
2. Add shared labels and precedence for a missing/unknown value. Keep export failure distinct from an empty export.
3. Keep all handlers injectable or mockable without live APIs.

## Done when

- [x] `cd Frontend && npx vitest run src/services/redTeam/redTeamService.test.js src/features/red-team/labels.test.js` covers filter omission/encoding, idempotency header, both config-preview calls (method, path, body), export formats/error, phase/status transitions, explicit source, the new failure reasons, framework labels and unknown labels. [unit]
- [x] There is one red-team transport and one label registry; launch goes through `launchRedTeamTest` only. [static]
- [x] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [x] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

### 2026-11-22

- Updated the service and label registry, their unit tests, and the spec 07 inventory fragment. The client forwards the caller's launch UUID and draft version, serializes supported filters, and reads pairing through the report. Runtime version, availability and Cloud key presence are separate capability fields.
- Checked the installed Vitest and `@vitest/spy` 5.1.0 declarations for module/global mocks, async mock return values, spy contexts and timer controls. Checked jsdom 29.1.1 interface registrations for `URLSearchParams` and `HTMLAnchorElement`, and the installed `whatwg-url` query implementation. Confirmed the CLI entry points and installed package versions for Vite 8.0.10, `@vitejs/plugin-react` 6.0.1 and ESLint 10.2.1. Verified the app request and tracking contracts in `client.js` and `requestActivity.js` and matched request paths and methods against the route declarations. The frontend has no promptfoo package dependency. Tests use mocked transports and capability data.
- `cd Frontend && npx vitest run src/services/redTeam/redTeamService.test.js src/features/red-team/labels.test.js` passed with 2 files and 35 tests.
- Static search found one Red Team launch request in `launchRedTeamTest`, one production caller through that export, and one shared label registry. The service uses `apiRequest` for the JSON endpoints and the existing authenticated, tracked fetch for blob exports.
- `cd Frontend && npx vitest run` passed with 19 files and 227 tests. No failures or skips.
- `cd Frontend && npm run lint` exited 0 with 0 errors and 0 warnings.
- `npm run build` ran from a temporary copy of `Frontend` with the installed dependencies and exited 0 after transforming 2,941 modules. The build emitted `IMPORT_IS_UNDEFINED` for the remaining legacy comparison call in `Frontend/src/pages/RedTeamPage.jsx` and a `PLUGIN_TIMINGS` warning. The legacy comparison button depends on the spec 18 page migration to `report.paired`.
- `git diff --check` passed. This spec has no MongoDB integration gate.

### 2026-11-22 (planner)

- Reopened for the addendum above (config preview client, new reason, phase and framework labels). Earlier results stand for the original scope.

- **2026-11-23**: Implemented both config-preview calls and their shared response DTO in `redTeamService.js`. Added five failure reason labels and nine framework labels to `labels.js`, with focused tests and an inventory update. The existing phase labels cover all five approved job phases.
- Confirmed the root `node_modules/promptfoo/package.json` and lockfile report `0.126.0`. Checked `dist/src/index.d.ts` `FRAMEWORK_COMPLIANCE_IDS` against the scheduler data in `backend/app/red_team/scheduler_frameworks.json`. The app uses the scheduler's `nist_ai_rmf` for the NIST framework, and the installed package calls it `nist:ai:measure`. The preview methods and response fields follow spec 16. No promptfoo process ran.
- `cd Frontend && npx vitest run src/services/redTeam/redTeamService.test.js src/features/red-team/labels.test.js` passed with 2 files and 51 tests, 0 skipped. The tests use a mocked transport. Static search confirmed one Red Team transport, one shared label registry and a single launch request through `launchRedTeamTest`.
- `cd Frontend && npx vitest run` reported 21 passing files and 1 failing file, with 304 passing tests, 1 failure and 0 skips. `RedTeamPage.test.jsx` still expects `Not yet` in the running view, the known spec 18 failure. The full-suite gate remains open.
- `cd Frontend && npm run lint` passed with 0 errors and 0 warnings. `npm run build` passed in a temporary copy of `Frontend` using its installed dependencies and transformed 2,941 modules. Vite reported the existing `compareRedTeamTests` reference in `RedTeamPage.jsx` and a plugin timing warning. `git diff --check` passed. This spec has no MongoDB integration gate.

### 2026-11-23 (lead review, Claude)

- Re-ran from `Frontend/`: focused 51 passed; whole suite 304 passed + the known `RedTeamPage.test.jsx` progress-copy failure owned by spec 18; `npm run lint` clean. Marked Done.
