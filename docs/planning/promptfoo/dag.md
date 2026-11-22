# Red Team on promptfoo — dependency graph

Source: [binding split](splits.md) and the [numbered offline handoff](../../../specs-promptfoo/README.md). An edge `A → B` means B consumes A. Gate ranges are expanded below; they are acceptance dependencies, not imports.

## Implementation edges

| Edge | Consumer uses |
| --- | --- |
| 00 → 01 | Exact runtime pin, Node baseline and deployment assumptions; version diagnosis only. |
| 00 → 05 | Verdict authority and report vocabulary. |
| 00 → 07 | Red Team data, status, labels and downstream API boundary. |
| 00 → 08 | Artifact response/guardrail vocabulary and stdlib boundary, without live forwarding. |
| 01 → 02 | Installed pinned artifact for offline catalog metadata. |
| 01 → 03 | Same pin for offline framework data extraction. |
| 02 → 04 | Catalog IDs, defaults and count/multiplier model for non-runnable descriptors. |
| 02 → 06 | Per-plugin and per-strategy metadata and offered-ID set. |
| 03 → 06 | Framework control mapping and pure compliance result. |
| 08 → 09 | Canned response adapter and fixture identity/dedup contract. |
| 04 → 10 | Safe descriptor/hash and fake-process environment contract. |
| 07 → 11 | Draft/capability DTO, plugin and strategy labels. |
| 07 → 12 | Availability, phase, severity and decision labels. |
| 07 → 13 | Mock report DTO, paired/engine data and format labels. |
| 07 → 14 | Mock compliance DTO/status vocabulary. |
| 07 → 15 | Filters, source/decision labels and result DTO. |
| 02 → 16 | Draft membership, limits and catalog capability payload. |
| 03 → 16 | Framework list for capabilities, separate from aggregate report. |
| 04 → 16 | Pure draft descriptor/hash validation; runtime diagnostics from 01 are transitive. |
| 06 → 16 | Pure aggregate for authorized stored report reads. |
| 05 → 17 | Normalization, errors and policy/grader verdict authority. |
| 09 → 17 | In-process synthetic replay boundary and canned evidence. |
| 10 → 17 | Inert event and suite interfaces; test-owned fake artifacts. |
| 16 → 17 | Collection shapes, unique result index, stored cancel flag and scope. |
| 07 → 18 | Page's direct client, labels and request DTOs. |
| 11 → 18 | Editor, estimates and draft callbacks. |
| 12 → 18 | List, progress, readiness and cancellation UI. |
| 13 → 18 | Summary, plugin and strategy views. |
| 14 → 18 | Compliance tabs. |
| 15 → 18 | Results, detail and state components. |
| 16 → 19 | Evidence the service, routes and schema no longer import legacy engine. |
| 17 → 19 | Evidence the worker and recovery no longer use legacy execution. |
| 18 → 19 | Evidence the page has no legacy import and the editor is wired to the new surface. |

## Acceptance and verification edges

| Producer | Edge to 20: end-to-end suite | Edge to 21: verification pass |
| --- | --- | --- |
| 00 | — (transitive) | `00 → 21`: reconcile decision record with documented offline adjustments. |
| 01 | `01 → 20`: runtime-present/unavailable launch and readiness fixtures. | `01 → 21`: clean dependency pin and version-only check. |
| 02 | `02 → 20`: catalog-backed editor/filter fixture choices. | `02 → 21`: reproducible catalog and validation checks. |
| 03 | `03 → 20`: framework tabs and gap reason fixtures. | `03 → 21`: upstream mapping provenance/reproducibility. |
| 04 | `04 → 20`: safe draft descriptor and stable suite identity checks. | `04 → 21`: secret-free descriptor/environment audit. |
| 05 | `05 → 20`: normalized rows and evidence precedence in pipeline. | `05 → 21`: parser cases and fixture content audit. |
| 06 | `06 → 20`: fixture summary, coverage and paired report. | `06 → 21`: verify denominators, scoring and provisional/paired payload. |
| 07 | `07 → 20`: intercepted route, query and export contract. | `07 → 21`: single transport and label contract. |
| 08 | `08 → 20`: synthetic reply and guardrail shape, no transport. | `08 → 21`: adapter has no callable target registration. |
| 09 | `09 → 20`: replay locality, cancellation and deduplication. | `09 → 21`: ensure no runtime listener/executors. |
| 10 | `10 → 20`: fixed fake, staged rows, no-cases state and replay. | `10 → 21`: fake/no-spawn boundary and smoke fixture. |
| 11 | `11 → 20`: editor, missing grader, validation and estimates. | `11 → 21`: editor/focus/validation proof. |
| 12 | `12 → 20`: list readiness, phase transitions and cancel dialog. | `12 → 21`: phase/readiness/cancel checks. |
| 13 | `13 → 20`: provenance, paired raw/protected and report viewport. | `13 → 21`: score, table and paired summary coverage. |
| 14 | `14 → 20`: keyboard tabs and truthful coverage status. | `14 → 21`: keyboard/status compliance checks. |
| 15 | `15 → 20`: result filters, detail and failed/cancelled states. | `15 → 21`: detail safety, role/text and state checks. |
| 16 | `16 → 20`: tenant-scoped API, export, clone, cancel and launch refusal. | `16 → 21`: verify schema/index/docs and API integration. |
| 17 | `17 → 20`: fixture persistence, counts, fencing and recovery. | `17 → 21`: worker integration, no-dispatch and interruption proof. |
| 18 | `18 → 20`: assembled page and poll/loading behavior. | `18 → 21`: no stale data, no legacy UI and build/lint. |
| 19 | `19 → 20`: post-removal app/pipeline and preserved risk behavior. | `19 → 21`: no legacy imports and archive fakes. |
| 20 | — | `20 → 21`: final browser and backend acceptance executions. |

## Schedule

| Wave | Specs | Single-writer checkpoints |
| --- | --- | --- |
| 0 | 00 | Historical decision already Done. |
| 1 | 01, 05, 07, 08 | Root runtime/docs; parser/fixtures; UI client/labels; synthetic response adapter. |
| 2 | 02, 03, 09, 11, 12, 13, 14, 15 | Two distinct extractors, fixture boundary, disjoint component and test files. |
| 3 | 04, 06, 18 | Descriptor and pure aggregation independent of page/hook/page CSS. |
| 4 | 10, 16 | Fixture runner separate from sole API/schema/indexes/contract editor. |
| 5 | 17 | Worker and recovery; dispatcher untouched. |
| 6 | 19 | Deletion/archival only after dependent callers move. |
| 7 | 20 | Browser config/intercepts and backend acceptance harness. |
| 8 | 21 | Clean build, evidence review and inventory consolidation. |

Waves are longest dependency levels, not additional barriers. Maximum width is 8. One critical path is `00 → 01 → 02 → 04 → 10 → 17 → 19 → 20 → 21`; same-length alternatives replace `10` with `16` or take `01 → 02/03 → 06 → 16` before `17`. No lane for module 18 is forced to wait for backend module 16; both consume a prior agreed contract with independent fixtures. Status/tracker writes are the lead's; each implementer owns a separate inventory fragment.
