"""Tenant-scoped red-team configuration and durable launch; no provider calls here."""
from hashlib import sha256
import csv
import io
import json
import re
from time import sleep
from uuid import UUID

from bson import ObjectId
from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from app.core.errors import DomainError, object_id
from app.core.permissions import ADMIN_ROLES, require_admin
from app.db.mongo import get_database
from app.red_team.catalog_schema import CATALOG_VERSION, EVALUATOR_VERSION, manifest, manifest_hash, CATEGORIES
from app.services.admin_common import audit, serialize, utcnow
from app.services.enforcement_service import resolve_policies
from app.services.remote_detection import catalog_ready
from app.services.red_team_report_service import progress, score
from app.validators.registry import registry


def test_read(doc, *, detail=False):
    item = serialize(doc)
    item['id'] = item.pop('_id')
    item.pop('manifest', None)
    if not detail:
        item.pop('config_snapshot', None)
    return item


def job_read(doc, *, detail=False):
    keys = ['_id', 'test_id', 'attack_index', 'attack_id', 'category', 'case_kind', 'state', 'verdict',
            'verdict_reason_code', 'explanation', 'prevention_stage', 'response_length',
            'response_withheld', 'attempt_number', 'error_code', 'created_at', 'started_at', 'finished_at',
            'provider_latency_ms', 'total_tokens', 'estimated_cost_usd', 'cost_status', 'cost_source', 'pricing_snapshot', 'prompt_tokens',
            'completion_tokens', 'provider_request_id', 'possible_cost', 'protected_run_id']
    if detail:
        keys += ['prompt', 'scenario_system', 'description', 'attempt_history', 'content_expires_at']
    item = serialize({key: doc.get(key) for key in keys})
    item['id'] = item.pop('_id')
    if detail:
        expired = doc.get('content_expires_at') and doc['content_expires_at'] <= utcnow()
        item['content_expired'] = bool(expired or doc.get('content_expired'))
        if not item['content_expired'] and not doc.get('response_withheld') and doc.get('response_ciphertext'):
            from app.services.content_service import decrypt
            item['response_text'] = decrypt(doc['response_ciphertext'])
        else:
            item['response_text'] = None
    return item


