# Spec11 inventory

- `Frontend/src/features/platform/PlatformAudit.jsx`: safe event timeline with URL company/action/date/page filters and backend pagination.
- Internal CompanyFilter: native disclosure with searchable eight-company pages; all companies remain reachable, scoped metadata-only requests, Escape/outside dismissal and focus restoration. Uses `getPlatformCompany` only to label a selected company without matching events.
- Reuses shared audit table, recovery/pagination presentation, HTTP client and request lifecycle hook; event options mirror the backend safe allowlist.
- `PlatformAudit.test.jsx`: seven tests covering safe table fields, deep links, uncapped company selection, keyboard dismissal, action/date/paging, empty company history and retry.
