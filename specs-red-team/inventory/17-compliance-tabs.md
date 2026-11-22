# Inventory fragment: spec 17 compliance coverage tabs

### compliance-tabs
`Frontend/src/features/red-team/ComplianceTabs.jsx` — default export `ComplianceTabs({ compliance, provisional = false })`. **Added by:** spec 17.

Props:
- `compliance`: array of frameworks in the shape the API returns, `{id ('owasp'|'atlas'|'nist'|'eu'), name, total, failed, passed, not_tested, controls: [{key, id|null, name, status ('failed'|'passed'|'not_tested'), worked, decided, reason}]}`. Order is preserved (frameworks and controls); nothing is sorted or recomputed. Tab text uses the supplied counts.
- `provisional`: when true, or when `compliance` is not an array (null), renders the "Compliance coverage" heading and a single note "Compliance is calculated when the test finishes", with no tablist.

Behaviour:
- Section heading "Compliance coverage" plus the rule note and "Synthetic coverage, not certification".
- WAI-ARIA tabs: `role="tablist"` labelled "Framework", roving `tabIndex`, ArrowLeft/ArrowRight (wrapping), Home, End move selection and focus, click selects. Panels are `role="tabpanel"`, `tabIndex=0`, `aria-labelledby` the tab, hidden unless selected. Element ids use `useId`, so several instances can coexist.
- Control row: id (empty when null), name, `rt-badge` with `controlStatusLabel`, evidence "N of M mapped attacks worked" (failed/passed) or the `reason` (not tested).
- Layout uses inline styles for the tab strip and row grid because `red-team.css` has no tab or control-list classes.

How spec 21 uses it: in the report page render `<ComplianceTabs compliance={report.compliance} provisional={report.provisional} />` below the plugin and strategy sections. The spec 12 payload must be normalised to the shape above (`id`, `total`, `failed`, `passed`, `not_tested`, `controls[].key`) before passing it in.
