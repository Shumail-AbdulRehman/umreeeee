"""Worker acceptance against an explicit isolated MongoDB replica set."""

from datetime import timedelta
import json

from bson import ObjectId

from app.queue.recovery import recover
from app.services.admin_common import utcnow
from app.services.content_service import decrypt
from app.workers import red_team_worker


def test_raw_and_protected_clone_use_one_encrypted_reusable_suite(promptfoo_pipeline):
    pipeline = promptfoo_pipeline
    raw, clone, raw_status, clone_status = pipeline.run_pair()

    clone_job = pipeline.db.red_team_jobs.find_one({'test_id': clone['_id']})
    diagnostic = {
        'error_code': clone_job.get('error_code'),
        'output_tail': clone_job.get('output_tail'),
        'commands': [entry['argv'] for entry in pipeline.trace()],
    }
    assert raw_status == 'completed'
    assert clone_status == 'completed', diagnostic
    assert raw['status'] == clone['status'] == 'completed'
    assert raw['suite_id'] == clone['suite_id']
    assert pipeline.db.red_team_suites.count_documents({
        'company_id': pipeline.company_id, '_id': raw['suite_id'],
    }) == 1

    suite = pipeline.db.red_team_suites.find_one({'_id': raw['suite_id']})
    serialized_suite = json.dumps(suite['suite'], default=str)
    assert suite['test_count'] == 2
    assert suite['by_plugin'] == {'pii:direct': 2}
    assert suite['by_strategy'] == {'basic': 1, 'base64': 1}
    assert 'apiKey' not in serialized_suite
    assert 'synthetic-target-key' not in serialized_suite
    assert 'synthetic-grader-key' not in serialized_suite

    raw_rows = list(pipeline.db.red_team_attacks.find({'test_id': raw['_id']}).sort('test_idx'))
    clone_rows = list(pipeline.db.red_team_attacks.find({'test_id': clone['_id']}).sort('test_idx'))
    assert len(raw_rows) == len(clone_rows) == 2
    assert {row['verdict_source'] for row in raw_rows} == {'grader'}
    assert {row['verdict_source'] for row in clone_rows} == {'policy'}
    assert {row['verdict'] for row in raw_rows + clone_rows} == {'pass'}
    for row in raw_rows + clone_rows:
        assert row['prompt_ciphertext'] != decrypt(row['prompt_ciphertext'])
        assert row['response_ciphertext'] != decrypt(row['response_ciphertext'])
        assert row['content_expires_at'] > row['created_at']

    assert pipeline.runner_calls[0]['suite'] is None
    assert pipeline.runner_calls[1]['suite'] == suite['suite']
    commands = [entry['argv'][:2] for entry in pipeline.trace()]
    assert commands.count(['redteam', 'run']) == 1
    assert commands.count(['redteam', 'eval']) == 1
    assert pipeline.provider.calls == 0

    clone_job = pipeline.db.red_team_jobs.find_one({'test_id': clone['_id'], 'kind': 'run'})
    before = pipeline.db.red_team_attacks.count_documents({'test_id': clone['_id']})
    assert red_team_worker.process_job(
        pipeline.db, str(clone_job['_id']), str(clone['_id']), clone_job['dispatch_generation'],
        provider_service=pipeline.provider, runner_factory=pipeline.runner_factory,
    ) == 'noop'
    assert pipeline.db.red_team_attacks.count_documents({'test_id': clone['_id']}) == before
    assert len(pipeline.runner_calls) == 2


def test_recovery_requeues_before_generation_and_fails_after_target_calls(promptfoo_pipeline):
    pipeline = promptfoo_pipeline
    now = utcnow()
    generating_id, evaluating_id = ObjectId(), ObjectId()
    pipeline.db.red_team_tests.insert_many([
        {
            '_id': generating_id, 'company_id': pipeline.company_id,
            'created_by': pipeline.admin_id, 'integration_id': pipeline.target_id,
            'engine': 'promptfoo', 'status': 'generating', 'suite_id': None,
            'execution_revision': 0, 'updated_at': now,
        },
        {
            '_id': evaluating_id, 'company_id': pipeline.company_id,
            'created_by': pipeline.admin_id, 'integration_id': pipeline.target_id,
            'engine': 'promptfoo', 'status': 'running', 'suite_id': ObjectId(),
            'execution_revision': 0, 'updated_at': now,
        },
    ])
    generating_job, evaluating_job = ObjectId(), ObjectId()
    pipeline.db.red_team_jobs.insert_many([
        {
            '_id': generating_job, 'company_id': pipeline.company_id, 'test_id': generating_id,
            'kind': 'run', 'state': 'running', 'phase': 'generating',
            'execution_phase': 'generating', 'execution_lease_token': 'stale-generating',
            'execution_lease_expires_at': now - timedelta(seconds=1),
            'dispatch_state': 'published', 'dispatch_generation': 1, 'created_at': now,
        },
        {
            '_id': evaluating_job, 'company_id': pipeline.company_id, 'test_id': evaluating_id,
            'kind': 'run', 'state': 'running', 'phase': 'evaluating',
            'execution_phase': 'evaluating', 'execution_lease_token': 'stale-evaluating',
            'execution_lease_expires_at': now - timedelta(seconds=1),
            'dispatch_state': 'published', 'dispatch_generation': 1, 'created_at': now,
        },
    ])
    pipeline.db.red_team_attacks.insert_one({
        'company_id': pipeline.company_id, 'test_id': evaluating_id,
        'test_idx': 0, 'repeat_index': 0, 'verdict': 'pass', 'created_at': now,
    })

    counts = recover(pipeline.db, now)

    assert counts['generating_requeued'] == 1
    assert counts['interrupted_failed'] == 1
    requeued = pipeline.db.red_team_jobs.find_one({'_id': generating_job})
    assert requeued['state'] == 'queued'
    assert requeued['dispatch_state'] == 'pending'
    assert requeued['dispatch_generation'] == 2
    assert pipeline.db.red_team_tests.find_one({'_id': generating_id})['status'] == 'queued'
    interrupted = pipeline.db.red_team_tests.find_one({'_id': evaluating_id})
    assert interrupted['status'] == 'failed'
    assert interrupted['failure_reason'] == 'interrupted'
    assert pipeline.db.red_team_attacks.count_documents({'test_id': evaluating_id}) == 1
