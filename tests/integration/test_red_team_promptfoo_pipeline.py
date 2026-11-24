"""Complete fake-binary Promptfoo pipeline through Mongo and the real bridge."""

import json
from datetime import timedelta

from app.services.content_service import decrypt, expire_content, shorten_retention


def test_promptfoo_pipeline_is_network_free_retained_and_paired(promptfoo_pipeline):
    pipeline = promptfoo_pipeline
    raw, clone, raw_status, clone_status = pipeline.run_pair()

    assert (raw_status, clone_status) == ('completed', 'completed')
    suite = pipeline.db.red_team_suites.find_one({'_id': raw['suite_id']})
    assert suite is not None and clone['suite_id'] == suite['_id']
    assert suite['test_id'] == raw['_id'] and suite['promptfoo_version'] == raw['promptfoo_version']
    assert len(pipeline.runner_calls) == 2
    assert pipeline.runner_calls[0]['suite'] is None
    assert pipeline.runner_calls[1]['suite'] == suite['suite']
    assert 'apiKey' not in json.dumps(suite['suite'])

    raw_rows = list(pipeline.db.red_team_attacks.find({'test_id': raw['_id']}))
    clone_rows = list(pipeline.db.red_team_attacks.find({'test_id': clone['_id']}))
    assert len(raw_rows) == len(clone_rows) == suite['test_count'] == 2
    assert all(row['prompt_ciphertext'] != decrypt(row['prompt_ciphertext']) for row in raw_rows + clone_rows)
    assert all(row['response_ciphertext'] != decrypt(row['response_ciphertext']) for row in raw_rows + clone_rows)
    assert all(row['content_expires_at'] > row['created_at'] for row in raw_rows + clone_rows)

    raw_report = pipeline.service.report(pipeline.user, str(raw['_id']))
    clone_report = pipeline.service.report(pipeline.user, str(clone['_id']))
    assert raw_report['paired']['test_id'] == str(clone['_id'])
    assert clone_report['paired']['test_id'] == str(raw['_id'])
    assert raw_report['paired']['matched'] == clone_report['paired']['matched'] == 2
    assert raw_report['decided']['grader'] == 2
    assert clone_report['decided']['policy'] == 2

    commands = [record['argv'][:2] for record in pipeline.trace()]
    assert commands == [
        ['auth', 'login'], ['redteam', 'run'],
        ['auth', 'login'], ['redteam', 'eval'],
    ]
    assert pipeline.provider.calls == 0

    shorten_retention(pipeline.db, raw['company_id'], 1)
    assert expire_content(pipeline.db, clone_rows[-1]['created_at'] + timedelta(days=2)) >= 4
    for row in pipeline.db.red_team_attacks.find({'company_id': raw['company_id']}):
        assert row['content_expired'] and row['verdict'] == 'pass'
        assert 'prompt_ciphertext' not in row and 'response_ciphertext' not in row
