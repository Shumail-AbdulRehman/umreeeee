import os
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from bson import ObjectId
from pymongo import MongoClient

from app.core.encryption import encrypt_credential
from app.core.config import MONGODB_DB_NAME
from app.db.indexes import ensure_indexes
from app.red_team.runner import PromptfooRun
from app.schemas.red_team import TestConfig
from app.services.provider_service import ProviderResult
from app.services.red_team_service import RedTeamService
from app.workers import red_team_worker


@pytest.fixture
def test_database():
    url = os.getenv('TEST_MONGODB_URL')
    base_name = os.getenv('TEST_MONGODB_DB_NAME', '')
    if not url:
        pytest.skip('TEST_MONGODB_URL not configured')
    if not base_name.startswith('test_') or base_name == MONGODB_DB_NAME:
        pytest.fail('TEST_MONGODB_DB_NAME must start with test_ and differ from the app database')
    name = f'{base_name[:20]}_{uuid4().hex[:12]}'
    client = MongoClient(url, tz_aware=True, serverSelectionTimeoutMS=2000)
    database = client[name]
    client.admin.command('ping')
    with client.start_session() as session:
        with session.start_transaction():
            database.companies.find_one({}, session=session)
    yield database
    client.drop_database(name)
    client.close()


class _ProtectedProvider:
    def __init__(self):
        self.calls = 0

    def execute(self, _integration, _payload, _request_id):
        self.calls += 1
        return ProviderResult('Synthetic protected reply', 4, 5, 9, 'fake-provider-id', 'stop', 2)


class PromptfooPipeline:
    def __init__(self, db, tmp_path):
        self.db = db
        self.tmp_path = tmp_path
        self.company_id = ObjectId()
        self.admin_id = ObjectId()
        self.target_id = ObjectId()
        self.grader_id = ObjectId()
        self.provider = _ProtectedProvider()
        self.runner_calls = []
        self.trace_path = tmp_path / 'promptfoo-trace.jsonl'
        self.binary = Path(__file__).resolve().parents[1] / 'fixtures' / 'fake_promptfoo.py'
        self._seed()

    def _seed(self):
        ensure_indexes(self.db)
        now = datetime.now(timezone.utc)
        self.db.companies.insert_one({
            '_id': self.company_id, 'name': 'Promptfoo pipeline', 'slug': str(self.company_id),
            'status': 'active', 'administration_revision': 0, 'version': 1,
            'settings': {'require_active_policy': True, 'content_retention_days': 7},
            'created_at': now,
        })
        self.db.users.insert_one({
            '_id': self.admin_id, 'company_id': self.company_id,
            'first_name': 'Pipeline', 'last_name': 'Admin', 'email': 'pipeline@example.test',
            'role': 'org_admin', 'is_active': True, 'is_email_verified': True,
            'token_version': 0, 'group_ids': [],
        })
        for integration_id, name, model in (
            (self.target_id, 'Synthetic target', 'target-model'),
            (self.grader_id, 'Synthetic grader', 'grader-model'),
        ):
            key = f'{name.casefold().replace(" ", "-")}-key'
            self.db.integrations.insert_one({
                '_id': integration_id, 'company_id': self.company_id, 'provider': 'ollama',
                'account_name': name, 'account_name_normalized': name.casefold(),
                'status': 'active', 'version': 1, 'models': [model],
                'system_prompt': 'Synthetic test instruction.',
                'base_url': 'http://127.0.0.1:11434', 'model_prices': [],
                'api_key_ciphertext': encrypt_credential(key), 'api_key_key_id': 'v1',
                'api_key_suffix': key[-4:], 'created_at': now, 'updated_at': now,
            })
        self.db.policies.insert_one({
            '_id': ObjectId(), 'company_id': self.company_id, 'name': 'Synthetic attack block',
            'name_normalized': 'synthetic attack block', 'category': 'custom',
            'severity': 'high', 'action': 'BLOCK', 'status': 'active', 'stages': ['input'],
            'scope': {'group_ids': [], 'integration_ids': [self.target_id]}, 'version': 1,
            'rules': [{
                'rule_id': str(uuid4()), 'type': 'keyword',
                'config': {'terms': ['Synthetic']},
            }],
        })
        self.user = SimpleNamespace(
            id=str(self.admin_id), first_name='Pipeline', last_name='Admin',
            email='pipeline@example.test', role='org_admin', group_ids=[], token_version=0,
            company=SimpleNamespace(id=str(self.company_id)),
        )
        self.service = RedTeamService(self.db, runtime_check=lambda: {
            'available': True, 'cloud_key_configured': True, 'version': '0.126.0',
        })

    def config(self):
        return TestConfig(
            name='Synthetic Promptfoo pipeline',
            purpose='Exercise synthetic attacks without making any external provider request.',
            integration_id=str(self.target_id), model='target-model', mode='raw',
            subject_user_id=None, plugins=['pii:direct'], strategies=['base64'],
            tests_per_plugin=1,
            grader={'integration_id': str(self.grader_id), 'model': 'grader-model'},
            threshold_score=.8,
        )

    def runner_factory(self, **kwargs):
        self.runner_calls.append({
            'suite': kwargs.get('suite'),
            'config': kwargs['config'],
        })
        kwargs['binary'] = self.binary
        kwargs['keep_workspace'] = False
        kwargs['env']['FAKE_PROMPTFOO_TRACE'] = str(self.trace_path)
        return PromptfooRun(**kwargs)

    def _run(self, test_id):
        job = self.db.red_team_jobs.find_one({
            'company_id': self.company_id, 'test_id': ObjectId(test_id), 'kind': 'run',
        })
        return red_team_worker.process_job(
            self.db, str(job['_id']), test_id, job['dispatch_generation'],
            provider_service=self.provider, runner_factory=self.runner_factory,
        )

    def run_pair(self):
        raw = self.service.create(self.user, self.config())['test']
        self.service.launch(self.user, raw['id'], raw['version'], str(uuid4()))
        raw_status = self._run(raw['id'])

        clone = self.service.clone(self.user, raw['id'], mode='protected')['test']
        self.service.launch(self.user, clone['id'], clone['version'], str(uuid4()))
        clone_status = self._run(clone['id'])
        return (
            self.db.red_team_tests.find_one({'_id': ObjectId(raw['id'])}),
            self.db.red_team_tests.find_one({'_id': ObjectId(clone['id'])}),
            raw_status,
            clone_status,
        )

    def trace(self):
        return [json.loads(line) for line in self.trace_path.read_text(encoding='utf-8').splitlines()]


@pytest.fixture
def promptfoo_pipeline(test_database, tmp_path, monkeypatch):
    pipeline = PromptfooPipeline(test_database, tmp_path)
    workspace = tmp_path / 'workspaces'
    monkeypatch.setattr(red_team_worker, 'PROMPTFOO_API_KEY', 'synthetic-cloud-key')
    monkeypatch.setattr(red_team_worker, 'PROMPTFOO_CLOUD_HOST', 'https://promptfoo.invalid')
    monkeypatch.setattr(red_team_worker, 'PROMPTFOO_WORKSPACE_ROOT', str(workspace))
    return pipeline
