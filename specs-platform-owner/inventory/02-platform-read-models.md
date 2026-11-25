# Platform read model inventory

- backend/app/services/platform_metrics.py: PlatformMetrics company aggregation, server-filtered directory and overview facets, exact policy applicability for unique active membership sets.
- window_for: current-day-inclusive UTC7/30-day intervals.
- daily_series: bounded zero-filled outcome series.
- company_summary / company_metrics / safe_attention: explicit public allowlists.
- company_pipeline / attention_definitions: safe Mongo metadata lookups and recorded attention rules. Repeated-provider threshold is3 failed workspace runs in the selected interval; unresolved backlog includes reviewed and open workspace violations, high severity includes critical.

Directory onboarding is a setup milestone (verified administrator, active integration/group, active named DLP or Guardrail policy). Exact member-by-integration policy coverage is computed in detail using the existing resolver; it is not a claim of detector availability or comprehensive protection.
