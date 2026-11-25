# Spec 12 — Application routing and workspace entry

**Status:** Done
**Depends on:** Spec 08, Spec 09, Spec 10, Spec 11
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-3.1-pro-preview`
**Issue:** —
**Owns:** `Frontend/src/features/platform/PlatformWorkspace.jsx`, `Frontend/src/features/platform/platformNavigation.js`, `Frontend/src/features/platform/platformNavigation.test.js`, `Frontend/src/App.jsx`, `Frontend/src/components/Sidebar.jsx`, `Frontend/src/pages/SettingsPage.jsx`, `Frontend/src/features/platform/PlatformWorkspace.test.jsx`, `specs-platform-owner/inventory/12-platform-entry.md`
**Reuses:** `Frontend/src/utils/permissions.js`, `Frontend/src/config/navigation.js`

## Goal

The real application exposes the dashboard to the product owner and preserves tenant workflows.

## Scope

- Default super-admin sign-in to the platform workspace while preserving ordinary-role landing routes.
- Wire platform hash routes, filters, logout and explicit own-organization return.
- Link Settings and the organization shell to the new platform workspace; unauthorized platform hashes cannot render it.

## Explicit non-scope

- Final evidence and reuse audit → spec 14.

## Reuse first

- Read INVENTORY.md before adding helpers.
- Preserve the existing API/authentication and approved v3 presentation.

## Steps

1. Default super-admin sign-in to the platform workspace while preserving ordinary-role landing routes.
2. Wire platform hash routes, filters, logout and explicit own-organization return.
3. Link Settings and the organization shell to the new platform workspace; unauthorized platform hashes cannot render it.
- Record reusable symbols and actual verification in the inventory fragment and Log.

## Done when

- [x] The documented API contract and selected v3 surface agree with the implemented boundary. [static]
- [x] Focused tests in `Frontend/src/features/platform/platformNavigation.test.js`, `Frontend/src/features/platform/PlatformWorkspace.test.jsx` prove the scoped behaviour. [unit]
- [x] The whole relevant backend or frontend unit suite passes with recorded counts. [unit]
- [x] `cd Frontend && npm run lint` passes. [static]
- [x] `cd Frontend && npm run build` passes. [static]

## Log

- **2026-11-25**: Scoped from the current tree and user-approved v3 implementation request.

- **2026-11-25**: Integrated dedicated hash-routed workspace, role-specific default landing, own-organization return and sidebar/Settings entry. Navigation/window history and role composition tests passed. Existing role landing paths remain; platform routes never mount for tenant roles.
