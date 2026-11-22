# Red Team implementation verification

Date: 2026-11-14. Spec 25 restart after an interrupted verification session.
Status: Complete. Spec 25 is Done after the complete MongoDB integration retry,
cleanup and final validation. Specs 00–24 remain Done.

Independent review follow-up (2026-11-14): the earlier pass below missed defects subsequently fixed in recovery, leetspeak grading and frontend compatibility/labels. [The final independent review](final-review.md) supersedes this document for readiness and latest counts: 464 backend unit, 116 integration, 214 Vitest + 8 Node, 19 Red Team browser + 15 Studio browser tests. The results below remain the historical first verification record.

## Reproducible environment and scope

- `npm ci` in `Frontend/`: exit 0, 439 packages installed, 440 audited.
- New virtual environment `/tmp/red-team-final-verification-20261114`, installed
  directly from `backend/requirements-dev.txt`: exit 0, 131 installed distributions.
  `pip check`: no broken requirements. The existing `backend/.venv` was preserved.
- Python 3.12.3; pytest 9.1.1; PyMongo 4.13.2; FastAPI 0.116.1;
  Node 24.14.1; npm 11.11.0; system Chrome 150.0.7871.124.
- Backend unit tests ran in both environments. Integration uses `backend/.venv`
  as instructed by the user, with `TEST_MONGODB_URL` loaded without displaying it
  and `TEST_MONGODB_DB_NAME=test_`. Integration results therefore describe the
  existing backend environment; the fresh-install proof covers backend unit and
  import/compile checks plus all frontend checks.
- MongoDB replica-set availability was confirmed. The initial filtered database
  listing contained no `test_*` databases, so no initial drops were necessary.
- Browser builds/runs were serialized: Red Team preview on 5192, then Prompt
  Studio preview on 5191, then the explicit final production build.
- No application, test, dependency, or finished-spec files are edited in this
  verification. Only spec 25's owned documentation and its status/log/tracker are
  updated. No git mutations, publication, or deployment is authorized or performed.

## Fresh execution results

| Check | Result | Count / evidence |
| --- | --- | --- |
| Backend unit, fresh environment | PASS | 452 passed, 0 failed/skipped; 8 dependency deprecation warnings; 11.12 s |
| Backend unit, user-specified `.venv` command | PASS | 452 passed, 0 failed/skipped; 8 dependency deprecation warnings; 16.76 s |
| Backend integration, first complete single-process attempt | FAILED / infrastructure errors | 107 passed, 1 failed, 7 errors, 8 warnings; 1452.41 s; details below |
| Backend integration, complete retry in four disjoint processes | PASS | 114 passed, 0 failed/errors/skipped: core 43, enforcement 42, catalog/legacy 22, v3 7 |
| Frontend `npm test` | PASS | 210 Vitest tests across 19 files plus 8 Node tests; 218 total, 0 failed/skipped |
| Red Team `npm run test:red-team` | PASS | 17 browser tests, 0 failed/skipped; 1.6 min |
| Prompt Studio `npm run test:studio` | PASS | 15 browser tests, 0 failed/skipped; 58.3 s |
| Frontend lint | PASS | `npm run lint`, exit 0, 0 errors, 0 warnings |
| Backend compile | PASS | `.venv/bin/python -m compileall -q app scripts`, exit 0; repeated in fresh environment |
| Recovery module import | PASS | Fresh environment, test configuration loaded, `import app.queue.recovery`, exit 0 |
| Frontend build | PASS | `npm run build`, exit 0; 5.59 s; also built by both browser harnesses |
| Spec validator | PASS | 26 specs, 0 errors, 31 nonblocking warnings; rerun after final documentation/status updates |

The two backend unit runs are repeated evidence for the same 452 cases and must
not be added together. Likewise, integration and browser counts are separate
test layers, not extra unit cases. Browser e2e total: 32 (17 Red Team + 15 Studio).
The backend pipeline is one of the 114 integration cases, not an extra case.

The passing integration retry ran every integration file, without deselection or
edits, in four isolated pytest processes. Core: 43 passed in 535.41 s;
enforcement: 42 passed in 401.79 s; catalog/legacy: 22 passed in 258.47 s;
v3: 7 passed in 203.50 s. Each process reported the same 8 dependency warnings.
This is a complete passing retry of the test set; the original single-process
attempt remains a failed run and is not relabelled as passing.

