# Platform presentation reuse

- PlatformShell.jsx: isolated global workspace navigation, breadcrumb, account and own-organization return.
- PlatformComponents.jsx: PageHeading, PeriodControl, MetricStrip, WorkspaceChart, CompanyTable, AuditTable, Pagination, AccessBadge, CompanyMark, OnboardingLabel, AttentionPanel, AttentionBanners, LoadingState, ErrorState, EmptyState, CompanyActivityPanel.
- platformFormat.js: formatDate(value,{relative,dateOnly}) with explicit UTC context.
- platform.css: approved v3 tokens and geometry scoped under .platform-workspace; Radix access dialog carries .platform-workspace.platform-access-dialog.

Thirty-day charts group consecutive days into at most ten visual buckets while the accessible table retains the daily inputs. Submission sparklines likewise aggregate recorded values and never invent history.
