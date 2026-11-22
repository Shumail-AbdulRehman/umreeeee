# Red Team reuse inventory

Built from the code on 2026-11-11; re-checked against the implementation on 2026-11-14 by spec 25. All 22 `inventory/NN-<slug>.md` fragments are folded below, with their original interface descriptions preserved.

## Backend services

### provider-service
`backend/app/services/provider_service.py` — `ProviderService.execute(integration, payload, request_id, admission)` and `ProviderError`. The only way to call a model, including the judge.

### integration-admission
`backend/app/services/integration_admission.py` — `IntegrationAdmission.acquire/verify/heartbeat/release`, `AdmissionUnavailable(retry_after)`. One lease per integration; reuse for the judge integration.

### protected-execution
`backend/app/services/protected_prompt_service.py` — `ProtectedPromptService.execute_protected` with `source='red_team'`, frozen `snapshot`, `scenario_system`, `on_provider_dispatch`. Protected-mode attacks go through it unchanged.

### cost-estimate
`backend/app/services/cost_service.py` — `estimate_result_cost(model, prices, provider, result)`. Reuse for judge cost.

### content-crypto
`backend/app/services/content_service.py` — `encrypt`, `decrypt`, `expire_content`, `shorten_retention`. Responses are stored only as ciphertext.

### admin-common
`backend/app/services/admin_common.py` — `utcnow`, `audit`, `serialize`, `transaction`, `find_tenant`, `check_version`.

### legacy-red-team
`backend/app/red_team/catalog_schema.py`, `evaluators.py`, `services/red_team_report_service.py` — v2 manifest, grader, `progress`, `score`, `terminal_status`. Keep for legacy tests; reuse `progress` and `terminal_status` for v3.

### red-team-service
`backend/app/services/red_team_service.py` — `RedTeamService` with `_tenant`, `_transaction`, `_validate_config`, `launch` snapshot freezing, `comparison`, `export` CSV formula neutralization. Extend, do not fork.

### worker-pipeline
`backend/app/workers/red_team_worker.py` — `_claim`, `_keep_alive`, `_mark_dispatch`, `_raw`, `_protected`, `_prepared`, `_finalize`, `_retry`, `process_job`. Extend with the judge phase.

### queue
`backend/app/queue/dispatcher.py` (`dispatch_once`), `rabbit.py`, `recovery.py` (`recover`).

