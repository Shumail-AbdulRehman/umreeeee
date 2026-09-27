"""Opt-in disposable Mongo benchmark with a mocked provider; prints measured JSON."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from uuid import uuid4

from bson import ObjectId
from pymongo import MongoClient

from app.db.indexes import ensure_indexes
from app.schemas.prompts import PromptRunExecuteRequest
from app.services.analytics_service import percentile
from app.services.protected_prompt_service import ProtectedPromptService
from app.services.provider_service import ProviderResult
from app.services.enforcement_service import evaluate_stage


class FakeProvider:
    def execute(self, integration, payload, request_id):
        return ProviderResult('Mock provider reply.', 20, 10, 30, 'mock', 'stop', 0.01)


def run():
    url = os.environ.get('TEST_MONGODB_URL')
    if not url:
        raise RuntimeError('Set TEST_MONGODB_URL to a disposable replica set')
    db_name = 'test_phase2_benchmark_' + uuid4().hex
    client = MongoClient(url, tz_aware=True)
    db = client[db_name]
    try:
        ensure_indexes(db)
        now = datetime.now(timezone.utc)
        org, actor, integration = ObjectId(), ObjectId(), ObjectId()
        db.companies.insert_one({'_id': org, 'name': 'Benchmark', 'slug': db_name,
            'status': 'active', 'settings': {'require_active_policy': True, 'content_retention_days': 7}})
        db.users.insert_one({'_id': actor, 'company_id': org, 'first_name': 'Benchmark',
            'last_name': 'User', 'email': 'benchmark@example.test', 'is_active': True,
            'is_email_verified': True, 'token_version': 0, 'group_ids': []})
        db.integrations.insert_one({'_id': integration, 'company_id': org, 'provider': 'ollama',
            'account_name': 'Mock', 'status': 'active', 'models': ['mock'], 'system_prompt': ''})
        db.policies.insert_one({'_id': ObjectId(), 'company_id': org, 'name': 'Fixture',
            'status': 'active', 'action': 'LOG', 'severity': 'low', 'category': 'custom',
            'version': 1, 'stages': ['input'], 'scope': {'group_ids': [], 'integration_ids': []},
            'rules': [{'rule_id': str(uuid4()), 'type': 'keyword',
                       'config': {'terms': ['never-matches'], 'match_mode': 'substring'}}]})
        user = SimpleNamespace(id=str(actor), company=SimpleNamespace(id=str(org)), group_ids=[],
            token_version=0, role='user')
        service = ProtectedPromptService(db, FakeProvider())
        payload = PromptRunExecuteRequest(integration_id=str(integration), model='mock',
            prompt='A representative prompt of roughly forty words about a project meeting and its agenda. '
                   'The text is innocuous and should pass the configured keyword rule so that both '
                   'validation and the mocked provider call appear in the measured end-to-end result.')
        report = {'machine': {'cpu_count': os.cpu_count(), 'mock_provider': True}, 'results': {}}
        for concurrency in (1, 10, 50):
            samples = []
            started = perf_counter()

            def submit(_):
                begin = perf_counter()
                result = service.execute_protected(user, payload, {'source': 'workspace',
                    'key': str(uuid4()), 'request_id': 'benchmark'})['run']
                return (perf_counter() - begin) * 1000, result['enforcement_latency_ms']

            with ThreadPoolExecutor(max_workers=concurrency) as pool:
                for future in as_completed([pool.submit(submit, i) for i in range(max(50, concurrency))]):
                    samples.append(future.result())
            elapsed = perf_counter() - started
            report['results'][concurrency] = {'requests': len(samples), 'duration_seconds': round(elapsed, 3),
                'throughput_per_second': round(len(samples) / elapsed, 3),
                'total_ms': percentile([item[0] for item in samples]),
                'enforcement_ms': percentile([item[1] for item in samples])}
            policy = db.policies.find_one({'company_id': org})
            with ThreadPoolExecutor(max_workers=concurrency) as pool:
                validator_samples = list(pool.map(lambda _: evaluate_stage([policy], 'input',
                    {'user_prompt': payload.prompt})[0]['duration_ms'], range(max(50, concurrency))))
            report['results'][concurrency]['validator_only_ms'] = percentile(validator_samples)
        return report
    finally:
        client.drop_database(db_name)
        client.close()


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
