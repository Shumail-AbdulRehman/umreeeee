# Spec 08 — Red Team client service and polling fix

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `Frontend/src/services/redTeam/redTeamService.js`, `Frontend/src/services/redTeam/redTeamService.test.js`, `Frontend/src/hooks/useRedTeamTest.js`, `Frontend/src/hooks/useRedTeamTest.test.jsx`, `specs-red-team/inventory/08-client-service-and-polling.md`
**Reuses:** `Frontend/src/services/api/client.js`, `INVENTORY.md#red-team-hook`, `ARCHITECTURE.md#data-model`

## Goal

The client speaks the v3 API contract, and a test launched from an open draft starts polling immediately, fixing the stalled-progress defect.

## Scope

- `redTeamService.js`: keep every existing function and signature. Add query-object support for `listRedTeamResults` (plugin, strategy, verdict, verdict_source, case_kind, state, page) built with `URLSearchParams`, so callers stop hand-building query strings; keep string input working for the legacy caller until spec 21 replaces it. Fix `downloadRedTeamExport` to use the same base URL normalisation as `services/api/client.js` (it currently reads the env variable directly).
- `useRedTeamTest.js`: polling restarts whenever the loaded status moves from `draft` (or any non-polling state) to a polling state, including through `refresh()` or `setTest()`; it stops at terminal states, pauses while the tab is hidden, backs off on errors, cancels timers on unmount and test change, and ignores responses for a previous test id. Return value stays `{ test, error, setTest, refresh }`.

## Explicit non-scope

- Components using the new query objects → spec 21.
- Backend support for the new filters → spec 20.

## Reuse first

- All requests go through `apiRequest` in `Frontend/src/services/api/client.js`; do not add a second fetch path except the existing blob download, which reuses the client's base URL logic.

## Steps

1. Add the query-object helpers and the export URL fix.
2. Restructure the hook's scheduler so state transitions drive polling.
3. Test both with mocked `apiRequest`/`fetch` and fake timers.

## Done when

- [x] `npm run test:components -- src/services/redTeam/redTeamService.test.js` passes: a results query object becomes the expected encoded URL, empty values are dropped, and the export uses the normalised base URL with the bearer token. [unit]
- [x] `npm run test:components -- src/hooks/useRedTeamTest.test.jsx` passes: a draft does not poll; after `setTest` to `queued` a request fires within the 2 s interval and keeps polling until `completed`; a hidden tab pauses and visibility resumes; switching test id discards a late response for the old id; unmount leaves no pending timer. [unit]
- [x] `npm test` passes with 0 failures; count in the Log. [unit]
- [x] `npm run lint` passes with 0 errors and 0 warnings. [static]
- [x] `npm run build` passes (run as the isolated `npx vite build --outDir <scratchpad>/build-08`). [static]

## Log

- **2026-11-11**: Implemented. Service test 6 passed; hook test 11 passed; `npm test` 10 files / 116 tests passed; `npm run lint` clean (0 errors, 0 warnings).
- **2026-11-11**: Build criterion run as `npx vite build --outDir <scratchpad>/build-08 --emptyOutDir` (not `npm run build`) because other sessions build concurrently; it passed.
- **2026-11-11**: `client.js` does not export its base URL and is not owned by this spec, so `redTeamService.js` repeats its one-line normalisation (`trim()`, strip trailing slashes). If client.js later exports it, switch to the import.
