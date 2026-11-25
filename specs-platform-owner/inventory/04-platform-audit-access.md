# Platform audit and access inventory

- `backend/app/services/platform_audit_service.py`: `PlatformAuditService.list` exposes safe platform/company history; `change_status` owns versioned atomic access changes and dual-company audit recording. `EVENT_LABELS` is the action filter allowlist.
- `audit_pipeline` deduplicates actor/target status records before pagination and fetches bounded company/actor metadata only for the selected page. `audit_event_read` is the public metadata allowlist.
- `backend/app/api/routes/administration.py`: legacy `CompanyStatus` accepts an optional reason; `organization_status` delegates to the same service after its role check.
- `backend/tests/unit/test_platform_audit.py`: 19 cases cover privilege boundaries, audit privacy, attribution/pagination query shape, version/default fields, no-op behaviour, reason validation, transaction rollback/retry, and explicit filter errors.
