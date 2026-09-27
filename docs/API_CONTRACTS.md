# API contracts (local build)

The generated, version-matched route schema is available at `/openapi.json` and `/docs` while the API is running. All resources below use authenticated Bearer JWTs; the server derives tenant and role from current database state, not client-supplied IDs. Errors use the safe `detail` envelope with a code and message; validation errors may include field information. Unauthorized is 401, insufficient role 403, and other-tenant resource IDs are 404.

The ordinary prompt route is `POST /api/prompt-workspace/run` with a UUID `Idempotency-Key`. It uses protected input/output evaluation; no public raw or system-override route exists. Run history/detail, violations, notifications, and analytics exclude Red Team source by default. Red Team's dedicated APIs require `org_admin` or `super_admin` in the same active organization.

| Red Team route | Contract |
|---|---|
| `GET /api/red-team/capabilities` | Catalog/evaluator versions, category/mode limits, conservative pacing, broker/worker hints. No connection secrets. |
| `GET /api/red-team/tests` | Real pagination and `q`, `status`, `mode`, `integration_id`, `from`, `to` filters; `{items,page,page_size,total}`. |
| `POST /api/red-team/tests` | Validated draft configuration; 201 `{test}`. No provider call. |
| `GET /api/red-team/tests/{id}` | `{test}` with persisted configuration, derived progress/score, dispatch pending flag. |
| `PUT /api/red-team/tests/{id}` | Draft-only edit with `version`; stale edit 409. |
| `POST /api/red-team/tests/{id}/launch` | Body `{version}`, UUID `Idempotency-Key`; 202 `{test,dispatch_pending}` after Mongo transaction, not broker completion. |
| `POST /api/red-team/tests/{id}/cancel` | Idempotent cancellation; in-flight provider work may finish/incur cost. |
| `POST /api/red-team/tests/{id}/clone` | 201 new draft; optional body `{mode}`. Rerun always gets a new test ID. |
| `GET /api/red-team/tests/{id}/results` | Paginated job summaries; category, case kind, verdict, state filters. |
| `GET /api/red-team/tests/{id}/results/{job_id}` | Admin-only synthetic job detail and permitted decrypted response; withheld/expired output is null. |
| `GET /api/red-team/tests/{id}/report` | Reproducibility metadata, progress, score, controls, limitations, partial flag. |
| `GET /api/red-team/tests/{id}/export?format=json\|csv` | Safe authorized export; CSV formula-prefix neutralization. |
| `GET /api/red-team/comparisons?raw_test_id=...&protected_test_id=...` | Same-manifest/snapshot paired comparison or 409 mismatch. |

`num_attacks` is 1–100 and at least the selected category count; five benign controls are added. The threshold is provisional until terminal. Score excludes errors, inconclusive, cancelled, and controls; evaluable coverage below 80% is insufficient evidence. A raw test intentionally bypasses platform policy only in the internal worker. Queue messages contain job/test IDs and generation, not prompts or credentials.


## Group-specific managed policy checks

`PUT /api/policies/{policy_id}/group-selections` requires an organization administrator.
Body: `{ "version": 1, "group_ids": ["ObjectId"], "selected_entry_ids": ["catalog-id"] }`.
Returns `{ "policy": <updated policy>, "message": "Group policy checks saved" }`.
Only the named groups change. An empty selection removes their assignment. Nonempty
selections require active same-tenant groups. Invalid or duplicate IDs return 422;
a stale policy version returns 409; a foreign policy returns 404. Revisions and audits
commit transactionally. The returned `group_entry_selections` array contains each
group's saved IDs; `scope.group_ids` remains the authoritative assignment list.

Runtime checks use the union of the authenticated user's active groups' selections,
without duplicates, and snapshot the effective IDs for the entire run. Older shared
assignments retain their selected IDs until explicitly edited. The legacy `/groups`
endpoint remains compatible; omitting selected_entry_ids preserves group-specific
selections, while supplying it explicitly applies that shared set to the payload's groups.

### Model-call cost metadata

Workspace runs and red-team result records include `estimated_cost_usd` (decimal string or
null), `cost_status`, `cost_source` (`configured`, `litellm`, or null), and `pricing_snapshot`.
Token counts and provider request IDs remain nullable. Automatic pricing applies when no
per-model integration override exists; pricing failures do not fail the request or become
zero-cost calls. See [Model costs](MODEL_COSTS.md) for precedence and accounting semantics.
