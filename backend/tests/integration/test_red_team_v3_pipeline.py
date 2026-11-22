"""Launch → outbox → worker → judge → read/export, with no network models/broker."""
import csv
import io
import json
from uuid import uuid4
from bson import ObjectId

from app.queue.dispatcher import dispatch_once
from app.schemas.red_team import TestConfig as Config
from tests.integration.test_red_team_flow import red_team  # noqa: F401
from tests.integration.test_red_team_v3_worker import FakeProvider, EPOCH
from app.workers.red_team_worker import process_job
from app.services.provider_service import ProviderError


def test_v3_pipeline_dispatch_grade_judge_report_and_exports(red_team):
    db, user, legacy, service = red_team
    judge_id = ObjectId()
    target = db.integrations.find_one({})
    db.integrations.insert_one({**target, '_id': judge_id, 'account_name_normalized': 'synthetic-judge', 'models': ['judge-model']})
    config = Config(name='Synthetic pipeline', integration_id=legacy.integration_id, model=legacy.model,
        mode='raw', plugins=['prompt-extraction'], strategies=['base64'], tests_per_plugin=1,
        judge={'integration_id': str(judge_id), 'model': 'judge-model'})
    draft = service.create(user, config)['test']
    service.launch(user, draft['id'], 1, str(uuid4()))
    class Publisher:
        messages = []
        def publish(self, message):
            assert set(message) == {'v', 'job_id', 'test_id', 'generation'}
            self.messages.append(message)
    broker = Publisher()
    def target_reply(job):
        if job['case_kind'] == 'control':
            return job['control_answer']
        if job['strategy_id'] == 'basic' and job['attempt_number'] == 1:
            raise ProviderError('rate_limited', retry_after=1)
        return job['failure_marker'] if job['strategy_id'] == 'basic' else 'ordinary synthetic reply'
    fake = FakeProvider(db, target=target_reply)
    for _ in range(8):
        db.red_team_jobs.update_many({'state': 'retry_wait'}, {'$set': {'next_attempt_at': EPOCH}})
        db.integration_execution_locks.update_many({}, {'$set': {'next_allowed_at': EPOCH}})
        assert dispatch_once(db, broker)
        message = broker.messages[-1]
        process_job(db, message['job_id'], message['test_id'], message['generation'], fake)
        assert process_job(db, message['job_id'], message['test_id'], message['generation'], fake) == 'noop'
    assert not dispatch_once(db, broker)
    assert fake.target_calls == 8 and fake.judge_calls == 1
    report = service.report(user, draft['id'])
    assert report['test']['status'] == 'completed' and not report['provisional']
    assert report['risk']['score'] > 0 and len(report['compliance']) == 4
    assert report['threshold']['verdict'] == 'below_threshold'
    assert report['attack_success'] == {'rate': 1.0, 'worked': 2, 'decided': 2, 'proven': 1, 'judged': 1}
    assert report['controls']['answered'] == 5
    assert db.notifications.count_documents({'kind': 'red_team_threshold'}) == 1
    results = service.results(user, draft['id'])
    assert results['counts']['all'] == 7 and results['counts']['unsafe'] == 2
    assert {r['verdict_source'] for r in results['items']} == {'exact', 'judge'}
    assert service.detail(user, draft['id'])['test']['model_calls'] == 8
    assert service.detail(user, draft['id'])['test']['judge_calls'] == 1
    json_body, _ = service.export(user, draft['id'], 'json')
    assert len(json.loads(json_body)['results']) == 7
    csv_body, _ = service.export(user, draft['id'], 'csv')
    rows = list(csv.DictReader(io.StringIO(csv_body)))
    assert len(rows) == 7 and {'plugin_id', 'strategy_id', 'verdict_source', 'judge_reason'} <= set(rows[0])
    # A real cancelled report must agree with the approved cancelled-state banner.
    clone = service.clone(user, draft['id'])['test']
    service.launch(user, clone['id'], 1, str(uuid4()))
    service.cancel(user, clone['id'])
    cancelled = service.report(user, clone['id'])
    assert cancelled['risk'] is None and cancelled['compliance'] is None
    assert cancelled['threshold']['verdict'] == 'insufficient_evidence'