The 114 integration cases cover authentication (9), HTTP administration (22),
resources (12), enforcement/conversations (42), policy catalogs (11), legacy Red
Team flow (11), v3 API (1), v3 pipeline (1), v3 queries (1), and v3 worker/recovery
(4). The first attempt's API case has both a failed call and an errored teardown;
the seven reported errors do not represent seven additional unique test cases.

## Earlier acceptance criteria review

All 111 checked criteria in specs 00–24 were read against their current source,
named test assertions, and the runs above. Shared whole-suite, compile, lint and
build gates use the fresh results rather than older counts in implementation logs.
Integration-dependent criteria use the complete passing retry of all 114 cases.

| Spec | Existing status | Criteria | Current evidence reviewed |
| --- | --- | --- | --- |
| 00 | Done | 2 | Decisions match the recorded intake and implemented catalog/scoring/version boundaries; validator 0 errors. Historical testing-owner typo is recorded below. |
| 01 | Done | 4 | `test_red_team_plugins.py`: 21 cases; immutable real catalog, counts, validation, synthetic-content assertions. |
| 02 | Done | 4 | `test_red_team_strategies.py`: 24 cases; deterministic framing, encoding/decoding, invalid data and size bounds. |
| 03 | Done | 4 | `test_red_team_risk_scoring.py`: 176 cases; 7.93 example, 9.35 system example, zero-success rule, penalties and cap. |
| 04 | Done | 4 | `test_red_team_frameworks.py`: 14 cases; totals, mappings, status reasons/order and constrained harmful scope. |
| 05 | Done | 4 | `test_red_team_judge.py`: 32 cases; per-plugin rubrics, hostile delimiters, size bounds, strict verdict/error parsing. |
| 06 | Done | 5 | `labels.test.js`; token-only feature stylesheet; semantic labels and unknown values; lint/build; browser mobile targets. |
| 07 | Done | 4 | `editorSummary.test.js`; 96 attacks, 101 target calls, displayed 24 estimated judge calls, 21 estimated minutes; limits and distinct-control coverage. |
| 08 | Done | 5 | Client-service and polling tests: encoded filters, export URL/auth, draft-to-queued polling, visibility, stale response and timer cleanup. |
| 09 | Done | 3 | Both Procfiles declare all four processes; deployment recovery/scale guidance; fresh recovery import. Historical byte-identity limit recorded below. |
| 10 | Done | 4 | `test_red_team_manifest_v3.py`: 14 cases; deterministic 96+5 manifest, unique isolated markers and limits; exact-101 impossibility recorded below. |
| 11 | Done | 5 | `test_red_team_evidence.py`: 20 cases; encoded evidence, refusal precedence, fictional tool syntax, policy/control paths and decisive steps. |
| 12 | Done | 6 | `test_red_team_report_v3.py`: 19 cases; approved 96+5 fixture, rates, terminal/provisional/cancelled scores, pairing, trend and mapping consistency. |
| 13 | Done | 5 | `TestList.test.jsx`; grouping, legacy/missing scores, readiness, empty/filter states and callbacks; matching browser flows. |
| 14 | Done | 5 | `TestEditor.test.jsx`; limits, raw/protected fields, judge toggle, submission contract, errors and Advanced; browser contract flow. |
| 15 | Done | 5 | `RunProgress.test.jsx`; progress/pace/provisional gating, cancel consequences, one callback and focus restoration; browser cancel flow. |
| 16 | Done | 5 | `ReportSummary.test.jsx`; risk comparisons, proven/judged rates, table ordering, zero-risk and missing values; named worst strategy and browser breakdown flow. |
| 17 | Done | 5 | `ComplianceTabs.test.jsx`; four tabs, keyboard focus/selection, null ATLAS IDs, evidence/reasons and provisional state; browser keyboard/mobile checks. |
| 18 | Done | 5 | `ResultsTable.test.jsx`; filtering, judged labels, encoded/withheld/expired detail, pairing, Radix Escape and focus restoration; browser retention/detail flows. |
| 19 | Done | 5 | `ReportStates.test.jsx`; cancelled, authentication failure, no-judge, disclosure and limitations; legacy rendering without API calls; four browser states. |
| 20 | Done | 4 | `test_red_team_queries_v3.py`: 13 unit cases and 1 passing Mongo queries case; scoped filters/pairing, retention and CSV-safe export source reviewed. |
| 21 | Done | 5 | `RedTeamPage.test.jsx`: 15 cases; routes, legacy report, idempotent launch/retry, polling, cancel, export, validation/filter mapping and stale detail. |
| 22 | Done | 4 | `test_red_team_schemas_v3.py`: 18 cases; v3/legacy limits and field paths; Mongo API case passed on retry; routes/service/indexes/API contracts reviewed. |
| 23 | Done | 4 | All 4 Mongo worker/recovery cases passed; exact/judge/no-judge, invalid JSON, retry cap, admission/revocation/cancellation, heartbeat and legacy branch source reviewed. |
| 24 | Done | 5 | All 17 named browser flows pass, including desktop/mobile axe; real pipeline case passed; prior authorized direct fixes are already logged in their owning specs. |

