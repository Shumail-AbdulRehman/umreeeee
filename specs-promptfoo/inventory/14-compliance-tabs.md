# Spec 14 reuse inventory

| Path | Surface | Use |
| --- | --- | --- |
| [ComplianceTabs.jsx](../../Frontend/src/features/red-team/ComplianceTabs.jsx) | `ComplianceTabs({ compliance, provisional })` (existing default export, updated) | Renders stored framework coverage in tab order. Accepts the spec 07 report's framework array or `null`; framework entries support `id` with flat counts or `framework` with nested `totals`. Controls supply `key`, `id`, `name`, `status`, `worked`, `decided`, and `reason`. No API or compliance calculation. |

No new public exports.
