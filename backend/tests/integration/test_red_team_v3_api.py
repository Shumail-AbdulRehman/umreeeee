"""Real Mongo transactions and HTTP routing, no broker or model traffic."""
import csv
import io
from types import SimpleNamespace
from uuid import uuid4

from bson import ObjectId
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.api.routes import red_team as routes
from app.main import app
from app.red_team.plugins import PLUGIN_IDS
from app.services.red_team_report_service import score
from tests.integration.test_red_team_flow import red_team  # noqa: F401


def test_v3_api_configuration_launch_queries_and_legacy(red_team, monkeypatch):
    db, user, legacy, service = red_team
    judge = {**db.integrations.find_one({}), '_id': ObjectId(), 'account_name_normalized': 'judge',
             'model_prices': [{'model': 'fake-model', 'input_per_million': '0', 'output_per_million': '0'}]}
    db.integrations.insert_one(judge)
    monkeypatch.setattr(routes, 'get_database', lambda: db)
    def offline(*args, **kwargs):
        raise OSError('synthetic offline broker')
    monkeypatch.setattr(routes.socket, 'create_connection', offline)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[routes.service] = lambda: service
    try:
        client = TestClient(app)
        caps = client.get('/api/red-team/capabilities').json()
        assert len(caps['plugins']) == 8 and len(caps['frameworks']) == 4
        assert len(caps['strategies']) == 8 and caps['judge_supported']
        assert all(len(p['frameworks']) == 4 for p in caps['plugins'])
        values = {'name': 'Synthetic API', 'integration_id': legacy.integration_id, 'model': legacy.model,
                  'mode': 'raw', 'plugins': list(PLUGIN_IDS), 'strategies': ['base64', 'roleplay', 'authority'],
                  'tests_per_plugin': 3, 'judge': {'integration_id': str(judge['_id']), 'model': legacy.model}}
        bad = client.post('/api/red-team/tests', json={**values, 'tests_per_plugin': 4})
        assert bad.status_code == 422 and 'tests_per_plugin' in bad.json()['detail']['field_errors']
        created = client.post('/api/red-team/tests', json=values)
        assert created.status_code == 201
        draft = created.json()['test']
        assert draft['num_attacks'] == 96 and draft['catalog_version'] == 'synthetic-catalog-3'
        path = '/api/red-team/tests/' + draft['id']
        edited = client.put(path, json={**values, 'name': 'Edited API', 'version': 1})
        assert edited.status_code == 200 and edited.json()['test']['version'] == 2
        assert client.put(path, json={**values, 'version': 1}).status_code == 409
        db.integrations.update_one({'_id': judge['_id']}, {'$set': {'status': 'disabled'}})
        assert client.post(path + '/launch', json={'version': 2}, headers={'Idempotency-Key': str(uuid4())}).status_code == 409
        assert db.red_team_jobs.count_documents({}) == 0
        db.integrations.update_one({'_id': judge['_id']}, {'$set': {'status': 'active'}})
        key = str(uuid4())
        for _ in range(2):
            response = client.post(path + '/launch', json={'version': 2}, headers={'Idempotency-Key': key})
            assert response.status_code == 202
        stored = db.red_team_tests.find_one({'_id': ObjectId(draft['id'])})
        assert stored['config_snapshot']['judge']['integration_id'] == judge['_id']
        assert len(stored['config_snapshot']['plugin_severities']) == 8
        assert db.red_team_jobs.count_documents({}) == 101
        job = db.red_team_jobs.find_one({'case_kind': 'adversarial'})
        assert job['original_prompt'] and job['strategy_id'] and job['verdict_source'] is None
        foreign_company, foreign_admin = ObjectId(), ObjectId()
        db.companies.insert_one({**db.companies.find_one({'_id': stored['company_id']}),
            '_id': foreign_company, 'slug': str(foreign_company)})
        db.users.insert_one({**db.users.find_one({'_id': ObjectId(user.id)}),
            '_id': foreign_admin, 'company_id': foreign_company, 'email': 'foreign-admin@example.test'})
        # Every HTTP entry point must reject foreign administrators and members,
        # including writes whose identifiers refer to an existing tenant's test.
        for outsider, denied in [
            (SimpleNamespace(**{**user.__dict__, 'id': str(foreign_admin),
                'company': SimpleNamespace(id=str(foreign_company))}), 404),
            (SimpleNamespace(**{**user.__dict__, 'role': 'user'}), 403),
        ]:
            app.dependency_overrides[get_current_user] = lambda: outsider
            requests = [
                ('GET', path, {}), ('GET', path + '/results', {}),
                ('GET', path + '/results/' + str(job['_id']), {}),
                ('GET', path + '/report', {}), ('GET', path + '/export', {}),
                ('GET', '/api/red-team/comparisons', {'params': {'raw_test_id': draft['id'], 'protected_test_id': draft['id']}}),
                ('PUT', path, {'json': {**values, 'version': 2}}),
                ('POST', path + '/launch', {'json': {'version': 2}, 'headers': {'Idempotency-Key': str(uuid4())}}),
                ('POST', path + '/cancel', {}), ('POST', path + '/clone', {'json': {}}),
            ]
            for method, url, kwargs in requests:
                assert client.request(method, url, **kwargs).status_code == denied
            listing = client.get('/api/red-team/tests')
            assert listing.status_code == 403 if denied == 403 else listing.json()['total'] == 0
        app.dependency_overrides[get_current_user] = lambda: user
        assert db.red_team_tests.find_one({'_id': ObjectId(draft['id'])})['status'] == 'queued'
        assert db.red_team_jobs.count_documents({}) == 101
        results = client.get(path + '/results?plugin=pii&strategy=base64').json()
        assert results['total'] == 3 and results['counts']['all'] == 101
        assert client.get(path + '/results?verdict_source=judge').json()['total'] == 0
        report = client.get(path + '/report').json()
        assert report['provisional'] and report['risk'] is None and report['compliance'] is None
        detail = client.get(path + '/results/' + str(job['_id'])).json()['result']
        assert detail['original_prompt'] == job['original_prompt']
        exported = list(csv.DictReader(io.StringIO(client.get(path + '/export?format=csv').text)))
        assert len(exported) == 101 and 'verdict_source' in exported[0] and 'plugin_id' in exported[0]
        clone = client.post(path + '/clone', json={'mode': 'protected'}).json()['test']
        assert clone['format'] == 'plugins' and clone['judge'] == values['judge']
        assert clone['comparison_group_id'] == draft['comparison_group_id']
        assert clone['manifest_hash'] == draft['manifest_hash']
        db.integrations.update_one({'_id': judge['_id']}, {'$set': {'company_id': ObjectId()}})
        foreign = client.post('/api/red-team/tests', json=values)
        assert foreign.status_code == 422 and 'judge.integration_id' in foreign.json()['detail']['field_errors']
        legacy_test = service.create(user, legacy)['test']
        service.launch(user, legacy_test['id'], 1, str(uuid4()))
        old = db.red_team_tests.find_one({'_id': ObjectId(legacy_test['id'])})
        assert service.report(user, legacy_test['id'])['score'] == score(old, service._jobs(old))
        assert service.clone(user, legacy_test['id'])['test']['format'] == 'categories'
    finally:
        app.dependency_overrides.clear()