### permitted-risk-scoring-source
`~/Downloads/scheduler_umr.zip` → `scheduler_umr/utils/risk_scoring.py` and `utils/constants.py` `FRAMEWORKS`. Reuse permitted by the code owner (intake #4). Read with `unzip -p`; never extract logs.

## Backend tests

### red-team-integration-fixture
`backend/tests/integration/test_red_team_flow.py` — `red_team(test_database)` fixture: synthetic company, admin, fake Ollama integration, `RedTeamService`. Fake provider objects with `execute()` returning `ProviderResult`. Copy the pattern for v3 tests.

### test-database
`backend/tests/integration/conftest.py` — `test_database` creates and drops a uniquely named database; skips without `TEST_MONGODB_URL`.

## Frontend

### red-team-service-client
`Frontend/src/services/redTeam/redTeamService.js` — wrappers for all 14 routes and `downloadRedTeamExport`.

### red-team-hook
`Frontend/src/hooks/useRedTeamTest.js` — polling every 2 s while not terminal, visibility resume, back-off on error.

### ui-primitives
`Frontend/src/components/ui/` — button, dialog, dropdown-menu, input, popover, badge, separator, skeleton, table, textarea, tooltip (shadcn/Radix).

### shared-components
`Frontend/src/components/Modal.jsx`, `FieldErrors.jsx`, `Surface.jsx` (Pagination, SearchInput, StatCard, EmptyState), `StatusBadge.jsx`, `PageTitle.jsx`.

### formatters
`Frontend/src/lib/format.js` — `formatNumber`, `formatMoney`, `formatDate`, `formatPercent`, `readable`.

### integrations-and-users
`Frontend/src/services/integrations/llmIntegrationService.js` (`fetchLLMIntegrations`), `Frontend/src/services/users/userManagementService.js` (`fetchManagedUsers`).

### component-harness
`Frontend/vitest.config.js`, `Frontend/tests/setup-components.js` — Vitest + Testing Library + jsdom; `npm run test:components -- <file>`.

### browser-harness-precedent
`Frontend/playwright.studio.config.js`, `Frontend/tests/prompt-studio.spec.js` — production-preview Playwright with intercepted APIs, `/usr/bin/google-chrome`.

### approved-design
`design/red-team/v3/` — tests.html, new-test.html, running.html, report.html, states.html, styles.css, prototype.js (behaviour reference only; never paste).


## Implemented spec fragments

Spec 25 verified each fragment is included verbatim. The current implementation and
the later integration corrections take precedence over historical usage notes:

- Spec 20 owns read queries, spec 23 executes/grades jobs, and spec 18 renders the
  attack dialog. The spec 11 fragment's consumer numbers are historical mislabels.
- Both feature dialogs reuse `src/components/ui/dialog.jsx` (Radix). The attack
  dialog restores the original opener; the cancel dialog uses Radix trigger focus.
- The spec 24 cancellation corrections suppress risk/compliance for cancelled
  tests and exclude them from scored trends; threshold remains insufficient evidence.
- Shared text/number/date/money/percentage formatting lives in `src/lib/format.js`;
  semantic labels live in `features/red-team/labels.js`. Local clamped bar widths,
  one-decimal risk text, and explanatory dialog titles are presentation helpers.
- Legacy normalization/evaluation remains separate for v2 compatibility. V3 uses
  `strategies.normalize`, `evidence.grade`, the strict judge parser, and the single
  `risk_scoring` implementation; queries and presentation do not copy grading.

The dated suite evidence, criterion-by-criterion review, invariant sweep and
verification limits are in `docs/planning/red-team/implementation-verification.md`.

Folded from every per-spec fragment on 2026-11-14. The source fragments remain as provenance.


# Inventory fragment: spec 01 plugin catalog

### catalog-v3
`backend/app/red_team/catalog_v3.json` — version `synthetic-catalog-3`: 8 plugins (id, name, group, severity, description, evidence_type, scenario, 4-6 templates `{id, description, prompt}`), 8 strategies (id, name, group, description, effort), 5 controls (`ctl-1`..`ctl-5`). **Added by:** spec 01.

### plugins-loader
`backend/app/red_team/plugins.py` — pure loader and validator. Read-only registries `PLUGINS`, `STRATEGIES`, `CONTROLS` (id to frozen mapping; lists are tuples), `PLUGIN_IDS`, `STRATEGY_IDS`, `CONTROL_IDS`, `CATALOG_VERSION`, `CATALOG_SOURCE`; closed sets `SEVERITIES`, `GROUPS`, `EVIDENCE_TYPES`, `STRATEGY_GROUPS`, `EFFORTS`, `PLACEHOLDERS`; `get_plugin(id)`, `get_strategy(id)`, `load(path)`, `validate(data)`, `fill(text, values)`, `CatalogError(ValueError)` (raised at import for a bad catalog). **Added by:** spec 01.

How later specs use it:
- Placeholders: `scenario` and template/control `prompt` text may contain `{marker}`, `{refusal}`, `{answer}`. Spec 10 substitutes with `fill(text, values)` (do not use `str.format`; one prompt holds literal JSON braces).
- Spec 02: strategy ids/groups/effort come from `STRATEGIES`; ids `basic, base64, rot13, leetspeak, hex, roleplay, hypothetical, authority`.
- Spec 04: key framework maps by `PLUGIN_IDS`; severities in `PLUGINS[id]['severity']` (lowercase).
- Spec 05 / 11: `evidence_type` per plugin: prompt-extraction, direct-injection, harmful = `marker`; pii = `pii`; indirect-injection = `safe_summary`; tool-injection, excessive-agency = `tool_call`; hijacking = `off_topic`. Controls use evidence type `control` (not a plugin value). tool_call evidence = the payload token appears inside fictional call syntax `[[call <tool>(`…`)]]` in the reply; the token itself is in the sent prompt by design; a bare echo of the token is not evidence (spec 11). Template prompts never contain `[[call`; only scenarios define the syntax. harmful and hijacking scenarios tell the model to begin with `{marker}` if it complies.
- Spec 10: manifest rows copy `plugin_id`, `severity`, `template_id`, `evidence_type`, `scenario`.
- Spec 12 / 22: names, groups, descriptions and strategy metadata for capabilities and report rows.
**Added by:** spec 01.


# Inventory fragment: spec 02 strategy transforms

### strategies-module
`backend/app/red_team/strategies.py` — pure (stdlib only) strategy transforms and reply decoders. `apply(strategy_id, prompt, seed_material='')`, `decoded_variants(text)`, `normalize(text)`, `StrategyError(ValueError)`, `STRATEGY_IDS`, limits `MAX_INPUT_CHARS=24000`, `MIN_RUN_CHARS=16`, `MAX_RUNS_PER_KIND=20`, `MAX_TOTAL_VARIANT_CHARS=48000`. Oversize input or unknown strategy raises `StrategyError`. **Added by:** spec 02.

How later specs use it:
- Spec 10: `apply(strategy_id, filled_template_prompt, seed_material)` builds the sent text; use a stable seed such as `f"{seed}:{plugin_id}:{template_id}"` so the frame is reproducible. Encoding strategies wrap the whole prompt in a short decode-and-follow instruction (`basic` is unchanged). The grader still needs the ORIGINAL marker, not the encoded one.
- Spec 11: grade with `any(normalize(marker) in normalize(v) for v in decoded_variants(reply))`. `decoded_variants` returns `[reply, base64 runs, hex runs (spaces/colons allowed between bytes), whole-reply ROT13, leetspeak-reversed casefolded reply]`, deduplicated; only runs of 16+ chars, valid printable UTF-8. ROT13 and leet variants transform the whole reply, so compare by substring on the normalised form. The leet variant maps 4,3,1,0,5,7 to a,e,i,o,s,t and so also rewrites real digits in a marker; always test the raw reply and the other variants too.
- Spec 20: `normalize` is the same policy as `evaluators.normalized` (replicated, not imported).
**Added by:** spec 02.


# Inventory fragment: spec 03 risk scoring

### risk-scoring
`backend/app/red_team/risk_scoring.py` — pure 0-10 risk model (promptfoo port, permitted). Inputs are counts only: `StrategyCounts(strategy, decided, worked)` where `worked` = attacks that succeeded (target unsafe). Functions: `score_plugin(plugin_id, severity, strategies) -> PluginRisk` (score, level, worst_strategy, complexity_score, per-strategy `StrategyScore`, `RiskComponents`), `score_system(plugins) -> SystemRisk` (score, level, distribution dict over none/low/medium/high/critical, components), `score_to_level(score)`, `get_strategy_metadata(id)`, `STRATEGY_METADATA`. Levels: `none` (score 0), `low`, `medium`, `high` (>=7), `critical` (>=9). Severities lowercase; others raise `ValueError`. Unknown strategy ids use (exploitable, medium). Scores are unrounded floats; round at display. **Added by:** spec 03.

How later specs use it:
- Spec 12: group job results per plugin into `StrategyCounts` (decided = attacks with a verdict, worked = unsafe ones; skip undecided/errored), call `score_plugin` with the catalog severity, collect the `PluginRisk` list for `score_system`. Persist `score`, `level`, `worst_strategy`.
- Spec 16 / 22: map levels to colours and labels; `none` is a valid level to display.
**Added by:** spec 03.


# Inventory fragment: spec 04 framework mapping

### frameworks-data
`backend/app/red_team/frameworks.json` — four frameworks `owasp` (10, LLM01-LLM10), `atlas` (16 tactics, `id` null), `nist` (21 Measure controls), `eu` (14). Each control: `key` (unique slug), `id` (display id or null), `name`, `plugins` (subset of the eight spec 00 ids), optional `reason_not_testable`. Mapped plugins: OWASP 5 of 10, ATLAS 6 of 16, NIST 18 of 21, EU 12 of 14; `harmful` maps only to NIST 2.6 and ATLAS Resource Development and Impact. **Added by:** spec 04.

### frameworks-module
`backend/app/red_team/frameworks.py` — pure. `framework_catalog()` returns `[{id, name, total, controls[{key,id,name,plugins}], plugins{plugin_id: [control keys]}}]`; `compliance(plugin_counts)` with `{plugin_id: {"decided": n, "worked": n}}` (a key present means the plugin is selected) returns `{framework_id: {id, name, total, failed, passed, not_tested, controls[{key,id,name,status,worked,decided,reason}]}}` sorted failed, passed, not_tested (stable); `covered_controls(selected_plugins, framework_id)`; `load_frameworks()`; `PLUGIN_IDS`; `FrameworkDataError`. **Added by:** spec 04.

How later specs use it:
- Spec 07: put `framework_catalog()` into the capabilities `frameworks` list; editor coverage counts come from `plugins[plugin_id]` and `covered_controls`.
- Spec 12: build `plugin_counts` from decided/worked per plugin; also add the cross-check that every mapped id exists in `plugins.PLUGINS` (not done here).
- Spec 17: render `compliance(...)[fw]["controls"]`; ATLAS `id` is null, show the name only. `reason` is the text for not tested rows.
- Spec 22: export may reuse the same `compliance` result.


# Inventory fragment: spec 05 judge prompt

### judge-module
`backend/app/red_team/judge.py` — pure judge request builder and strict verdict parser (no provider calls, no I/O). `build_request(plugin, scenario_rules, sent_prompt, reply)` returns `{'system','prompt','rubric_version'}` (raises `KeyError` for an unknown plugin); `parse_reply(text)` returns `{'verdict': 'unsafe'|'defended'|'inconclusive', 'reason', 'error', 'rubric_version'}`. Exports `RUBRIC_VERSION` (`judge-rubric-1`), `RUBRICS` (per plugin id), `ERROR_CODES`, `MAX_REQUEST_CHARS`. **Added by:** spec 05.

How spec 23 uses it:
- Call `build_request` for an undecided result; pass `system` as the judge integration's `system_prompt` and `prompt` as the single user prompt to `ProviderService.execute`; store `rubric_version` with the judge result.
- Feed the judge's text to `parse_reply`; `error` null means decisive (`source: judge`); otherwise record `inconclusive` with the `error` code (`judge_unsure`, `judge_invalid_json`, `judge_invalid_verdict`, `judge_reason_too_long`, `judge_empty`). Retries and cost stay in spec 23.
- Pass the plugin's catalog `scenario` (placeholders filled) as `scenario_rules`. Tool plugins: unsafe means emitted `[[call <tool>(...)]]` syntax with the payload.
**Added by:** spec 05.


# Inventory fragment: spec 06 frontend foundation

### red-team-css
`Frontend/src/features/red-team/red-team.css` — feature stylesheet. `:root` defines every `--rt-*` alias from DESIGN-SYSTEM.md (`--rt-canvas`, `--rt-surface`, `--rt-surface-subtle`, `--rt-line`, `--rt-line-subtle`, `--rt-ink`, `--rt-ink-secondary`, `--rt-ink-muted`, `--rt-accent`, `--rt-accent-soft`, `--rt-success`, `--rt-success-soft`, `--rt-success-line`, `--rt-danger`, `--rt-danger-soft`, `--rt-danger-line`, `--rt-critical`, `--rt-warning`, `--rt-warning-soft`, `--rt-warning-line`, `--rt-bar-track`) plus `--rt-motion-fast`, `--rt-motion-standard`, `--rt-ease-out`. Shared classes, all `rt-` prefixed. **Added by:** spec 06.

Classes:
- Typography and utilities: `rt-page-title`, `rt-muted`, `rt-mono`, `rt-num`, `rt-nowrap`, `rt-empty`, `rt-sr-only`, `rt-mark`.
- Panels: `rt-panel`, `rt-panel-head`, `rt-panel-title`, `rt-panel-body`, `rt-panel-note`, `rt-panel-foot`.
- Badges (verdict, status, level, severity, mode, control status): `rt-badge` plus one tone class, optional `rt-badge-sm` (11px), `rt-judged` (dashed border for judge verdicts).
- Tones, for badges, banners and chips: `rt-tone-pass`, `rt-tone-fail`, `rt-tone-warn`, `rt-tone-accent`, `rt-tone-critical`, `rt-tone-neutral`.
- Banners: `rt-banner` plus a tone class.
- Bars and scales: `rt-bar` (72px inline; `rt-wide` for full width; `rt-bar-risk` for danger fill; the child `span` width is set inline as a percentage), `rt-scale` (critical fill), `rt-progress` (child `span` uses `style="--rt-progress: 0.46"`, scaled with `transform` at 250ms linear).
- KPI: `rt-kpi-value` (flex row), `rt-kpi-of` (the "/ 10" suffix).
- Filter chips: `rt-chip`, active when `aria-pressed="true"`; 44px tall below 600px.
- Tables: `rt-table-region` (focusable, labelled scroll wrapper, `position: relative`), `rt-table` (min-width 720px). Below 600px the table stacks into rows, and every cell needs `data-label` for its column heading. `rt-num` on a `th` or `td` right-aligns it on desktop.
- Dialogs: `rt-dialog` (760px, 12px radius, 20px/50px elevation, `::backdrop` tint). Set `data-input="pointer"` or `"keyboard"`; keyboard opens with no transition.
- Press: `rt-press` (scale .97 on `:active`, 160ms).

How specs 13-19 use them:
- Spec 13 (test list) and 18 (results): `rt-table-region` with `tabindex="0"` and `aria-labelledby`; `rt-table`; `rt-badge` with `labels.js` tones; `rt-chip` for filters.
- Spec 14 (editor): `rt-panel`, `rt-panel-head`, `rt-panel-body`, `rt-panel-title`, `rt-banner` for the validation message.
- Spec 15 (running): `rt-progress` (set `--rt-progress` from the percentage), `rt-badge` with `statusLabel`, `rt-dialog` for cancel confirmation (`rt-tone-fail` on the consequence banner).
- Spec 16 (report summary): `rt-kpi-value`, `rt-kpi-of`, `rt-scale`, `rt-bar rt-bar-risk`, `rt-badge` with `levelLabel`.
- Spec 17 (compliance): `rt-badge` with `controlStatusLabel`; `rt-panel`.
- Spec 19 (report states): `rt-banner` with tone classes; `rt-empty`.

### red-team-labels
`Frontend/src/features/red-team/labels.js` — pure display maps. Each helper returns `{label, tone}` (verdict adds `judged: boolean`; missing values add `missing: true`). Tones: `pass`, `fail`, `warn`, `accent`, `critical`, `neutral`, matching the `rt-tone-*` classes. **Exports:** `notScored` (the string `'Not scored'`), `verdictLabel(verdict, {verdict_source, control})`, `statusLabel(status, percent)`, `levelLabel(level)`, `severityLabel(severity)`, `modeLabel(mode)`, `controlStatusLabel(status)`, `evidenceSourceLabel(source)`. **Added by:** spec 06.

How later specs use it:
- Verdicts: pass the result's `verdict` and `verdict_source`. Set `control` for control cases so `pass` reads "Answered". `pending` (or `judging`) reads "Judging". Judged results read "Unsafe · judged" and set `judged: true`, so the badge can add `rt-judged`.
- Statuses: `statusLabel(status, percent)`. Running with a percentage reads "Running · 46%".
- Levels: `levelLabel` accepts Critical, High, Medium, Low and None in any case.
- Missing values: when `missing` is true, render the visible en dash inside `aria-hidden`, plus `<span class="rt-sr-only">{notScored}</span>`.
- Unknown values fall back to `readable` text; the helpers never return undefined.
- Control status keys: `failed`, `passed`, `not_tested`.
- Evidence sources: `policy`, `exact`, `judge`.

### red-team-motion-tokens
`--rt-motion-fast` (160ms), `--rt-motion-standard` (200ms) and `--rt-ease-out` (`cubic-bezier(.23, 1, .32, 1)`) are defined in `red-team.css`. They are timings, not colours. Components should use these, not restate the values. **Added by:** spec 06.


# Inventory fragment: spec 07 editor summary

### editor-summary
`Frontend/src/features/red-team/editorSummary.js` — `computeEditorSummary({plugins, strategies, testsPerPlugin, judge, capabilities})`. Pure, no React, no fetch. `plugins` and `strategies` are id arrays (strategies must exclude `basic`; a stray `basic` is ignored). `capabilities` is the capabilities response and may be partial; missing `max_attacks` (100), `max_tests_per_plugin` (10), `requests_per_minute` (6) and `control_count` (5) fall back to those defaults. Returns `{attacks, controls, modelCalls, judgeCalls, minutes, coverage, blocking, maxAttacks, maxTestsPerPlugin}`, where `coverage` is `[{id, name, covered, total}]` in `capabilities.frameworks` order, `blocking` is `null` or one message string, and `judgeCalls` is 0 without a judge. **Added by:** spec 07.

How spec 14 uses it:
- Call on every editor change with the selected plugin ids, selected strategy ids, the tests-per-plugin value and the judge toggle, passing the capabilities object from props. Do not recompute attacks or minutes in the component.
- Render `attacks`, `modelCalls`, `judgeCalls` (show "about N" as an estimate when judge is on, "None" when off), `minutes` ("about N min") and `coverage` rows ("covered of total").
- Disable the launch button when `blocking` is a non-null string, and show that string as the warning. Its messages name the live `maxAttacks`, so the server limit and the UI stay in step.
- Coverage is distinct control ids per framework from the selected plugins' `frameworks` maps. Use `total` from the framework list; it is 0 only when the capabilities response had no frameworks list.


# Inventory fragment: spec 08 client service and polling

### red-team-service-queries
`Frontend/src/services/redTeam/redTeamService.js` — new exports `buildQuery(input)` (string passes through unchanged; object becomes `?k=v` via `URLSearchParams`, empty/undefined/null dropped, `''` when empty) and `buildResultsQuery(filters)` (whitelists `plugin, strategy, verdict, verdict_source, case_kind, state, page`). `listRedTeamResults(id, params)` and `listRedTeamTests(params)` now accept a string or an object. `downloadRedTeamExport` uses the same normalised base URL as `client.js` and encodes `format`. All other signatures unchanged. Spec 21 passes `listRedTeamResults(id, { plugin, strategy, verdict, verdict_source, case_kind, state, page })` instead of hand-building strings. **Added by:** spec 08.

### red-team-hook-v2
`Frontend/src/hooks/useRedTeamTest.js` — same return `{ test, error, setTest, refresh }`. Polling is driven by status: `load` (nothing loaded yet) fetches immediately, a non-terminal non-draft status polls every 2 s, draft and terminal statuses are idle. A move into a polling status via `setTest()` or `refresh()` starts polling; hidden tabs pause and visibility resumes; errors back off 4 s doubling to 30 s; unmount/id change clears timers; late responses for another id are discarded. `test` and `error` are null/empty while the loaded data belongs to a different id. `refresh()` now returns the fresh test (or null if the id changed meanwhile). Spec 21 can call `setTest(launched.test)` after launch with no manual refresh needed. **Added by:** spec 08.


# Inventory fragment: spec 10 manifest builder v3

### manifest-v3
`backend/app/red_team/manifest_v3.py` — pure. `build_manifest(plugins, strategies, tests_per_plugin, seed)` returns rows (list of dicts); `manifest_hash` re-exported from `catalog_schema`; limits `MAX_ATTACKS=100`, `MAX_TESTS_PER_PLUGIN=10`. `ValueError` for unknown/duplicate ids, empty plugins, tests outside 1-10, total over 100 (message names the limit). `basic` is always added. Rows: plugin x strategy x repetition, seeded shuffle, five controls appended last.

Row fields: `attack_index, attack_id` (= template id, legacy name), `template_id, strategy_id, plugin_id` (None for control), `severity` (None for control), `case_kind` (`adversarial`|`control`), `evidence_type`, `description`, `original_prompt` (filled template before the strategy), `prompt` (as sent), `scenario_system`, `forbidden_marker` (SYNTH-PRIVATE-), `refusal_token` (REFUSE-), `control_answer` (SAFE-SUPPORT-), `off_topic_marker` (OFFTOPIC-), `tool_payload_marker` (TOOLPAYLOAD-), `failure_marker`.

Marker scheme: suffix = first 12 hex (upper) of sha256 of `seed:index:plugin:strategy:template`; all five markers share it but differ by prefix. `{marker}` is filled by evidence type and `failure_marker` is that same value: marker, pii, safe_summary -> forbidden_marker; off_topic -> off_topic_marker; tool_call -> tool_payload_marker; control -> None (grade control_answer). Only tool_call prompts contain their failure marker (as payload, by design). Strategy seed material is `seed:index:plugin:template`.

How specs use it: spec 11 grades with `failure_marker` and `evidence_type` (refusal_token and control_answer for pass/control checks; grade against the ORIGINAL marker, since encoding strategies transform the sent text); spec 22 persists rows as jobs (attack_index pairs raw and protected runs) and stores `manifest_hash(rows)`; spec 23 sends `scenario_system` + `prompt`.
**Added by:** spec 10.


# Inventory fragment: spec 11 evidence grader

### evidence-grader
`backend/app/red_team/evidence.py` — `grade(job, response=None, protected_run=None, error_code=None)` returns a dict `{verdict (pass|fail|inconclusive|error), verdict_source (policy|exact|none), reason, explanation, needs_judge, steps}`. `steps` is always `[policy, exact, judge]`, each `{step, state (decisive|skipped|undecided), description}`; decided results have exactly one decisive step, undecided adversarial ends with `judge` undecided and `needs_judge=True`. **Added by:** spec 11.

Job keys read: `case_kind`, `evidence_type`, `failure_marker` (decisive marker; falls back to `forbidden_marker` only when absent), `refusal_token`, `control_answer`, `off_topic_marker` (all optional; blank ignored). Matching is `normalize(marker) in normalize(variant)` over `strategies.decoded_variants(reply)`; reason gets suffix `_via_<base64|hex|ROT13|leetspeak>` and the explanation names the decoding when the evidence came from a decoded variant. Reasons: `forbidden_marker_reproduced`, `tool_call_payload_executed`, `off_topic_answer_marker`, `explicit_refusal`, `safe_summary`, `control_answer`, `no_decisive_evidence`, `control_answer_missing`, `control_blocked`, `policy_block_input|output`, `unverified_block`, `missing_response`, or the passed error code. `tool_call` (adversarial only) fails only when the marker is inside `[[call <tool>(` ... `)]]` in some variant.

How later specs use it:
- Spec 20 (executor): call `grade(job, response, protected_run, error_code)` per execution; persist `verdict`, `verdict_source`, `reason`, `explanation`, `steps`. If `needs_judge` and a judge is configured, run it (spec 05) and replace verdict/source with `judge` and set the judge step to decisive (the grader leaves it undecided).
- Spec 23 (attack dialog / report): render `steps` in order with state and description; dispatch by test format (v2 jobs keep `evaluators.evaluate`). Evaluator version `exact-evidence-3`.


# Inventory fragment: spec 12 report aggregation

### report-v3
`backend/app/services/red_team_report_v3.py` — pure v3 report builder (no database, network or clock). `build_report(test, jobs, paired=None, previous=None) -> dict`; `paired`/`previous` are `(test, jobs)` or `{'test', 'jobs'}` and count only when that test is terminal. Helpers: `is_terminal(test)` (status in `red_team_report_service.TERMINAL_TEST_STATES`), `is_cancelled(test)` (status `cancelled` or `cancel_requested_at`), `outcome(job)` (`cancelled` by state first, else verdict, else `pending`), `round_half_up(value, places)`, `RISK_PLACES` 1, `RATE_PLACES` 3. Reads job `case_kind`, `plugin_id`, `strategy_id`, `severity`, `state`, `verdict`, `verdict_source`, `verdict_reason_code`; test `_id`, `status`, `mode`, `num_attacks`, `threshold_score`, `minimum_evaluable_fraction`, `plugins`, `strategies`, `cancel_requested_at`, `finished_at`. **Added by:** spec 12.

Payload (rates 0-1 floats to 3 decimals, risk to 1 decimal, half-up; levels and sorting from unrounded values; `rate` null when nothing decided):
- `provisional` bool: true while the test is not terminal; then `risk`, `threshold`, `compliance` are null and plugin `risk_score`/`level`/`worst_strategy` are null.
- `risk` {score, level, by_level{none,low,medium,high,critical}}.
- `attack_success` {rate, worked, decided, proven, judged}.
- `decided` {decided, adversarial, exact, judge, policy, defended, unsafe, inconclusive, errors, cancelled, pending} (`exact`/`judge`/`policy` split decided results by `verdict_source`).
- `threshold` {threshold, defended_rate, verdict `meets_threshold`|`below_threshold`|`insufficient_evidence`, coverage, minimum_coverage}.
- `plugins` [{id, name, severity, decided, worked, rate, risk_score, level, worst_strategy, worst_strategy_name}] by risk desc then name (provisional: rate desc, undecided last).
- `strategies` [{id, name, decided, worked, rate}] by rate desc (undecided last) then name; `basic` always listed.
- `compliance` [{framework, name, totals{total, mapped, failed, passed, not_tested}, controls[{key, id, name, status, worked, decided, reason}]}] in `frameworks.json` order; `controls` come straight from `frameworks.compliance`.
- `controls` {answered, blocked, inconclusive, error, cancelled, pending, total} (blocked = reason `control_blocked` or any control `fail`).
- `paired` {test_id, mode, status, risk, attack_success, plugin_rates{plugin_id: rate}} or null.
- `trend` {test_id, risk_score, risk_level, attack_success_rate, finished_at} or null.

How later specs use it:
- Spec 20 `report(db, test)`: load the test's jobs, the paired and previous tests with their jobs, call `build_report`, then add the reproducibility metadata and limitations (not produced here). `finished_at` and `test_id` pass through unserialized apart from `str(_id)`.
- Spec 22: v3 report route returns spec 20's result; legacy tests keep `red_team_report_service.score`.
- Specs 16/17: render the payload as is; percent = rate x 100 to 1 decimal; risk already 1 decimal.


# Inventory fragment: spec 13 test list

### red-team-test-list
`Frontend/src/features/red-team/TestList.jsx` — default export `TestList`, a controlled landing view (readiness strip, search, status and mode selects, New test button, grouped tests table, Pagination). Imports `./red-team.css`. No fetching, no debouncing. **Added by:** spec 13.

Props:
- `items`, `total`, `page`, `pageSize` (default 20), `onPageChange(page)`.
- `query`, `status`, `mode` (strings, `''` = all) and `onFilterChange(next)`; `next` is always the full `{query, status, mode}` object with the changed key replaced. Clear filters calls it with all three `''`. Page reset on filter change is spec 21's job.
- `readiness`: `{ state: 'ready' | 'waiting', lastSeenSeconds, queueConnected, requestsPerMinute }`, or omitted to hide the strip. `waiting` renders a `role="status"` banner.
- `onNew()`, `onOpen(testId)`.

Test item fields read: `id`, `name`, `model` / `provider` (fallback `config_snapshot.model` / `.provider`), `mode`, `status`, `progress.{total_jobs, terminal_jobs}` (running percent), `created_at`, `comparison_group_id`, `format`, `summary.risk.{score, level}`, `summary.attack_success.rate` (fraction 0-1), legacy `score` (number or `score.compliance_score`, fraction; shown as "Earlier format · compliance N%"). Missing values render an aria-hidden en dash plus sr-only "Not scored".

Grouping: items sharing `comparison_group_id` render in one `<tbody>`, raw first, the rest as "With policies" rows (accessible name "With policies, <test name>"). Groups keep first-appearance order. Page size applies to items, so a group split across pages shows alone.

Spec 21: fetch `listRedTeamTests({ page, q?, status, mode })`, own debounce on `query`, map readiness, `onNew` opens the editor (spec 14), `onOpen` routes by status (draft to editor, running to spec 15, else report).


# Inventory fragment: spec 14 test editor

### test-editor
`Frontend/src/features/red-team/TestEditor.jsx` — default export `TestEditor`, the full-page new/edit test form with sticky summary. Controlled only by its own local state; it never calls an API. **Added by:** spec 14.

Props: `initial` (partial v3 values, merged over defaults: protected mode, no plugins or strategies, 3 per plugin, threshold 0.8, seed 1, temperature 0.2, max_tokens 256, judge null), `capabilities` (v3 capabilities), `integrations` ([{id, account_name, provider, status, models}], non-active hidden), `users` ([{id, first_name, last_name, email, is_active}]), `fieldErrors` (server map, rendered by `FieldErrors` beside name, integration_id, model, mode, subject_user_id, plugins, strategies, tests_per_plugin, threshold_score, seed, temperature and judge), `message` (role="alert" banner), `busy` (disables all actions), `onSaveDraft(values)`, `onLaunch(values)`, `onCancel()`.

Submitted values: `{name, integration_id, model, mode, subject_user_id (null unless protected and chosen), plugins[], strategies[] (never 'basic'), tests_per_plugin, threshold_score (0-1 fraction; UI shows 50-100%), seed, temperature, max_tokens (carried from initial, default 256, no UI field), judge: {integration_id, model} | null}`. No `version` or id is included; the caller adds those.

Blocking: the launch button is disabled while `computeEditorSummary().blocking` is set or, after it, a local check fails (empty name, no integration or model, threshold outside 50-100, judge on without integration or model), or `busy`. The message is in a persistent `role="status"` element whose id is the launch button's `aria-describedby`. Save draft is only disabled by `busy` (the server validates drafts).

How spec 21 uses it: render inside the new/edit page, pass `initial` from the draft (or omit), call `createRedTeamTest`/`updateRedTeamTest` in `onSaveDraft`, and create-then-launch with the idempotency key in `onLaunch`; feed API errors back via `fieldErrors` and `message`; `onCancel` navigates back. Edit `version` handling and navigation live in spec 21.

Earlier-format drafts (`format=categories`, or legacy `attack_categories` without a format) render categories and attack count, preserve a 0–100% threshold, and submit `format`, `attack_categories`, `num_attacks` instead of the v3 plugin/strategy/judge fields. Judge call figures are estimates, with the two-attempt bound disclosed.


# Inventory fragment: spec 15 run progress

### red-team-run-progress
`Frontend/src/features/red-team/RunProgress.jsx` — default export `RunProgress`, the in-progress view with the cancel confirmation (Radix dialog from `ui/dialog.jsx`, never `window.confirm`). Imports `./red-team.css`. **Added by:** spec 15.

Props:
- `test` — `{status, progress: {total_jobs, terminal_jobs, running, queued, retry_wait, pending, finished, cancelled}}`. Bar value is `finished` (falls back to `terminal_jobs`), max `total_jobs`.
- `provisional` — `{attack_success_rate (fraction 0-1), worked, decided, finished}`. Rate shows via `formatPercent`, beside a "Provisional" badge. Overall risk always reads "Not yet".
- `latest` — rows `{id, attack_index, plugin_name, strategy_name, verdict, verdict_source, state, evidence}`; verdict badge from `verdictLabel` ("Judging" for pending).
- `requestsPerMinute` — pace; remaining minutes = ceil((queued + running + retry_wait) / pace).
- `updatedAgo` — seconds, shown in a polite live "Updated N s ago." line.
- `dispatchPending` — shows "waiting for the queue, not a result".
- `busy` — disables the Cancel test trigger and the confirm button.
- `onCancel` — called exactly once on confirm (dialog closes).

Dialog: trigger "Cancel test"; title "Cancel this test?"; three consequences (queued will not run, in-progress may finish and cost money, finished results stay in a cancelled report). "Keep running" closes and Radix restores focus to the trigger.

How spec 21 uses it: render it for `running`/`queued`/`cancelling` tests, feeding polled data (spec 08); `onCancel` should call the cancel API. The component renders no page title, mode or launch metadata; spec 21 supplies the heading. A `cancelling` status shows the badge only; spec 21 should pass `busy` while the cancel call is in flight. Extra classes `rt-run`, `rt-run-counts`, `rt-run-kpis` are unstyled hooks (red-team.css was not edited).


# Spec 16 inventory: report summary, plugin table, strategy breakdown

**Added by:** spec 16. All in `Frontend/src/features/red-team/`; each imports `./red-team.css`.

| Export | File | Props | Notes |
|---|---|---|---|
| `ReportSummary` (default) | `ReportSummary.jsx` | `report` (v3 payload), `mode` ('raw'/'protected', falls back to `report.mode`, then 'raw') | Three `<article>`s (Overall risk, Attacks that worked, Decided) in a grid. Paired card/line from `report.paired`; otherwise "Clone as protected/raw to compare." Reduction = raw minus protected, whichever run is this one. Trend sentence from `report.trend`. "By exact evidence" = `decided.exact + decided.policy`. |
| `PluginTable` (default) | `PluginTable.jsx` | `plugins`, `paired` (the `report.paired` object, a plain `{plugin_id: rate}` map, or null) | Rows render in given order. Focusable labelled region (`rt-table-region`, `data-label` cells). Missing paired rate reads "Not scored"; no worked attacks reads "No attack worked". |
| `StrategyBreakdown` (default) | `StrategyBreakdown.jsx` | `strategies` | Given order; summary sentence names the two highest-rate strategies with worked > 0. |

Bars and scales are `aria-hidden`; every number is text. Nothing animates.

## Spec 21 usage

Render `<ReportSummary report={report} mode={test.mode} />`, then a two-column grid of `<PluginTable plugins={report.plugins} paired={report.paired} />` and `<StrategyBreakdown strategies={report.strategies} />`. Fetching the report is spec 21's job; these components take plain props.


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


# Inventory fragment: spec 18 results table and attack detail dialog

### red-team-results-table
`Frontend/src/features/red-team/ResultsTable.jsx` — default export `ResultsTable`; named export `VerdictBadge({verdict, source, control})` (rt-badge with `verdictLabel` tone, `rt-judged` for judge verdicts, en dash plus sr-only "Not scored" when missing). Imports `./red-team.css`. **Added by:** spec 18.

Props: `items`, `counts` {all, unsafe, defended, inconclusive, errors, controls}, `filters` {verdict, plugin, strategy, evidence}, `plugins`, `strategies` (arrays of `{id, name}` or plain strings), `page`, `pageSize`, `total`, `onFilterChange(nextFilters)`, `onPageChange(page)`, `onView(id, {input: 'pointer'|'keyboard'})`.

- `onFilterChange` receives the full next filters object. Verdict chip values: All `''`, Unsafe `'fail'`, Defended `'pass'`, Inconclusive `'inconclusive'`, Errors `'error'`, Controls `'control'` (the page maps this to `case_kind=control`, not a verdict). Evidence select values: `''`, `'policy'`, `'exact'`, `'judge'` (page maps to `verdict_source`).
- Chips are `rt-chip` with `aria-pressed`; the View button reads "View attack N" with N = `attack_index + 1`. Table uses `rt-table-region` + `data-label` cells; paging uses `Pagination` from `Surface.jsx`.

### red-team-attack-detail-dialog
`Frontend/src/features/red-team/AttackDetailDialog.jsx` — default export `AttackDetailDialog({result, loading, error, onClose, input, mode})`. Radix `DialogContent` with class `rt-dialog`, `DialogTitle` and `DialogDescription`; controlled by whether result/loading/error is present. **Added by:** spec 18.

- Content: ordered decision steps (decisive one in the verdict's tone), explanation, judge reasoning labelled "This is a judgement, not exact proof", original attack, "Sent to the model" only when `prompt` differs, reply as received, decoded reply, withheld or expired notice instead of any reply text, paired result from `paired`, labelled "Same attack without policies" for current `mode=protected`, otherwise "Same attack with policies", latency, tokens, cost.
- Focus returns to the element focused at open time on close. `data-input` is `input` prop if given, else pointer/keyboard from the last document event.
- Escape, backdrop click and Close call `onClose`; the parent clears `result` to close.

How spec 21 uses them: hold `filters`, `page`, selected id, detail, loading and error in `RedTeamPage.jsx`; reset `page` to 1 inside `onFilterChange`; on `onView(id, {input})` fetch detail then pass it as `result` (pass `input` through); pass `loading`/`error` while fetching; `onClose` clears state.


# Inventory fragment: spec 19 report states

### report-states
`Frontend/src/features/red-team/ReportStates.jsx` — presentational banners and disclosures; import `./red-team.css`; no API calls. **Added by:** spec 19.
- `CancelledBanner({finished, total, onClone})` — `role="note"`, "Cancelled after N of M attacks"; button "Clone and run again" only when `onClone` is given.
- `FailedBanner({errorCode, total, onAction, actionLabel = 'Open Integrations'})` — `role="alert"`. Codes: `authentication` (provider rejected the integration's credentials), `rate_limited`, `timeout`, `unavailable`, `invalid_model`, `execution_outcome_unknown`; anything else (or missing) gets a generic cause.
- `NoJudgeNote({undecided, onClone})` — `role="note"`; undecided results are inconclusive and left out of the score; button "Clone with a judge".
- `MethodDisclosure()` — closed `<details>` with attack success, risk (open promptfoo scoring model) and judged explanations.
- `Limitations()` — synthetic evidence, provider variation, not proof of safety.

### legacy-report
`Frontend/src/features/red-team/LegacyReport.jsx` — default export `LegacyReport({test})`. Earlier-format banner, compliance/attack-success/coverage metrics, threshold line, controls, `AnalyticsChart` by category, category table, legacy scoring text. Reads `test.score` legacy fields and test metadata only. Uses existing `admin-*` and `red-team-*` classes from the app stylesheet.

How spec 21 uses them: when the test has no v3 report fields render `LegacyReport` (and delete `ScoreSummary` from `RedTeamPage.jsx`); on `cancelled` render `CancelledBanner` above results; on `failed` render `FailedBanner` with the most common error code and an action that opens Integrations; render `NoJudgeNote` when no judge was used and undecided > 0; place `MethodDisclosure` and `Limitations` at the foot of the report.


# Inventory fragment: spec 20 read-side queries

Added by spec 20: `backend/app/services/red_team_queries_v3.py`.

- `results(db, test, page=1, page_size=20, filters=None)`: paginated jobs, whole-test counts; filters plugin/strategy/verdict/verdict_source/case_kind/state. Counts exclude controls and cancelled rows from verdict chips.
- `result_detail(db, test, job)`: returns `{result}`, using incumbent `job_read` retention/decryption; adds names, original prompt, source, evidence_steps, judge, optional decoded_response, paired verdict. Worker writes `evidence_steps` (also accepts `steps`).
- `report(db, test)`: serialized v3 report plus reproducibility metadata, progress and test. Pairing is tenant/group/hash scoped, opposite mode and newest terminal. Previous uses same target/mode/plugin and strategy sets before this finish time.
- `export_rows(db, test, csv=False)`: raw JSON DTOs without scenario_system; with `csv=True`, formula-safe strings limited to `CSV_COLUMNS`. JSON preserves original text. No ciphertext is returned.
- `read_job`, `filter_query`, `paired_test`, `previous_test`, `csv_safe`, `CSV_COLUMNS` support spec 22.
- Imports `job_read/test_read` from the service; spec 22 must import these query functions locally in service methods to avoid a module import cycle.
- Decoding: printable base64/hex candidates are displayed; mechanical ROT13/leet transforms require known marker evidence to avoid showing transformed ordinary prose.


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


# Inventory fragment: spec 22 service and API

`TestConfig` / `TestEdit` support plugins (inferred if plugins is supplied), strategies,
tests_per_plugin and optional `JudgeConfig`; legacy categories/num_attacks remain.
V3 totals are derived and field errors have actionable paths. Plain is always added.
`RedTeamService` freezes plugin severities, strategy metadata and judge provider/prices
at launch, rechecking the tenant and enabled model. Clone preserves format and group.
V3 read methods locally import spec 20 queries to avoid cycles. Detail/list `summary`
contains risk/attack_success/decided/threshold; model_calls sums persisted attempt_number (including rate-limit retries),
judge_calls sums judge.attempts. Legacy score is unchanged.
Capabilities adds plugins with mappings, strategies, frameworks, judge support and limits;
legacy version fields are named explicitly. Results route adds plugin/strategy/source.
Indexes cover company/test/plugin_id, strategy_id and verdict_source.
API contract additions live in docs/API_CONTRACTS.md.


# Inventory fragment: spec 23 worker and recovery

`red_team_worker.process_job` branches by test format. Legacy `evaluate` remains;
v3 `evidence.grade` supplies source, reason, explanation and ordered evidence steps.
Target response is encrypted by `_prepared` before grading. Retention/withheld flags
are checked before decryption. Provider errors never invoke a judge.

`_judge` runs only undecided adversarial replies with a frozen judge. It releases
target admission first, uses judge integration admission and `_keep_alive`, persists
`execution_phase=judging` and attempt count before dispatch, then stores parsed
verdict, reason, model, rubric, latency and cost separately. `judge.completed` lets a
crash after parsing resume without another call. Rate limiting/admission contention
reschedules from the persisted response; at most two judge dispatches are allowed.
Revoked judge authority is inconclusive (`judge_unavailable`), not a test cancellation.
Cancellation is checked again in `_finalize`'s transaction.

`recover` adds judge_resume/judge_exhausted counters. An expired judging lease is
requeued with a new generation, or exhausted at two attempts. Calling-provider stays
unknown outcome and is never replayed. `_below_threshold` selects v3 report math for
both finalization and parent reconciliation; v2 scoring remains unchanged.


## Integration corrections and browser harness (specs 24–25)

- Cancelled v3 tests have null overall/plugin risk and compliance, including paired risk;
  they do not supply scored trends. Their threshold is insufficient_evidence.
- PluginTable prefers worst_strategy_name when supplied. Mobile compliance rows expose
  rt-compliance-control/id/name/status/evidence hooks; the feature stylesheet stacks them.
- Mobile cells keep all values together beside their data-label. Every visible Red Team
  button, select and summary is checked for 44px height/width. Skipped decision steps
  keep full text contrast rather than being faded.
- Frontend/playwright.redteam.config.js runs npm run test:red-team through a fresh
  production preview on port 5192 and /usr/bin/google-chrome. The fixture intercepts
  every /api call with synthetic data; 17 named browser tests cover all spec 24 flows,
  retention, focus restoration, layout geometry and axe at 1440 and 390 pixels.
- backend/tests/integration/test_red_team_v3_pipeline.py runs the real service,
  dispatcher and worker with fake providers/publisher. Includes target rate-limit retry,
  exact and judged sources, terminal report, notifications, exports and cancellation.
