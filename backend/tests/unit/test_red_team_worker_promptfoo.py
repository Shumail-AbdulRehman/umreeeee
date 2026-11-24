import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from bson import ObjectId
import pytest

from app.red_team.runner import RunEvent
from app.queue import recovery
from app.services.admin_common import utcnow
from app.services.content_service import expire_content, shorten_retention
from app.workers import red_team_worker as worker


class Result:
    matched_count = 1
    modified_count = 1


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def find_one(self, query, projection=None, **_kwargs):
        return next((row for row in self.rows if all(row.get(k) == v for k, v in query.items() if not k.startswith('$'))), None)

    def insert_one(self, document, **_kwargs):
        self.rows.append(dict(document))
        return SimpleNamespace(inserted_id=document.get('_id'))

    def update_one(self, query, update, upsert=False, **_kwargs):
        row = self.find_one(query)
        if row is None and upsert:
            row = {key: value for key, value in query.items() if not key.startswith('$')}
            self.rows.append(row)
        if row is not None:
            row.update(update.get('$set', {}))
        return Result()

    def update_many(self, _query, _update, **_kwargs):
        return Result()


class DB:
    def __init__(self, company, test):
        self.companies = Collection([company])
        self.red_team_tests = Collection([test])
        self.red_team_attacks = Collection()
        self.red_team_suites = Collection()


def envelope(run_id):
    def row(index, protected_id):
        return {
            'testIdx': index, 'repeatIndex': 0, 'metadata': {
                'pluginId': 'prompt-extraction', 'strategyId': 'basic', 'severity': 'medium',
            },
            'prompt': {'raw': f'attack {index}'},
            'response': {'output': f'reply {index}', 'metadata': {
                'decision': 'blocked_input', 'protected_run_id': protected_id,
                'policy_evidence': [{'field': 'prompt', 'outcome': 'match', 'rule_id': 'r'}],
            }, 'tokenUsage': {'prompt': 1, 'completion': 2, 'total': 3}},
            'gradingResult': {'pass': False, 'reason': 'unsafe'}, 'score': 0,
            'testCase': {'assert': [{'type': 'promptfoo:redteam', 'metric': 'Promptfoo'}]},
        }
    return json.dumps({'results': {'results': [row(0, run_id), row(1, str(ObjectId()))],
        'stats': {'successes': 0, 'failures': 2, 'errors': 0},
        'prompts': [{'metrics': {'totalLatencyMs': 20}}]}})


def test_import_encrypts_content_and_refuses_unissued_policy_id(tmp_path, monkeypatch):
    company_id, test_id = ObjectId(), ObjectId()
    test = {'_id': test_id, 'company_id': company_id}
    db = DB({'_id': company_id, 'settings': {'content_retention_days': 7}}, test)
    run_id = str(ObjectId())
    results = tmp_path / 'results.json'
    results.write_text(envelope(run_id))
    monkeypatch.setattr(worker, 'encrypt', lambda value: f'cipher:{value}')
    errors = worker._import_results(db, test, results, {run_id})
    assert errors == 0
    first, second = db.red_team_attacks.rows
    assert first['verdict_source'] == 'policy' and first['verdict'] == 'pass'
    assert second['verdict_source'] == 'grader' and second['verdict'] == 'fail'
    assert first['prompt_ciphertext'] == 'cipher:attack 0'
    assert first['response_ciphertext'] == 'cipher:reply 0'
    assert test['counts.graded'] == 2
    assert test['stats']['failures'] == 2


def test_suite_is_stored_once_with_zero_plugin_counts():
    company_id, test_id, actor_id = ObjectId(), ObjectId(), ObjectId()
    test = {'_id': test_id, 'company_id': company_id, 'created_by': actor_id,
            'plugins': ['prompt-extraction', 'pii:direct'], 'comparison_group_id': ObjectId(),
            'config_snapshot': {'config_hash': 'hash'}, 'counts': {}}
    db = DB({'_id': company_id}, test)
    db.client = MagicMock()
    db.red_team_jobs = MagicMock()
    db.red_team_jobs.update_one.return_value.matched_count = 1
    session = db.client.start_session.return_value.__enter__.return_value
    session.with_transaction.side_effect = lambda callback: callback(session)
    suite = {'tests': [{'metadata': {'pluginId': 'prompt-extraction', 'strategyId': 'basic'}}],
             'redteam': {}, 'defaultTest': {'metadata': {}}, 'metadata': {}}
    stored = worker._store_suite(db, test, {'_id': ObjectId()}, 'lease',
                                 RunEvent('suite_ready', suite=suite, test_count=1))
    assert stored['test_id'] == test_id and stored['promptfoo_version'] == worker.PROMPTFOO_VERSION
    assert stored['by_plugin'] == {'prompt-extraction': 1, 'pii:direct': 0}
    assert stored['by_strategy'] == {'basic': 1}
    assert test['suite_id'] == stored['_id']
    assert test['counts.planned'] == 1
    assert db.red_team_jobs.update_one.call_args.kwargs['session'] is session


