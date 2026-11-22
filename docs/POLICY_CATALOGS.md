# DLP and Guardrail catalogs

The imported DLP and Guardrail catalogs are read-only libraries of checks. Administrators
create any number of named policies from either library, choosing all current checks or a
specific subset. A new policy has no group assignments. Administrators then attach the
same policy to one or more active groups and may edit its checks without changing those
assignments. A group can have multiple DLP and Guardrail policies; matching checks are
combined during evaluation. Empty assignments mean **no groups**, not organization-wide
scope. Group membership remains managed in Users.

## Named policy workflow — 1 October 2026

The DLP and Guardrail pages show created policies, check counts, status, and assigned
groups. **Create policy** saves a name, optional description, and selected catalog IDs.
**Assign groups** separately selects the groups that use it. Editing a policy's checks
updates every group assigned to that policy. Disable temporarily stops enforcement;
archive removes its assignments and hides it from the active list. New checks added by
a later catalog import are not automatically included in an existing policy.

The new admin API is `GET/POST /api/policy-sets`, `PUT /api/policy-sets/{id}`,
`PUT /api/policy-sets/{id}/groups`, and `PATCH /api/policy-sets/{id}/status`.
Writes require the current version and create a version snapshot and audit event.
Selections must contain unique IDs from the active catalog; assignments accept only
active groups in the same organization. Imported catalogs remain available at
`GET /api/policies`. Re-importing catalogs preserves named policies. Earlier direct
catalog-to-group assignments continue to work; the old API remains available for
removing or migrating those assignments.

## Earlier group-specific workflow — 27 September 2026 (historical)

Each DLP and Guardrail page shows the available check count and each group's saved
assignment: **All checks**, **Custom selection**, or **Not assigned**, with its exact
check count. Use **Assign checks / Edit checks** on a group, or **Assign to groups**
to give several groups the same selection in one save.

The editor has explicit **All N checks** and **Choose specific checks** options.
Custom selection supports name/description/ID search, categories, 12-check pages,
selected-only review, selecting all filtered results across pages, and clearing a
selection. Selection survives search and page changes. The footer keeps the selected
count and save action visible. Empty selections cannot be assigned; use the group's
**Remove** action to remove that policy assignment. DLP and Guardrail selections are
independent. Changing one group's checks does not alter any other group.

All-checks assignment saves the current catalog IDs; future catalog additions are not
automatically enabled. Existing shared assignments keep their saved checks until edited,
so no migration is required. A user in several assigned groups receives the union of
those groups' checks, deduplicated in catalog order. The effective IDs and policy
version are frozen in the run snapshot for input/output and protected red-team use.

`group_entry_selections` stores `{group_id, selected_entry_ids}` per assigned group.
The legacy `selected_entry_ids` is a fallback for records without a group-specific
entry. Catalog refresh preserves group-specific selections and refuses to remove
checks that are still selected by a group.


## Imported sources

- `all_pat.txt`: 473 entries, retaining all original fields.
- `all-guardrails.txt`: 179 entries, retaining all original fields.

These are Python-literal lists, parsed using `ast.literal_eval`, never `eval` or plugin
installation commands. Source filename, SHA-256, and entry count are stored alongside
the complete entries in MongoDB `policies`. A unique partial index permits one managed
policy of each kind per organization. Imports and group changes produce version snapshots
and audit events. Re-importing identical content preserves IDs, versions, and assignments.
Existing legacy non-managed policies are archived, not deleted; named policy sets are
preserved, as are their historical snapshots.

## Import command

Run from `backend`, explicitly targeting the intended replica-set database:

```bash
.venv/bin/python scripts/import_policy_catalogs.py \
  --uri 'mongodb://127.0.0.1:37017/?replicaSet=sentinelLocal' \
  --database sentinel_local_demo \
  --dlp /home/shumail/Downloads/all_pat.txt \
  --guardrail /home/shumail/Downloads/all-guardrails.txt
```

This imports into all existing organizations in that database. Run it again after adding
an organization. The supplied source files are not modified. The September 26 import used
`sentinel_local_demo`, the database used by the previous local application session;
it did not modify an external MongoDB deployment or the backend `.env`.

## API

- `PUT /api/policies/{id}/group-selections`:
  `{ "version": 1, "group_ids": ["..."], "selected_entry_ids": ["..."] }`.
  Replaces checks only for the specified groups; an empty entry list removes those
  assignments. Other groups and policy types are preserved. Groups must belong to
  the current tenant and be active when assigning checks. Validates duplicate and
  unknown IDs, the total 500-group assignment limit, and optimistic version.
  Each change creates an immutable revision and audit event in the same transaction.

- `GET /api/policies`: only the two managed catalogs, tenant-scoped.
- `PUT /api/policies/{id}/groups`: `{ "version": 1, "group_ids": ["..."], "selected_entry_ids": ["..."] }`.
  Entry selection and groups save atomically. Entries must be unique IDs from this
  catalog, and a nonempty group assignment requires at least one selected entry.
  Omission preserves the saved selection (older records default to all entries).
  Selecting all saves the current IDs; future imports do not automatically enable
  new entries. Imports refuse removal of selected IDs until they are deselected.
  This legacy endpoint explicitly applies a supplied selection to every group in its payload. Omitting the selection preserves existing group-specific checks.
  Requires administrator access; rejects foreign/archived groups, duplicate IDs,
  unexpected fields, and stale versions. Updates are transactional.