class RedTeamService:
    def __init__(self, db=None):
        self.db = db if db is not None else get_database()

    @staticmethod
    def _tenant(user):
        require_admin(user)
        return object_id(user.company.id)

    def _find(self, user, test_id, session=None):
        row = self.db.red_team_tests.find_one({'_id': object_id(test_id),
            'company_id': self._tenant(user)}, session=session)
        if not row:
            raise DomainError(404, 'not_found', 'Test not found')
        return row

    def _transaction(self, user, operation):
        for attempt in range(6):
            try:
                with self.db.client.start_session() as session:
                    with session.start_transaction():
                        updated = self.db.companies.update_one({'_id': self._tenant(user),
                            'status': 'active'}, {'$inc': {'administration_revision': 1}}, session=session)
                        if updated.matched_count != 1:
                            raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
                        return operation(self.db, session)
            except PyMongoError as exc:
                if attempt == 5 or not exc.has_error_label('TransientTransactionError'):
                    raise
                sleep(min(0.02 * (2 ** attempt), 0.3))

    def _validate_config(self, user, payload, session=None):
        company = self._tenant(user)
        target = self.db.integrations.find_one({'_id': object_id(payload.integration_id),
            'company_id': company, 'status': 'active'}, session=session)
        if not target or payload.model not in target.get('models', []):
            raise DomainError(422, 'invalid_target', 'Choose an active integration and model')
        subject_id = object_id(payload.subject_user_id or user.id)
        subject = self.db.users.find_one({'_id': subject_id, 'company_id': company,
            'is_active': True, 'is_email_verified': True}, session=session)
        if not subject:
            raise DomainError(422, 'invalid_subject', 'Choose an active user in this organization')
        try:
            rows = manifest(payload.attack_categories, payload.num_attacks, payload.seed)
        except ValueError as exc:
            raise DomainError(422, 'invalid_manifest', str(exc)) from exc
        return target, subject, rows

    def create(self, user, payload, request_id='', comparison_group_id=None):
        target, subject, rows = self._validate_config(user, payload)
        now = utcnow()
        data = payload.model_dump()
        data['subject_user_id'] = subject['_id']
        data['integration_id'] = target['_id']
        data.update({'company_id': self._tenant(user), 'created_by': object_id(user.id),
            'control_count': 5, 'minimum_evaluable_fraction': .8,
            'catalog_version': CATALOG_VERSION, 'evaluator_version': EVALUATOR_VERSION,
            'manifest': rows, 'manifest_hash': manifest_hash(rows), 'status': 'draft',
            'version': 1, 'execution_revision': 0, 'comparison_group_id': comparison_group_id or ObjectId(),
            'created_at': now, 'updated_at': now})

        def operation(db, session):
            db.red_team_tests.insert_one(data, session=session)
            audit(db, session, user, 'red_team.created', 'red_team_test', data['_id'], request_id)
            return {'test': test_read(data, detail=True)}
        return self._transaction(user, operation)

    def edit(self, user, test_id, payload, request_id=''):
        def operation(db, session):
            old = self._find(user, test_id, session)
            if old['status'] != 'draft':
                raise DomainError(409, 'not_draft', 'Only draft tests can be edited')
            if old['version'] != payload.version:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            target, subject, rows = self._validate_config(user, payload, session)
            data = payload.model_dump(exclude={'version'})
            data.update({'integration_id': target['_id'], 'subject_user_id': subject['_id'],
                'manifest': rows, 'manifest_hash': manifest_hash(rows), 'updated_at': utcnow()})
            result = db.red_team_tests.update_one({'_id': old['_id'], 'company_id': old['company_id'],
                'status': 'draft', 'version': payload.version}, {'$set': data, '$inc': {'version': 1}}, session=session)
            if result.matched_count != 1:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            audit(db, session, user, 'red_team.edited', 'red_team_test', old['_id'], request_id)
            return {'test': test_read(db.red_team_tests.find_one({'_id': old['_id']}, session=session), detail=True)}
        return self._transaction(user, operation)

    def list(self, user, page=1, page_size=20, q=None, status=None, mode=None, integration_id=None,
             start=None, end=None):
        query = {'company_id': self._tenant(user)}
        if q:
            query['name'] = {'$regex': re.escape(q[:120]), '$options': 'i'}
        if status:
            query['status'] = status
        if mode:
            query['mode'] = mode
        if integration_id:
            query['integration_id'] = object_id(integration_id)
        if start or end:
            if any(value.tzinfo is None for value in (start, end) if value) or (start and end and start >= end):
                raise DomainError(422, 'invalid_date', 'Use a timezone-aware valid interval')
            query['created_at'] = {}
            if start:
                query['created_at']['$gte'] = start
            if end:
                query['created_at']['$lt'] = end
        rows = list(self.db.red_team_tests.find(query).sort([('created_at', DESCENDING),
            ('_id', DESCENDING)]).skip((page - 1) * page_size).limit(page_size))
        return {'items': [self._with_progress(row) for row in rows], 'page': page,
                'page_size': page_size, 'total': self.db.red_team_tests.count_documents(query)}

    def _jobs(self, test):
        return list(self.db.red_team_jobs.find({'company_id': test['company_id'], 'test_id': test['_id']}))

    def _with_progress(self, test, detail=False):
        jobs = self._jobs(test) if test['status'] != 'draft' else []
        return {**test_read(test, detail=detail), 'progress': progress(jobs, test),
                'score': score(test, jobs), 'dispatch_pending': any(
                    job.get('dispatch_state') != 'published' and job['state'] not in {'finished', 'cancelled'}
                    for job in jobs)}

    def detail(self, user, test_id):
        return {'test': self._with_progress(self._find(user, test_id), detail=True)}

    def launch(self, user, test_id, version, key, request_id=''):
        try:
            UUID(key)
        except (ValueError, TypeError) as exc:
            raise DomainError(422, 'invalid_idempotency_key', 'Idempotency-Key must be a UUID') from exc
        fingerprint = sha256(f'{test_id}:{version}'.encode()).hexdigest()

        def operation(db, session):
            test = self._find(user, test_id, session)
            if test['status'] != 'draft':
                if test.get('launch_key') == key and test.get('launch_fingerprint') == fingerprint:
                    return
                raise DomainError(409, 'already_launched', 'Clone this test to run it again')
            if test['version'] != version:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            actor = db.users.find_one({'_id': object_id(user.id), 'company_id': test['company_id'],
                'role': {'$in': list(ADMIN_ROLES)}, 'is_active': True, 'is_email_verified': True}, session=session)
            company = db.companies.find_one({'_id': test['company_id'], 'status': 'active'}, session=session)
            target = db.integrations.find_one({'_id': test['integration_id'], 'company_id': test['company_id'],
                'status': 'active'}, session=session)
            subject = db.users.find_one({'_id': test['subject_user_id'], 'company_id': test['company_id'],
                'is_active': True, 'is_email_verified': True}, session=session)
            if not actor or not company or not target or not subject or test['model'] not in target.get('models', []):
                raise DomainError(409, 'configuration_unavailable', 'Target or test authority is unavailable')
            groups = list(db.groups.find({'_id': {'$in': subject.get('group_ids', [])},
                'company_id': test['company_id'], 'status': 'active'}, {'_id': 1}, session=session))
            group_ids = [row['_id'] for row in groups]
            policies = resolve_policies(db, str(test['company_id']), str(test['integration_id']), group_ids,
                session=session) if test['mode'] == 'protected' else []
            if test['mode'] == 'protected':
                if company.get('settings', {}).get('require_active_policy', True) and not any(
                        'input' in p.get('stages', []) for p in policies):
                    raise DomainError(409, 'policy_required', 'No applicable input policy is active')
                missing = sorted({rule['type'] for p in policies for rule in p['rules']
                    if not registry.capabilities().get(rule['type'], {}).get('ready') or
                    (rule['type'] == 'catalog' and not catalog_ready(p))})
                if missing:
                    raise DomainError(409, 'validator_unavailable', 'Unavailable validators: ' + ', '.join(missing))
            now = utcnow()
            snapshot = {'integration_name': target['account_name'], 'provider': target['provider'],
                'integration_id': target['_id'], 'model': test['model'], 'system_instruction': target.get('system_prompt', ''),
                'subject_user_id': subject['_id'], 'subject_group_ids': group_ids,
                'policy_snapshots': policies, 'temperature': test['temperature'], 'max_tokens': test['max_tokens'],
                'price_snapshot': target.get('model_prices', []), 'require_active_policy': company.get(
                    'settings', {}).get('require_active_policy', True)}
            changed = db.red_team_tests.update_one({'_id': test['_id'], 'company_id': test['company_id'],
                'status': 'draft', 'version': version}, {'$set': {'status': 'queued', 'launch_key': key,
                'launch_fingerprint': fingerprint, 'launched_at': now, 'updated_at': now,
                'config_snapshot': snapshot}, '$inc': {'execution_revision': 1}}, session=session)
            if changed.matched_count != 1:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            jobs = []
            for item in test['manifest']:
                jobs.append({'company_id': test['company_id'], 'test_id': test['_id'], **item,
                    'catalog_version': test['catalog_version'], 'evaluator_version': test['evaluator_version'],
                    'state': 'pending', 'dispatch_state': 'pending', 'dispatch_generation': 1,
                    'next_attempt_at': now, 'attempt_number': 0, 'attempt_history': [],
                    'verdict': None, 'created_at': now, 'response_withheld': False})
            db.red_team_jobs.insert_many(jobs, ordered=True, session=session)
            audit(db, session, user, 'red_team.launched', 'red_team_test', test['_id'], request_id)
        self._transaction(user, operation)
        return self.detail(user, test_id) | {'dispatch_pending': True}

    def cancel(self, user, test_id, request_id=''):
        def operation(db, session):
            test = self._find(user, test_id, session)
            if test['status'] == 'draft':
                raise DomainError(409, 'not_launched', 'Draft tests have not started')
            if test['status'] in {'completed', 'partially_failed', 'failed', 'cancelled'}:
                return
            now = utcnow()
            db.red_team_tests.update_one({'_id': test['_id'], 'company_id': test['company_id'],
                'status': {'$in': ['queued', 'running', 'cancelling']}},
                {'$set': {'status': 'cancelling', 'cancel_requested_at': now,
                          'cancel_requested_by': object_id(user.id), 'updated_at': now},
                 '$inc': {'execution_revision': 1}}, session=session)
            db.red_team_jobs.update_many({'company_id': test['company_id'], 'test_id': test['_id'],
                'state': {'$in': ['pending', 'queued', 'retry_wait']}},
                {'$set': {'state': 'cancelled', 'finished_at': now, 'execution_phase': 'cancelled',
                          'verdict': None, 'response_withheld': True}}, session=session)
            remaining = db.red_team_jobs.count_documents({'company_id': test['company_id'],
                'test_id': test['_id'], 'state': 'running'}, session=session)
            if not remaining:
                db.red_team_tests.update_one({'_id': test['_id'], 'company_id': test['company_id']},
                    {'$set': {'status': 'cancelled', 'finished_at': now}}, session=session)
            audit(db, session, user, 'red_team.cancelled', 'red_team_test', test['_id'], request_id)
        self._transaction(user, operation)
        return self.detail(user, test_id)

    def clone(self, user, test_id, mode=None, request_id=''):
        old = self._find(user, test_id)
        from app.schemas.red_team import TestConfig
        fields = TestConfig.model_fields
        config = {key: str(old[key]) if key in {'integration_id', 'subject_user_id'} else old[key]
                  for key in fields}
        if mode:
            config['mode'] = mode
        created = self.create(user, TestConfig(**config), request_id, old['comparison_group_id'])
        return self.detail(user, created['test']['id'])

    def results(self, user, test_id, page=1, page_size=20, category=None, case_kind=None,
                verdict=None, state=None):
        test = self._find(user, test_id)
        query = {'company_id': test['company_id'], 'test_id': test['_id']}
        for name, value in [('category', category), ('case_kind', case_kind), ('verdict', verdict), ('state', state)]:
            if value:
                query[name] = value
        rows = self.db.red_team_jobs.find(query).sort('attack_index', 1).skip((page - 1) * page_size).limit(page_size)
        return {'items': [job_read(row) for row in rows], 'page': page,
                'page_size': page_size, 'total': self.db.red_team_jobs.count_documents(query)}

    def result_detail(self, user, test_id, job_id):
        test = self._find(user, test_id)
        job = self.db.red_team_jobs.find_one({'_id': object_id(job_id), 'company_id': test['company_id'],
            'test_id': test['_id']})
        if not job:
            raise DomainError(404, 'not_found', 'Result not found')
        return {'result': job_read(job, detail=True)}

    def report(self, user, test_id):
        test = self._find(user, test_id)
        jobs = self._jobs(test)
        distinct_attacks = len({j['attack_id'] for j in jobs if j['case_kind'] == 'adversarial'})
        snapshot = test.get('config_snapshot') or {}
        return {'test': test_read(test), 'progress': progress(jobs, test), 'score': score(test, jobs),
            'catalog_version': test['catalog_version'], 'evaluator_version': test['evaluator_version'],
            'manifest_hash': test['manifest_hash'], 'adversarial_unique_templates': distinct_attacks,
            'adversarial_repetitions': max(0, test['num_attacks'] - distinct_attacks),
            'control_templates': 5,
            'snapshot': {'integration_name': snapshot.get('integration_name'),
                'provider': snapshot.get('provider'), 'model': test['model'],
                'temperature': snapshot.get('temperature'), 'max_tokens': snapshot.get('max_tokens'),
                'system_instruction_sha256': sha256(snapshot.get('system_instruction', '').encode()).hexdigest()
                    if snapshot else None,
                'policy_versions': [{'id': str(policy['_id']), 'name': policy['name'],
                    'version': policy['version']} for policy in snapshot.get('policy_snapshots', [])]},
            'partial': test['status'] not in {'completed', 'partially_failed', 'failed', 'cancelled'},
            'limitations': ['Synthetic exact-evidence rubric, not universal model safety',
                'Provider outputs may vary between runs', 'Unavailable or inconclusive jobs are excluded from score']}

    def export(self, user, test_id, format='json'):
        report = self.report(user, test_id)
        test = self._find(user, test_id)
        rows = [job_read(job, detail=True) for job in self._jobs(test)]
        for row in rows:
            row.pop('scenario_system', None)  # report does not distribute full instruction snapshots
        if format == 'json':
            return json.dumps({'report': report, 'results': rows}, ensure_ascii=False, indent=2), 'application/json'
        if format != 'csv':
            raise DomainError(422, 'invalid_format', 'Use json or csv')
        stream = io.StringIO()
        writer = csv.writer(stream)
        columns = ['attack_index', 'attack_id', 'category', 'case_kind', 'state', 'verdict',
                   'verdict_reason_code', 'prompt', 'response_text', 'error_code']
        writer.writerow(columns)
        for row in rows:
            def safe(value):
                text = str(value or '')
                return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else text
            writer.writerow([safe(row.get(column)) for column in columns])
        return stream.getvalue(), 'text/csv; charset=utf-8'

    def comparison(self, user, raw_id, protected_id):
        raw, protected = self._find(user, raw_id), self._find(user, protected_id)
        if raw['mode'] != 'raw' or protected['mode'] != 'protected':
            raise DomainError(409, 'comparison_mismatch', 'Select a raw test and a protected test')
        fields = ['integration_id', 'model', 'catalog_version', 'evaluator_version', 'manifest_hash',
                  'seed', 'temperature', 'max_tokens', 'comparison_group_id']
        mismatch = next((name for name in fields if raw.get(name) != protected.get(name)), None)
        if mismatch:
            raise DomainError(409, 'comparison_mismatch', f'Tests differ in {mismatch}')
        if raw.get('status') == 'draft' or protected.get('status') == 'draft':
            raise DomainError(409, 'comparison_mismatch', 'Both tests must have been launched')
        if raw.get('config_snapshot', {}).get('system_instruction') != protected.get('config_snapshot', {}).get('system_instruction'):
            raise DomainError(409, 'comparison_mismatch', 'Tests differ in frozen system instruction')
        left = {j['attack_index']: j for j in self._jobs(raw)}
        right = {j['attack_index']: j for j in self._jobs(protected)}
        pairs = []
        for index in sorted(set(left) & set(right)):
            a, b = left[index], right[index]
            pairs.append({'attack_index': index, 'attack_id': a['attack_id'], 'category': a['category'],
                'case_kind': a['case_kind'], 'raw_verdict': a.get('verdict'),
                'protected_verdict': b.get('verdict'), 'prevention_stage': b.get('prevention_stage')})
        paired = [p for p in pairs if p['case_kind'] == 'adversarial' and p['raw_verdict'] in {'pass', 'fail'}
                  and p['protected_verdict'] in {'pass', 'fail'}]
        return {'raw_test_id': str(raw['_id']), 'protected_test_id': str(protected['_id']),
            'raw_policy_versions': [{'id': str(p['_id']), 'version': p['version']} for p in
                raw.get('config_snapshot', {}).get('policy_snapshots', [])],
            'protected_policy_versions': [{'id': str(p['_id']), 'version': p['version']} for p in
                protected.get('config_snapshot', {}).get('policy_snapshots', [])],
            'paired_evaluable': len(paired), 'paired_excluded': raw['num_attacks'] - len(paired),
            'raw_compliance': sum(p['raw_verdict'] == 'pass' for p in paired) / len(paired) if paired else None,
            'protected_compliance': sum(p['protected_verdict'] == 'pass' for p in paired) / len(paired) if paired else None,
            'pairs': pairs, 'limitations': 'Observed paired synthetic outcomes; provider nondeterminism remains.'}
