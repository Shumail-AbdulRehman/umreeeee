# Red Team repo survey

Date: 2026-11-11. Read-only survey of the current working tree (root git: one commit `2d25058`; real history in the nested `backend/` and `Frontend/` repos; root tree heavily dirty and preserved).

## Backend (FastAPI, Python 3.12, `backend/.venv`)

| Path | Lines | Role today |
| --- | ---: | --- |
| `app/red_team/catalog.json` | 48 | `synthetic-catalog-2`: 5 categories x 5 templates (`direct_injection`, `indirect_injection`, `pii_extraction`, `jailbreak`, `off_topic`) + 5 controls |
| `app/red_team/catalog_schema.py` | 51 | `manifest(categories, num_attacks, seed)` builds rows with `SYNTH-PRIVATE-`, `REFUSE-`, `SAFE-SUPPORT-`, `OFFTOPIC-` markers and a per-row scenario system prompt; `manifest_hash`; `CATALOG_VERSION`, `EVALUATOR_VERSION='exact-evidence-2'`, `CATEGORIES` |
| `app/red_team/evaluators.py` | 41 | `evaluate(job, response, protected_run, error_code)` returns (verdict, reason, explanation); verdicts `pass`/`fail`/`inconclusive`/`error` |
| `app/services/red_team_service.py` | 371 | `RedTeamService`: create/edit/list/detail/launch/cancel/clone/results/result_detail/report/export/comparison; launch freezes `config_snapshot` and inserts jobs in one transaction |
| `app/services/red_team_report_service.py` | 58 | `progress`, `score` (compliance = pass/evaluable, threshold verdict, min evaluable fraction .8), `terminal_status` |
| `app/workers/red_team_worker.py` | 379 | `process_job`: claim lease, admission, `_raw` / `_protected`, `_prepared` (phase `response_persisted`), `evaluate`, `_finalize` (transaction, threshold notification), `_retry`; `main()` Pika consumer |
| `app/queue/dispatcher.py` | 90 | Outbox: claims `pending` jobs, publishes `{v, job_id, test_id, generation}` |
| `app/queue/recovery.py` | 106 | Resets publishing/stale-queued jobs, recovers expired leases by phase, reconciles parents; `__main__` loop every 15 s (not in any Procfile) |
| `app/api/routes/red_team.py` | 124 | 14 routes under `/api/red-team`, admin only via service `_tenant` |
| `app/schemas/red_team.py` | 41 | `TestConfig` (name, integration_id, model, mode, subject_user_id, attack_categories 1-5, num_attacks 1-100, threshold_score, seed, temperature, max_tokens), `TestEdit`, `LaunchRequest`, `CloneRequest` |
| `app/services/protected_prompt_service.py` | 521 | `execute_protected(user, payload, identity)` with `source='red_team'` uses a frozen `snapshot` and `scenario_system`; `on_provider_dispatch` hook |
| `app/services/provider_service.py` | 203 | `ProviderService.execute(integration, payload, request_id, admission)`; six providers; `ProviderError` codes |
| `app/services/integration_admission.py` | 60 | Mongo lease + pacing per integration (`INTEGRATION_REQUESTS_PER_MINUTE`, default 6) |
| `app/services/cost_service.py` | 61 | `estimate_result_cost` |
| `app/db/indexes.py` | 58 | 9 red-team indexes (tests recent/status/integration; jobs position/state/verdict/dispatch/recovery/content expiry) |
| `scripts/reconcile_red_team.py` | 6 | One-shot `recover()` |
| `Procfile`, root `Procfile` | 3 each | web, worker, dispatcher; no recovery process |

Tests: `tests/unit/test_red_team_evaluators.py` (4), `tests/unit/test_red_team_scores.py` (2), `tests/integration/test_red_team_flow.py` (11, fixture `red_team(test_database)`; skipped without `TEST_MONGODB_URL`). Commands run 2026-11-11: `.venv/bin/python -m pytest -q tests/unit` → 101 passed. No backend linter or type checker is configured; `requirements-dev.txt` adds only pytest and httpx.

## Frontend (React 19.2.5, Vite 8, Tailwind 4, JavaScript/JSX)

| Path | Lines | Role today |
| --- | ---: | --- |
| `src/pages/RedTeamPage.jsx` | 153 | One file: `TestEditor` (3-step modal), `ScoreSummary`, `AttackDetail`, list + detail page; `window.confirm` for cancel |
| `src/pages/red-team.css` | 16 | Page styles |
| `src/hooks/useRedTeamTest.js` | 34 | Polls every 2 s while not terminal; stops for `draft`; `refresh()` fetches once (defect: launch from an open draft never restarts polling) |
| `src/services/redTeam/redTeamService.js` | ~40 | Wrappers for all 14 routes plus `downloadRedTeamExport` |
| `src/components/ui/` | — | badge, button, dialog, dropdown-menu, input, popover, separator, skeleton, table, textarea, tooltip |
| `src/components/` | — | DataTable, StatusBadge, AnalyticsChart, Modal, FieldErrors, Surface (Pagination, SearchInput, StatCard, EmptyState), PageTitle, Sidebar, Topbar |
| `src/lib/format.js` | — | `formatNumber`, `formatMoney`, `formatDate`, `formatPercent`, `readable` |
| `src/features/prompt-studio/` | — | Precedent for feature folders with colocated `*.test.jsx` |

Commands (from `Frontend/`), run 2026-11-11: `npm test` → 8 Node + 89 component tests passed; `npm run lint` → clean; `npx vite build` → passed. Component tests: `npm run test:components -- <file>` (Vitest 5.1.0 + Testing Library + jsdom, `src/**/*.test.{js,jsx}`). Playwright 1.64 and `@axe-core/playwright` installed; Playwright's own browsers are not downloaded, `/usr/bin/google-chrome` works as `executablePath`.

## Environment limits observed

- Docker is installed but this account cannot reach the daemon (`docker ps` permission denied), so a disposable MongoDB replica set or RabbitMQ cannot be started from this session.
- No live provider key is configured for testing; live model calls stay `[requires:]`.