def test_oversized_suite_is_refused_before_any_write(monkeypatch):
    monkeypatch.setattr(worker, '_SUITE_LIMIT', 32)
    db = MagicMock()
    with pytest.raises(worker.CredentialUnavailable) as problem:
        worker._store_suite(db, {}, {}, 'lease', RunEvent(
            'suite_ready', suite={'tests': [{'vars': {'prompt': 'fixture' * 10}}]}, test_count=1,
        ))
    assert problem.value.code == 'promptfoo_failed'
    db.client.start_session.assert_not_called()


def test_worker_flushes_progress_at_completion_even_inside_throttle_window(monkeypatch):
    db = MagicMock()
    test_id, company_id, integration_id, job_id = (ObjectId() for _ in range(4))
    test = {'_id': test_id, 'company_id': company_id, 'mode': 'raw',
            'integration_id': integration_id, 'grader': {'integration_id': integration_id}}
    job = {'_id': job_id, 'test_id': test_id, 'company_id': company_id,
           'kind': 'run', 'execution_lease_token': 'lease'}
    db.red_team_tests.find_one.return_value = test
    db.red_team_jobs.find_one.return_value = job
    for name, result in {'_claim': job, '_authority': (True, True, None, True, True),
                         '_cancelled': False, '_credential': 'fake-key', 'build_redteam_config': {},
                         '_set_phase': None, '_import_results': 0, '_finalize': True}.items():
        monkeypatch.setattr(worker, name, MagicMock(return_value=result))
    monkeypatch.setattr(worker.time, 'monotonic', lambda: 10)
    runner = SimpleNamespace(events=lambda: iter([
        RunEvent('progress', executed=1), RunEvent('progress', executed=4),
        RunEvent('finished', status='completed'),
    ]))
    bridge = MagicMock()
    assert worker.process_job(db, job_id, test_id, 1, provider_service=object(),
                              runner_factory=lambda **_: runner, bridge_factory=bridge) == 'completed'
    bridge.assert_not_called()
    assert [call.args[1]['$max']['counts.executed']
            for call in db.red_team_tests.update_one.call_args_list] == [1, 4]


@pytest.mark.parametrize('phase', ['claimed', 'logging_in', 'generating', 'evaluating', 'importing'])
def test_recovery_finishes_any_interrupted_run_with_a_suite(phase):
    db = MagicMock()
    test_id, company_id, job_id = (ObjectId() for _ in range(3))
    job = {'_id': job_id, 'test_id': test_id, 'company_id': company_id, 'phase': phase}
    db.red_team_jobs.update_many.return_value.modified_count = 0
    db.red_team_jobs.find.return_value = [job]
    db.red_team_jobs.find_one_and_update.return_value = job
    db.red_team_jobs.update_one.return_value.matched_count = 1
    db.red_team_tests.find_one.return_value = {'_id': test_id, 'company_id': company_id, 'suite_id': ObjectId()}
    db.red_team_tests.find.return_value = []
    assert recovery.recover(db)['interrupted_failed'] == 1
    assert db.red_team_tests.update_one.call_args.args[1]['$set']['failure_reason'] == 'interrupted'
    db.red_team_attacks.delete_many.assert_not_called()


def test_retention_shortens_and_expires_promptfoo_case_content():
    db = MagicMock()
    company_id, session, cutoff = ObjectId(), object(), utcnow()
    db.prompt_runs.update_many.return_value.modified_count = 1
    db.red_team_jobs.update_many.return_value.modified_count = 2
    db.red_team_attacks.update_many.return_value.modified_count = 3
    shorten_retention(db, company_id, 1, session=session)
    query, update = db.red_team_attacks.update_many.call_args.args
    assert query['company_id'] == company_id
    assert update[0]['$set']['content_expires_at']['$min'] == [
        '$content_expires_at', {'$add': ['$created_at', 86_400_000]},
    ]
    assert db.red_team_attacks.update_many.call_args.kwargs['session'] is session
    assert expire_content(db, cutoff) == 6
    query, update = db.red_team_attacks.update_many.call_args.args
    assert query['content_expires_at'] == {'$lte': cutoff}
    assert update['$unset'] == {'prompt_ciphertext': '', 'response_ciphertext': ''}
    assert update['$set'] == {'content_expired': True}


def test_missing_grader_key_has_specific_safe_error(monkeypatch):
    class MissingRepository:
        def __init__(self, *_args):
            pass

        def find_by_id(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(worker, 'LLMIntegrationRepository', MissingRepository)
    with pytest.raises(worker.CredentialUnavailable) as problem:
        worker._credential(SimpleNamespace(), ObjectId(), ObjectId(), 'grader_key_unavailable')
    assert problem.value.code == 'grader_key_unavailable'


def test_message_validation_and_non_run_jobs_are_refused():
    job_id, test_id = ObjectId(), ObjectId()
    message = worker._valid_message(json.dumps({
        'v': 1, 'job_id': str(job_id), 'test_id': str(test_id), 'generation': 1,
    }))
    assert message['generation'] == 1
    with pytest.raises(ValueError):
        worker._valid_message(json.dumps({**message, 'generation': 0}))
    db = SimpleNamespace(red_team_jobs=Collection([{'_id': job_id, 'test_id': test_id, 'kind': 'case'}]))
    assert worker.process_job(db, str(job_id), str(test_id), 1) == 'noop'
