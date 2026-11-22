from datetime import timedelta
import base64
from bson import ObjectId

from app.services.admin_common import utcnow
from app.services.content_service import encrypt
from app.services import red_team_queries_v3 as queries


def test_queries_counts_pairing_retention_and_export(test_database):
    db = test_database
    test = {'_id': ObjectId(), 'company_id': ObjectId(), 'format': 'plugins', 'status': 'completed',
            'comparison_group_id': ObjectId(), 'manifest_hash': 'same', 'mode': 'raw',
            'integration_id': ObjectId(), 'model': 'fake', 'plugins': ['pii'],
            'strategies': ['basic'], 'num_attacks': 4, 'control_count': 1,
            'finished_at': utcnow(), 'threshold_score': .8}
    db.red_team_tests.insert_one(test)
    jobs = []
    for index, verdict in enumerate(['fail', 'pass', 'inconclusive', 'error', 'pass']):
        jobs.append({'_id': ObjectId(), **queries.scope(test), 'attack_index': index,
                     'case_kind': 'control' if index == 4 else 'adversarial', 'plugin_id': 'pii',
                     'strategy_id': 'basic', 'severity': 'high', 'state': 'finished', 'verdict': verdict,
                     'verdict_source': 'exact', 'prompt': '=synthetic', 'original_prompt': '=synthetic',
                     'response_ciphertext': encrypt(base64.b64encode(b'SYNTH-PRIVATE-1234').decode()),
                     'content_expires_at': utcnow() + timedelta(days=1)})
    jobs[1]['response_withheld'] = True
    jobs[2]['content_expires_at'] = utcnow() - timedelta(days=1)
    db.red_team_jobs.insert_many(jobs)
    result = queries.results(db, test, 1, 2, {'verdict': 'fail'})
    assert result['total'] == 1
    assert result['counts'] == {'all': 5, 'unsafe': 1, 'defended': 1, 'inconclusive': 1, 'errors': 1, 'controls': 1}
    assert queries.results(db, test, filters={'plugin': 'unknown'})['total'] == 0
    assert queries.result_detail(db, test, jobs[0])['result']['decoded_response'] == 'SYNTH-PRIVATE-1234'
    for job in jobs[1:3]:
        detail = queries.result_detail(db, test, job)['result']
        assert detail['response_text'] is None and 'decoded_response' not in detail
    for overrides in [{'company_id': ObjectId()}, {'manifest_hash': 'different'},
                      {'comparison_group_id': ObjectId()}, {'status': 'running'}]:
        db.red_team_tests.insert_one({**test, '_id': ObjectId(), 'mode': 'protected', **overrides})
    assert queries.paired_test(db, test) is None
    paired = {**test, '_id': ObjectId(), 'mode': 'protected'}
    db.red_team_tests.insert_one(paired)
    db.red_team_jobs.insert_one({**jobs[0], '_id': ObjectId(), 'test_id': paired['_id'], 'verdict': 'pass',
                                'verdict_source': 'policy', 'prevention_stage': 'input_policy'})
    assert queries.result_detail(db, test, jobs[0])['result']['paired']['verdict_source'] == 'policy'
    previous = {**test, '_id': ObjectId(), 'strategies': [], 'finished_at': test['finished_at'] - timedelta(days=1)}
    db.red_team_tests.insert_one(previous)
    report = queries.report(db, test)
    assert report['paired']['test_id'] == str(paired['_id'])
    assert report['trend']['test_id'] == str(previous['_id'])
    assert report['attack_success']['rate'] == .5
    rows = queries.export_rows(db, test, csv=True)
    assert rows[0]['prompt'] == "'=synthetic"
    assert all(key in rows[0] for key in queries.CSV_COLUMNS)
    assert rows[1]['response_text'] == rows[2]['response_text'] == ''
    assert 'scenario_system' not in queries.export_rows(db, test)[0]