- Custom create/update/status endpoints reject mutations with `409 managed_policies_only`.
- Historical details and version reads remain available for audit purposes.

## External detection integration

The files contain reference metadata, not complete executable detectors: the DLP list
contains pattern names/IDs/categories but no matching expressions; the guardrail list
includes plugin and dataset descriptions and installation metadata. No listed command
is executed. Detection is delegated to the two Cytex APIs via the adapter documented in
[REMOTE_DETECTION.md](REMOTE_DETECTION.md), not implemented by interpreting catalog text.

Live detection is enabled in the local app following the authorized September 27 smoke test.
New installations default to disabled: an assigned catalog then produces
`remote_detection_disabled` and fails closed before provider dispatch. With no assigned policy, existing
organization `require_active_policy` behavior remains unchanged. This intentionally replaces
the old custom-policy configuration; do not use it as a claim of full DLP/guardrail coverage.

Frontend and backend servers were not started for this change. The local Mongo process
was started only for import and isolated tests, then stopped again.

Verification: 103 backend tests passed (8 dependency deprecation warnings); frontend
lint and production build passed. The focused catalog tests cover safe parsing,
idempotent import, preserved history, one/both/neither assignments, tenant boundaries,
stale versions, custom-policy rejection, and fail-closed evaluation. The frontend skill's
audit passed with generic marketing warnings that do not apply to this administration UI;
the implementation reuses the existing accessible controls and administration styling.

## Earlier UI iterations (historical)

The entry-selection update added separate DLP/Guardrail views, search, category filters,
selected-only filtering, select-all/select-filtered/clear actions, 20-entry pagination,
saved counts, and explicit save/discard. Unsaved selections survive switching policy types.
Chrome browser checks verified selecting three entries, saving and reloading, select-all,
discard, independent tab drafts, and a 390px mobile layout without horizontal overflow.
Selections used by the browser test were restored afterward; group assignments were unchanged.

## Separate policy pages and scalable group assignment

The administration sidebar now opens dedicated `#dlp-policy` and
`#guardrail-policy` pages. Existing `#policies` links (including group-scoped
links from Groups) remain supported. Both pages retain the same catalog selection,
atomic save endpoint, version checks, and enforcement behavior.

Group assignment supports name/description search, All/Selected/Not selected
filters, alphabetical ordering, member counts, and eight groups per page.
All active groups are fetched in batches of 100. “Select results” and “Clear
results” affect the complete filtered result set, not just the visible page;
assignments outside that filter are preserved. The existing 500-group assignment
limit is respected. Unavailable saved groups are identified and can be removed.
Sidebar navigation warns before discarding unsaved changes.

The responsive layout follows the frontend-design skill's guidance on clear
selection feedback and manageable lists, while retaining existing app styling.
Verification uses 235 mocked groups and intercepts API calls: it does not modify
the database or contact detection services. With Vite running on port 5174:

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node Frontend/tests/policy-pages.browser.cjs
```

Optional overrides: `UI_TEST_URL` and `CHROME_PATH`. Coverage includes dedicated
routes, multi-page loading, search/filter/bulk actions, hidden assignment
preservation, unchanged entry selection, save/reload, unsaved-navigation warning,
legacy group links, mobile overflow, and regular-user access restrictions.

### Policy overview and explicit editing

The sidebar groups both pages under **Policy**. Each page now starts with a saved
check summary and a full-width group assignment table, rather than showing all
editing controls at once. **Edit checks** opens the catalog selector. **Edit
groups** opens the searchable bulk assignment dialog, and each group row has an
**Edit** action for that group's assignment only. The Groups page also provides
**Edit DLP** and **Edit Guardrail** links to the relevant group-scoped page.

Dialogs save through the same versioned endpoint. Cancel discards the draft after
confirmation; failed saves keep the dialog and draft open. Single-group edits
preserve every other group's assignment and the selected checks. At this historical stage, checks were shared across groups. The current workflow
described above supersedes that limitation with independent selections per group.

The browser regression covers bulk and individual assignment editing, check
editing, cancellation, failed-save draft preservation, a 235-group list, and
responsive overview/dialog layouts. All API requests in that test are mocked.


## Verification of group-specific checks

Backend regression: 129 tests passed on disposable MongoDB replica-set databases,
followed by two focused protected-execution tests for the new group selection path.
Coverage includes DLP and Guardrail subsets/all, multi-group union, legacy fallback,
unchanged other groups, revision snapshots, tenant/role boundaries, stale saves,
removal, catalog refresh, and exact detector payloads frozen across a mid-run edit.
All detectors and providers in these tests are fake; no external requests are made.

`Frontend/tests/policy-pages.browser.cjs` uses 145 checks per catalog and 235 groups.
It covers four-check DLP selection, all-check assignment, independent six-check
Guardrail selection, selections across search/pages, category bulk selection,
reload persistence, failed-save preservation, discard, removal, group deep links,
keyboard focus, regular-user restrictions, and 1440/1024/390px layouts. All API calls
are mocked. Frontend lint and build are required alongside the browser test.
