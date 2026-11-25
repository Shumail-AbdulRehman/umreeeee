# Platform read service inventory

- backend/app/services/platform_service.py: PlatformService.overview / companies / company. Constructor accepts injected metrics and an optional UTC clock for deterministic isolated tests.
- All public read operations enforce require_super_admin before any database work.
- Company detail supplies safe metrics, exact policy coverage and missing-required-coverage attention. Onboarding remains the same coarse setup milestone on every surface; actual applicability is separate. HTTP composition adds the safe audit history.
- No returned object exposes tenant content, employee identifiers or errors.