## Architecture invariant and duplication sweep

1. Legacy v2 catalog, manifest builder, evaluator, evaluator/score unit tests and
   `test_red_team_flow.py` have no diff against their tracked HEAD versions.
   Format branches retain legacy list/detail/report/export/comparison paths.
   The existing Studio browser suite passed unchanged in this verification.
2. `dispatcher.dispatch_once` publishes exactly `v`, `job_id`, `test_id`, and
   `generation`. Its injected publisher is fake in integration tests; text and
   responses do not enter broker messages.
3. V3 worker calls `evidence.grade` first. Only `needs_judge` with retained content
   and a configured judge enters `_judge`; judged results use source `judge`.
4. Aggregation and query chip counts use the shared outcome classification;
   cancelled, inconclusive and error rows are excluded from decided rates.
5. Running reports suppress risk/compliance/threshold and expose provisional
   success. Cancelled reports suppress risk/compliance and scored trends, with
   an insufficient-evidence threshold. Regression assertions cover both states.
6. Recovery finalizes uncertain `calling_provider` jobs without replay; durable
   judging can resume and caps judge dispatches at two. Completed judge records
   resume without another call.
7. Production target/judge calls use `ProviderService` and integration admission;
   target admission releases before judge admission. Tests inject fake providers.
8. AST import review found no database/network/provider/clock dependency in the
   pure `app/red_team` modules. Local catalog/framework resource reads are expected.
9. Feature component scan found zero service imports or `fetch` calls. The page
   owns orchestration and uses the existing service and polling hook.
10. Tenant/admin validation stays in `_tenant`; judge/target authority and model
    availability are checked and frozen at launch, then rechecked by workers.
11. Catalog has 8 plugins, 8 strategies, 5 controls and exactly 5 templates per
    plugin. Review found fictional Northwind Desk/Casey Sample/Glimmerfen content,
    example.test addresses, fictional nonexecuting tools and no real people or
    secrets. The real-looking key/address scan found zero matches.
12. Feature JSX/CSS and page CSS contain no raw hex/rgb/hsl/oklch colours; they
    consume incumbent tokens. Existing app-wide styling is outside this sweep.
13. Framework total/mapped counts are OWASP 10/5, ATLAS 16/6, NIST 21/18 and EU
    14/12. All 16 ATLAS display IDs are null; presentation uses tactic names.
14. Source ownership remains intact in this verification. No application files
    were changed. The earlier spec 24 owning-file corrections remain documented.

All 22 inventory fragments occur verbatim in `specs-red-team/INVENTORY.md`.
Duplication review found one shared semantic label module, one shared formatting
module, both dialogs using the shared Radix primitive, one v3 evidence grader,
one judge parser, and one risk-scoring implementation. Local clamped percentage
bar widths, one-decimal risk text and descriptive dialog titles are presentation
helpers. V2 normalization/grading is intentionally preserved for compatibility;
v3 normalization is in `strategies.py`, not copied into queries or components.

The explicit file-by-name sweep included every unit and integration file named
by spec 25, `frameworks.json`, worker, route, schema, indexes, API contracts, both
Procfiles, deployment guidance, frontend package scripts, browser API fixture,
`PluginTable.jsx`, `StrategyBreakdown.jsx`, and `AttackDetailDialog.jsx`.

## Figures the FYP report can cite

- Implemented synthetic coverage: 8 plugins × 8 available strategies, 40 original
  adversarial templates and 5 control questions; a configured run permits at most
  100 adversarial attacks plus 5 controls. This is not 100 unique templates.
- The deterministic 8-plugin × 4-strategy × 3-repetition fixture has 96 adversarial
  attacks plus 5 controls. Its report fixture has 19 unsafe, 69 defended,
  6 inconclusive and 2 error adversarial results: 19/88 = 21.6% success, 15 exact
  unsafe and 4 judged unsafe; 69/88 = 78.4% defended, below the 80% threshold.
