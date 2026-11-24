# Spec 19 inventory — legacy removal and archive

- `backend/scripts/archive_legacy_red_team.py`: dry-run by default; guarded owner-only BSON-aware archive and exact transactional deletion under `--apply --output`.
- `backend/tests/unit/test_archive_legacy_red_team.py`: current/unknown exclusion, tenant/job scoping, archive-before-delete, active job, write, change and repeat safety.
- `backend/tests/unit/test_red_team_risk_scoring.py`: retained pure scorer coverage rebased on the Promptfoo catalog.

The inventoried in-house generators, evaluators, judge, legacy reports, schemas and their dedicated tests were removed. No apply operation was run against application data.
