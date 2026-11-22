# Inventory fragment: spec 21 page integration

`Frontend/src/pages/RedTeamPage.jsx` composes feature components and owns API orchestration.
Hash routes: list, new=1, test=id; testId prop remains supported for the existing shell.
Each route resets workspace state; context loads once. List search debounces 250ms.
The hook owns polling; each refreshed test loads report/results. Controls maps to
case_kind=control and evidence to verdict_source. Compliance totals are adapted for tabs.
Launch retries reuse the saved draft/version and a key held by test-id/version; a network
failure does not re-edit the same values. Detail requests are invalidated on close/navigation.
Export JSON/CSV, print, cloning, legacy report and legacy paired comparison are retained.
Page CSS contains layout/print rules only. Calls metadata accepts model_calls/judge_calls;
unknown values are explicitly unavailable. Capability readiness reads observed_at.worker.
