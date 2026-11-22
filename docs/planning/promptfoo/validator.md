Validating /home/shumail/umer-FYP/FYP_Part_1/specs-promptfoo  (22 specs)

Parallel schedule  (9 waves · widest 8 · 22 specs)
  W0  00
  W1  01 05 07 08
  W2  02 03 09 11 12 13 14 15
  W3  04 06 18
  W4  10 16
  W5  17
  W6  19
  W7  20
  W8  21

00-promptfoo-decisions.md
  WARN   Status is 'Done' but no GitHub issue is recorded

02-plugin-and-strategy-catalog.md
  WARN   creates 'backend/app/red_team/promptfoo_catalog.json' but no other spec mentions it — check it is not an endpoint or component with zero callers

16-service-schemas-routes-indexes.md
  WARN   creates 'backend/app/db/indexes.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   Depends on 01, 02, 03 is already implied through another dependency

17-worker-and-recovery.md
  WARN   Depends on 05 is already implied through another dependency

18-red-team-page-integration.md
  WARN   Depends on 07 is already implied through another dependency

19-remove-in-house-engine-and-archive-legacy-data.md
  WARN   creates 'backend/app/red_team/catalog_v3.json' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/evaluators.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/evidence.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/judge.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/manifest_v3.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/plugins.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/red_team/strategies.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/app/services/red_team_report_service.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/integration/test_red_team_flow.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/integration/test_red_team_v3_api.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/integration/test_red_team_v3_pipeline.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/integration/test_red_team_v3_queries.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/integration/test_red_team_v3_worker.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_evaluators.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_evidence.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_frameworks.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_judge.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_manifest_v3.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_plugins.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_queries_v3.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_report_v3.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_schemas_v3.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_scores.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   creates 'backend/tests/unit/test_red_team_strategies.py' but no other spec mentions it — check it is not an endpoint or component with zero callers
  WARN   Depends on 16 is already implied through another dependency

22 specs · 0 error(s) · 31 warning(s)
Warnings are not blocking — justify each one in README.md under 'Known gaps', or fix it.
