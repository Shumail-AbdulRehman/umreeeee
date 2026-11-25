# Spec09 inventory

- `Frontend/src/features/platform/PlatformCompanies.jsx`: server-backed company directory; URL filter callback patch contract; debounced search preserves input focus; status/onboarding/activity/sort/window controls; total-aware pagination and filtered/unregistered/out-of-range recovery.
- Reuses `platformService.js`, `usePlatformResource.js` and `PlatformComponents.jsx`; no additional package or global stylesheet.
- `PlatformCompanies.test.jsx`: seven interaction tests covering query scope, stable focus, filter/window updates, server totals, empty recovery and service failures.
