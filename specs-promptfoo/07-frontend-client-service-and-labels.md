# Spec 07 — Frontend client service and labels

**Status:** Not started
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