- The backend report fixture computes system risk 9.5 Critical, with its own
  protected fixture at 7.4 High. The UI design/browser fixture's 9.4 versus 4.1
  comparison is separate illustrative data; it is not a measured provider result.
- Framework figures are mapped synthetic controls, not compliance certification.
- Test counts above describe software verification with synthetic fixtures and
  fake providers; they do not measure real-model safety, attack efficacy or judge
  accuracy. No real-provider benchmark was performed.

## Deviations, warnings and verification limits

- No automated-suite or architecture-invariant failure has required an implementation change.
  Spec 24 historically fixed bugs directly in owning files under the user's
  explicit authorization, instead of creating fix specs. Its criterion about
  fix-spec numbers is therefore satisfied by that recorded authorized deviation.
- Spec 10/22's literal 101-adversarial input cannot be factored into the allowed
  plugin/strategy/repetition bounds. The actual tests reject reachable totals
  above 100 (including 105/128), and accept the 100 boundary plus 5 controls.
- Spec 18's early native-dialog Log entry was superseded by its dated Radix
  correction. Spec 00's reference to browser work in spec 23 is a historical
  owner-number typo; the browser harness is actually owned by spec 24. The folded
  spec 11 fragment likewise has historical consumer-number mislabels, clarified
  in the consolidated inventory without rewriting finished fragments/specs.
- Procfile declarations and importability were rechecked. There is no tracked
  pre-spec Procfile baseline in this checkout to independently prove the earlier
  three lines were byte-identical when spec 09 added recovery; its existing Log
  remains the historical evidence for that claim.
- Editor judge-call/time figures deliberately follow spec 07's quarter-of-attacks
  estimate. The displayed “up to 24” is not an enforced judge-call ceiling: the
  worker may judge every undecided attack and retry each judge at most once.
  Do not cite that UI estimate as a hard cost or duration bound.
- No live LLM provider, live judge, RabbitMQ broker, deployment, physical device,
  Safari/Firefox, or assistive-technology session was exercised. These are outside
  the authorized automated scope. Chrome viewport/axe/focus checks are automated
  evidence, not proof of accessibility on every device or with every screen reader.
- `npm ci` reported 12 dependency vulnerabilities (1 low, 4 moderate, 7 high).
  Dependencies were installed from the lockfile and left unchanged; no audit fix
  or dependency upgrade is part of spec 25. Build emitted a plugin-timing advisory;
  Playwright emitted NO_COLOR/FORCE_COLOR notices. These are not lint failures.
- The validator's 31 warnings comprise 26 absent GitHub issues (publishing is
  forbidden), 3 historical date-format warnings in specs 03/05/10, the intentionally
  direct 22→04 dependency, and the terminal verification report having no later
  consuming spec. Existing README Known gaps covers the issue/dependency/artifact
  warnings. Older specs/README are not rewritten to silence warnings.

## Cleanup and final gate

The first integration attempt encountered a MongoDB DNS outage at the v3 API
export request. The API logged Database unavailable (`_OperationCancelled`);
the CSV assertion parsed zero rows. Teardown then raised
`ServerSelectionTimeoutError` with temporary name-resolution failure, and the
six later cases errored during setup with DNS SRV SERVFAIL. Authentication,
HTTP/resources, enforcement, catalogs and all 11 legacy Red Team cases passed.
The failed export result is retained as evidence; it is not silently counted as
a pass or conclusively classified as an application defect.

After the resolver recovered, cleanup listed the one remaining `test_*` database
created by this attempt, dropped it, and confirmed zero remaining. No other
database was touched. A new SRV probe returned the expected three records.
The entire integration retry passed in four disjoint file groups in separate
pytest processes, preserving all 114 cases and the UUID database fixture. No
test/source changes or network configuration changes were made to work around
the outage.

Final filtered database listing: `[]`; a second listing confirmed **0** remaining
`test_*` databases. The passing retry left no databases needing manual deletion.
SHA-256 comparison of all 304 recorded source/test/config files found no changed,
missing or added files in the checked application/test roots. All 22 inventory
fragments remain included verbatim; specs 00–24 remain Done.

Final process review found no remaining pytest, backend server, production-preview
server or Playwright browser process from this verification. The unrelated Vite
process on port 5199 is untouched. Final validator: **26 specs, 0 errors, 31
nonblocking warnings**. Spec 25's five acceptance boxes, dated Log and progress
row record these results.
