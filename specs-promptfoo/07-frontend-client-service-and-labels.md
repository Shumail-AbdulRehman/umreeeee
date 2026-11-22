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

- [ ] `cd Frontend && npx vitest run src/services/redTeam/redTeamService.test.js src/features/red-team/labels.test.js` covers filter omission/encoding, idempotency header, export formats/error, phase/status transitions, explicit source and unknown labels. [unit]
- [ ] There is one red-team transport and one label registry; launch goes through `launchRedTeamTest` only. [static]
- [ ] `cd Frontend && npx vitest run` passes; log the count. [unit]
- [ ] `cd Frontend && npm run lint` passes with no errors or warnings. [static]
- [ ] `cd Frontend && npm run build` passes. [static]

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
