"""Tenant-scoped Promptfoo Red Team configuration, launch and reads."""

from collections import defaultdict
import csv
from hashlib import sha256
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
from app.red_team.catalog import PLUGINS, PROMPTFOO_VERSION, STRATEGIES, estimated_target_calls, plugin_label, strategy_label
from app.red_team.config_builder import ConfigBuilderError, config_hash, config_preview as build_preview, provider_id
from app.red_team.framework_compliance import framework_catalog
from app.services.admin_common import audit, serialize, utcnow
from app.services.content_service import decrypt
from app.services.enforcement_service import resolve_policies
from app.services.red_team_report import build_report, build_summary
from app.services.remote_detection import catalog_ready
from app.validators.registry import registry
from scripts.check_promptfoo_runtime import runtime_status


TERMINAL = {'completed', 'partially_failed', 'failed', 'cancelled'}
CSV_COLUMNS = [
    'test_idx', 'repeat_index', 'plugin_id', 'strategy_id', 'severity', 'decision',
    'verdict', 'verdict_source', 'prompt', 'response_text', 'grader_reason',
    'latency_ms', 'cost_usd', 'error_code',
]


def csv_safe(value):
    text = str(value if value is not None else '')
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else text


def _generated_tests(plugins, strategies, tests_per_plugin):
    selected = set(strategies) | {'basic'}
    per_seed = sum(STRATEGIES[strategy]['cases_per_seed'] for strategy in selected)
    return len(set(plugins)) * tests_per_plugin * per_seed


def test_read(doc, *, detail=False):
    item = serialize(doc)
    item['id'] = item.pop('_id')
    for key in ('launch_key', 'launch_fingerprint'):
        item.pop(key, None)
    if not detail:
        item.pop('config_snapshot', None)
    elif item.get('config_snapshot'):
        # The preview endpoint redacts paths even for drafts created by older workers.
        item['config_snapshot'].pop('preview_yaml', None)
    return item


def _payload_values(test, fields):
    values = {
        key: str(test[key]) if key in {'integration_id', 'subject_user_id'} and test.get(key) else test.get(key)
        for key in fields
    }
    grader = values.get('grader')
    if isinstance(grader, dict) and grader.get('integration_id') is not None:
        values['grader'] = {**grader, 'integration_id': str(grader['integration_id'])}
    return values


def attack_read(doc, *, detail=False):
    keys = [
        '_id', 'test_id', 'test_idx', 'repeat_index', 'plugin_id', 'strategy_id', 'severity',
        'decision', 'verdict', 'verdict_source', 'grader_reason', 'policy_evidence',
        'protected_run_id', 'assert_type', 'assert_metric', 'latency_ms', 'prompt_tokens',
        'completion_tokens', 'total_tokens', 'cost_usd', 'error_code', 'created_at',
    ]
    item = serialize({key: doc.get(key) for key in keys})
    item['id'] = item.pop('_id')
    item['plugin_name'] = plugin_label(doc.get('plugin_id'))
    item['strategy_name'] = strategy_label(doc.get('strategy_id') or 'basic')
    if detail:
        expires = doc.get('content_expires_at')
        expired = bool(doc.get('content_expired') or (expires is not None and expires <= utcnow()))
        item['content_expired'] = expired
        item['prompt'] = None if expired else decrypt(doc.get('prompt_ciphertext'))
        item['response_text'] = None if expired else decrypt(doc.get('response_ciphertext'))
    return item


class RedTeamService:
    def __init__(self, db=None, *, runtime_check=runtime_status):
        self.db = db if db is not None else get_database()
        self.runtime_check = runtime_check

    @staticmethod
    def _tenant(user):
        require_admin(user)
        return object_id(user.company.id)

    def _find(self, user, test_id, session=None):
        row = self.db.red_team_tests.find_one({
            '_id': object_id(test_id), 'company_id': self._tenant(user),
        }, session=session)
        if not row:
            raise DomainError(404, 'not_found', 'Test not found')
        return row

    def _transaction(self, user, operation):
        for attempt in range(6):
            try:
                with self.db.client.start_session() as session:
                    with session.start_transaction():
                        changed = self.db.companies.update_one(
                            {'_id': self._tenant(user), 'status': 'active'},
                            {'$inc': {'administration_revision': 1}}, session=session,
                        )
                        if changed.matched_count != 1:
                            raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
                        return operation(self.db, session)
            except PyMongoError as exc:
                if attempt == 5 or not exc.has_error_label('TransientTransactionError'):
                    raise
                sleep(min(.02 * (2 ** attempt), .3))

    @staticmethod
    def _provider_supported(integration, model):
        try:
            provider_id(integration.get('provider'), model)
        except ConfigBuilderError as exc:
            raise DomainError(422, exc.code, str(exc), {
                'integration_id': ['Provider is not supported by promptfoo'],
            }) from exc

    def _validate_config(self, user, payload, session=None, *, launching=False):
        company = self._tenant(user)
        target = self.db.integrations.find_one({
            '_id': object_id(payload.integration_id), 'company_id': company, 'status': 'active',
        }, session=session)
        if not target or payload.model not in target.get('models', []):
            raise DomainError(409 if launching else 422, 'target_unavailable',
                              'Choose an active target integration and enabled model')
        grader = self.db.integrations.find_one({
            '_id': object_id(payload.grader.integration_id), 'company_id': company, 'status': 'active',
        }, session=session)
        if not grader or payload.grader.model not in grader.get('models', []):
            raise DomainError(409 if launching else 422, 'grader_unavailable',
                              'Choose an active grader integration and enabled model',
                              {'grader.integration_id': ['Grader integration or model is unavailable']})
        self._provider_supported(target, payload.model)
        self._provider_supported(grader, payload.grader.model)
        subject = None
        if payload.mode == 'protected':
            subject = self.db.users.find_one({
                '_id': object_id(payload.subject_user_id), 'company_id': company,
                'is_active': True, 'is_email_verified': True,
            }, session=session)
            if not subject:
                raise DomainError(409 if launching else 422, 'subject_unavailable',
                                  'Choose an active verified subject in this organization')
        return target, grader, subject

    @staticmethod
    def _snapshot_for_preview(payload, target, grader):
        return {
            'provider': target['provider'], 'base_url': target.get('base_url'),
            'model': payload.model, 'integration_name': target.get('account_name'),
            'system_instruction': target.get('system_prompt', ''),
            'temperature': None, 'max_tokens': None,
            'grader': {
                'integration_id': grader['_id'], 'provider': grader['provider'],
                'base_url': grader.get('base_url'), 'model': payload.grader.model,
            },
        }

    def _preview_payload(self, payload, target, grader, suite=None):
        snapshot = self._snapshot_for_preview(payload, target, grader)
        return {
            'yaml': build_preview(payload.model_dump(), snapshot, suite=suite['suite'] if suite else None),
            'estimated_target_calls': estimated_target_calls(
                payload.plugins, payload.strategies, payload.tests_per_plugin,
            ),
            'generated_tests_estimate': suite['test_count'] if suite else _generated_tests(
                payload.plugins, payload.strategies, payload.tests_per_plugin,
            ),
        }

    def preview(self, user, payload, test_id=None):
        suite = None
        if test_id:
            original = self._find(user, test_id)
            suite = self._suite_document(original)
            self._validate_suite_settings(payload.model_dump(), suite, original)
        target, grader, _subject = self._validate_config(user, payload)
        return self._preview_payload(payload, target, grader, suite)

    def stored_preview(self, user, test_id):
        from app.schemas.red_team import TestConfig
        test = self._find(user, test_id)
        payload = TestConfig(**_payload_values(test, TestConfig.model_fields))
        target, grader, _subject = self._validate_config(user, payload)
        return self._preview_payload(payload, target, grader, self._suite_document(test))

    def _suite_document(self, test, session=None):
        if not test.get('suite_id'):
            return None
        suite = self.db.red_team_suites.find_one(
            {'_id': test['suite_id'], 'company_id': test['company_id']}, session=session,
        )
        if suite is None:
            raise DomainError(409, 'suite_unavailable', 'The stored test suite is unavailable.')
        return suite

    def _suite_for_launch(self, test, session):
        if test.get('suite_id'):
            return self._suite_document(test, session)
        siblings = {
            'company_id': test['company_id'], 'comparison_group_id': test['comparison_group_id'],
            '_id': {'$ne': test['_id']},
        }
        source = self.db.red_team_tests.find_one(
            {**siblings, 'suite_id': {'$type': 'objectId'}}, session=session,
        )
        if source:
            return self._suite_document(source, session)
        if self.db.red_team_tests.find_one({
            **siblings, 'status': {'$in': ['queued', 'generating', 'running', 'cancelling']},
        }, session=session):
            raise DomainError(409, 'suite_pending',
                              'Wait for the other run in this comparison to generate its test cases.')
        return None

    @staticmethod
    def _validate_suite_settings(config, suite, original):
        if suite and config_hash(config) != (suite.get('config_hash') or config_hash(original)):
            raise DomainError(409, 'suite_config_locked',
                              'This draft reuses stored test cases. Keep the original generation settings.')

    @staticmethod
    def _config_document(payload, target, grader, subject):
        data = payload.model_dump()
        data['integration_id'] = target['_id']
        data['grader'] = {'integration_id': grader['_id'], 'model': payload.grader.model}
        data['subject_user_id'] = subject['_id'] if subject else None
        return data

    def create(self, user, payload, request_id='', comparison_group_id=None, suite_id=None):
        def operation(db, session):
            target, grader, subject = self._validate_config(user, payload, session)
            now = utcnow()
            data = self._config_document(payload, target, grader, subject)
            suite = self._suite_document({'suite_id': suite_id, 'company_id': self._tenant(user)}, session)
            planned = suite['test_count'] if suite else _generated_tests(
                payload.plugins, payload.strategies, payload.tests_per_plugin,
            )
            data.update({
                'company_id': self._tenant(user), 'created_by': object_id(user.id),
                'engine': 'promptfoo', 'promptfoo_version': PROMPTFOO_VERSION,
                'suite_id': suite_id, 'status': 'draft', 'failure_reason': None,
                'counts': {'planned': planned, 'executed': 0, 'graded': 0},
                'version': 1, 'execution_revision': 0,
                'comparison_group_id': comparison_group_id or ObjectId(),
                'created_at': now, 'updated_at': now,
            })
            db.red_team_tests.insert_one(data, session=session)
            audit(db, session, user, 'red_team.created', 'red_team_test', data['_id'], request_id)
            return {'test': self._with_progress(data, detail=True)}
        return self._transaction(user, operation)

    def edit(self, user, test_id, payload, request_id=''):
        def operation(db, session):
            old = self._find(user, test_id, session)
            if old['status'] != 'draft':
                raise DomainError(409, 'not_draft', 'Only draft tests can be edited')
            if old['version'] != payload.version:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            target, grader, subject = self._validate_config(user, payload, session)
            data = self._config_document(payload, target, grader, subject)
            data.pop('version', None)
            suite = self._suite_document(old, session)
            self._validate_suite_settings(data, suite, old)
            data.update({
                'counts': {
                    'planned': suite['test_count'] if suite else _generated_tests(
                        payload.plugins, payload.strategies, payload.tests_per_plugin,
                    ),
                    'executed': 0, 'graded': 0,
                },
                'updated_at': utcnow(),
            })
            changed = db.red_team_tests.update_one({
                '_id': old['_id'], 'company_id': old['company_id'], 'status': 'draft', 'version': payload.version,
            }, {'$set': data, '$inc': {'version': 1}}, session=session)
            if changed.matched_count != 1:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            audit(db, session, user, 'red_team.edited', 'red_team_test', old['_id'], request_id)
            current = db.red_team_tests.find_one({'_id': old['_id'], 'company_id': old['company_id']}, session=session)
            return {'test': self._with_progress(current, detail=True)}
        return self._transaction(user, operation)

    def list(self, user, page=1, page_size=20, q=None, status=None, mode=None, integration_id=None,
             start=None, end=None):
        query = {'company_id': self._tenant(user), 'engine': 'promptfoo'}
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
        rows = list(self.db.red_team_tests.find(query).sort([
            ('created_at', DESCENDING), ('_id', DESCENDING),
        ]).skip((page - 1) * page_size).limit(page_size))
        terminal_ids = [row['_id'] for row in rows if row.get('status') in TERMINAL]
        attacks_by_test = defaultdict(list)
        if terminal_ids:
            attacks = self.db.red_team_attacks.find(
                {'company_id': query['company_id'], 'test_id': {'$in': terminal_ids}},
                {'_id': 0, 'test_id': 1, 'plugin_id': 1, 'strategy_id': 1, 'severity': 1,
                 'verdict': 1, 'verdict_source': 1},
            )
            for attack in attacks:
                attacks_by_test[attack['test_id']].append(attack)
        items = []
        for row in rows:
            item = self._with_progress(row)
            if row.get('status') in TERMINAL:
                item['summary'] = build_summary(row, attacks_by_test[row['_id']])
            items.append(item)
        return {'items': items, 'page': page, 'page_size': page_size,
                'total': self.db.red_team_tests.count_documents(query)}

    def _with_progress(self, test, detail=False):
        phase = None
        if test.get('status') != 'draft':
            job = self.db.red_team_jobs.find_one({
                'company_id': test['company_id'], 'test_id': test['_id'], 'kind': 'run',
            }, sort=[('created_at', DESCENDING)])
            phase = (job or {}).get('phase') or (job or {}).get('execution_phase')
        counts = test.get('counts') or {'planned': 0, 'executed': 0, 'graded': 0}
        return {**test_read(test, detail=detail), 'progress': {**serialize(counts), 'phase': phase}}

    def detail(self, user, test_id):
        return {'test': self._with_progress(self._find(user, test_id), detail=True)}

    def _launch_snapshot(self, user, test, target, grader, subject, company, session, suite=None):
        group_ids = []
        policies = []
        if test['mode'] == 'protected':
            groups = self.db.groups.find({
                '_id': {'$in': subject.get('group_ids', [])}, 'company_id': test['company_id'], 'status': 'active',
            }, {'_id': 1}, session=session)
            group_ids = [group['_id'] for group in groups]
            policies = resolve_policies(
                self.db, str(test['company_id']), str(test['integration_id']), group_ids, session=session,
            )
            if company.get('settings', {}).get('require_active_policy', True) and not any(
                    'input' in policy.get('stages', []) for policy in policies):
                raise DomainError(409, 'policy_required', 'No applicable input policy is active')
            missing = sorted({
                rule['type'] for policy in policies for rule in policy.get('rules', [])
                if not registry.capabilities().get(rule['type'], {}).get('ready')
                or (rule['type'] == 'catalog' and not catalog_ready(policy))
            })
            if missing:
                raise DomainError(409, 'validator_unavailable', 'Unavailable validators: ' + ', '.join(missing))
        snapshot = {
            'integration_id': target['_id'], 'integration_name': target['account_name'],
            'provider': target['provider'], 'base_url': target.get('base_url'), 'model': test['model'],
            'system_instruction': target.get('system_prompt', ''), 'temperature': None, 'max_tokens': None,
            'price_snapshot': target.get('model_prices', []),
            'subject_user_id': subject['_id'] if subject else None,
            'subject_group_ids': group_ids, 'policy_snapshots': policies,
            'require_active_policy': company.get('settings', {}).get('require_active_policy', True),
            'grader': {
                'integration_id': grader['_id'], 'provider': grader['provider'],
                'base_url': grader.get('base_url'), 'model': test['grader']['model'],
                'price_snapshot': grader.get('model_prices', []),
            },
            'catalog_severities': {plugin: PLUGINS[plugin]['severity'] for plugin in test['plugins']},
            'config_hash': config_hash(test),
        }
        snapshot['preview_yaml'] = build_preview(test, snapshot, suite=suite['suite'] if suite else None)
        return snapshot

    def launch(self, user, test_id, version, key, request_id=''):
        try:
            UUID(key)
        except (ValueError, TypeError) as exc:
            raise DomainError(422, 'invalid_idempotency_key', 'Idempotency-Key must be a UUID') from exc
        readiness = self.runtime_check()
        if not readiness.get('available') or not readiness.get('cloud_key_configured'):
            raise DomainError(409, 'promptfoo_unavailable', 'Promptfoo runtime or Cloud API key is unavailable')
        fingerprint = sha256(f'{test_id}:{version}'.encode()).hexdigest()

        def operation(db, session):
            test = self._find(user, test_id, session)
            if test['status'] != 'draft':
                if test.get('launch_key') == key and test.get('launch_fingerprint') == fingerprint:
                    return
                raise DomainError(409, 'already_launched', 'Clone this test to run it again')
            if test['version'] != version:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            actor = db.users.find_one({
                '_id': object_id(user.id), 'company_id': test['company_id'],
                'role': {'$in': list(ADMIN_ROLES)}, 'is_active': True, 'is_email_verified': True,
            }, session=session)
            company = db.companies.find_one({'_id': test['company_id'], 'status': 'active'}, session=session)
            if not actor or not company:
                raise DomainError(409, 'configuration_unavailable', 'Test authority is unavailable')
            from app.schemas.red_team import TestConfig
            payload = TestConfig(**_payload_values(test, TestConfig.model_fields))
            target, grader, subject = self._validate_config(user, payload, session, launching=True)
            suite = self._suite_for_launch(test, session)
            self._validate_suite_settings(test, suite, test)
            snapshot = self._launch_snapshot(user, test, target, grader, subject, company, session, suite)
            now = utcnow()
            changes = {
                'status': 'queued', 'launch_key': key, 'launch_fingerprint': fingerprint,
                'config_snapshot': snapshot, 'launched_at': now, 'updated_at': now,
            }
            if suite:
                changes['counts.planned'] = suite['test_count']
                changes['suite_id'] = suite['_id']
            changed = db.red_team_tests.update_one({
                '_id': test['_id'], 'company_id': test['company_id'], 'status': 'draft', 'version': version,
            }, {'$set': changes, '$inc': {'execution_revision': 1}}, session=session)
            if changed.matched_count != 1:
                raise DomainError(409, 'stale_version', 'Test changed. Refresh and try again.')
            db.red_team_jobs.insert_one({
                'company_id': test['company_id'], 'test_id': test['_id'], 'integration_id': test['integration_id'],
                'kind': 'run', 'state': 'pending', 'phase': 'claimed',
                'dispatch_state': 'pending', 'dispatch_generation': 1, 'dispatch_attempt': 0,
                'next_attempt_at': now, 'attempt_number': 0, 'created_at': now,
            }, session=session)
            audit(db, session, user, 'red_team.launched', 'red_team_test', test['_id'], request_id)

        self._transaction(user, operation)
        return self.detail(user, test_id) | {'dispatch_pending': True}

    def cancel(self, user, test_id, request_id=''):
        def operation(db, session):
            test = self._find(user, test_id, session)
            if test['status'] == 'draft':
                raise DomainError(409, 'not_launched', 'Draft tests have not started')
            if test['status'] in TERMINAL:
                return
            now = utcnow()
            if test['status'] == 'queued':
                db.red_team_tests.update_one(
                    {'_id': test['_id'], 'company_id': test['company_id'], 'status': 'queued'},
                    {'$set': {'status': 'cancelled', 'finished_at': now, 'cancel_requested_at': now,
                              'updated_at': now}, '$inc': {'execution_revision': 1}}, session=session,
                )
                db.red_team_jobs.update_many({
                    'company_id': test['company_id'], 'test_id': test['_id'],
                    'state': {'$in': ['pending', 'queued', 'retry_wait']},
                }, {'$set': {'state': 'cancelled', 'phase': 'finished', 'finished_at': now}}, session=session)
            else:
                db.red_team_tests.update_one(
                    {'_id': test['_id'], 'company_id': test['company_id'],
                     'status': {'$in': ['generating', 'running', 'cancelling']}},
                    {'$set': {'status': 'cancelling', 'cancel_requested_at': now,
                              'cancel_requested_by': object_id(user.id), 'updated_at': now},
                     '$inc': {'execution_revision': 1}}, session=session,
                )
            audit(db, session, user, 'red_team.cancelled', 'red_team_test', test['_id'], request_id)
        self._transaction(user, operation)
        return self.detail(user, test_id)

    def clone(self, user, test_id, mode=None, request_id=''):
        from app.schemas.red_team import TestConfig
        old = self._find(user, test_id)
        clone_mode = mode or old['mode']
        values = _payload_values(old, TestConfig.model_fields)
        values['mode'] = clone_mode
        if clone_mode == 'protected' and not values.get('subject_user_id'):
            values['subject_user_id'] = str(old.get('created_by') or object_id(user.id))
        created = self.create(
            user, TestConfig(**values), request_id,
            comparison_group_id=old['comparison_group_id'], suite_id=old.get('suite_id'),
        )
        return created

    def results(self, user, test_id, page=1, page_size=20, plugin=None, strategy=None,
                verdict=None, verdict_source=None, **_ignored):
        test = self._find(user, test_id)
        scope = {'company_id': test['company_id'], 'test_id': test['_id']}
        query = dict(scope)
        for field, value in (
            ('plugin_id', plugin), ('strategy_id', strategy), ('verdict', verdict),
            ('verdict_source', verdict_source),
        ):
            if value:
                query[field] = {'$eq': value}
        all_rows = list(self.db.red_team_attacks.find(scope, {'verdict': 1}))
        counts = {'all': len(all_rows)}
        for name in ('pass', 'fail', 'error'):
            counts[name] = sum(row.get('verdict') == name for row in all_rows)
        rows = self.db.red_team_attacks.find(query).sort([
            ('test_idx', 1), ('repeat_index', 1),
        ]).skip((page - 1) * page_size).limit(page_size)
        return {'items': [attack_read(row) for row in rows], 'page': page, 'page_size': page_size,
                'total': self.db.red_team_attacks.count_documents(query), 'counts': counts}

    def _paired_test(self, test):
        if not test.get('suite_id'):
            return None
        return self.db.red_team_tests.find_one({
            'company_id': test['company_id'], '_id': {'$ne': test['_id']},
            'suite_id': test['suite_id'], 'mode': 'protected' if test['mode'] == 'raw' else 'raw',
            'status': {'$in': sorted(TERMINAL)},
        }, sort=[('finished_at', DESCENDING), ('_id', DESCENDING)])

    def result_detail(self, user, test_id, attack_id):
        test = self._find(user, test_id)
        attack = self.db.red_team_attacks.find_one({
            '_id': object_id(attack_id), 'company_id': test['company_id'], 'test_id': test['_id'],
        })
        if not attack:
            raise DomainError(404, 'not_found', 'Result not found')
        result = attack_read(attack, detail=True)
        paired = self._paired_test(test)
        other = self.db.red_team_attacks.find_one({
            'company_id': test['company_id'], 'test_id': paired['_id'],
            'test_idx': attack['test_idx'], 'repeat_index': attack.get('repeat_index', 0),
        }) if paired else None
        result['paired'] = attack_read(other) if other else None
        return {'result': result}

    def _previous_test(self, test):
        if not test.get('finished_at'):
            return None
        return self.db.red_team_tests.find_one({
            'company_id': test['company_id'], '_id': {'$ne': test['_id']}, 'engine': 'promptfoo',
            'integration_id': test['integration_id'], 'model': test['model'], 'mode': test['mode'],
            'status': {'$in': sorted(TERMINAL - {'cancelled'})}, 'finished_at': {'$lt': test['finished_at']},
        }, sort=[('finished_at', DESCENDING), ('_id', DESCENDING)])

    def report(self, user, test_id):
        test = self._find(user, test_id)
        attacks = list(self.db.red_team_attacks.find({'company_id': test['company_id'], 'test_id': test['_id']}))
        paired_test = self._paired_test(test)
        paired = None
        if paired_test:
            paired = (paired_test, list(self.db.red_team_attacks.find({
                'company_id': test['company_id'], 'test_id': paired_test['_id'],
            })))
        previous_test = self._previous_test(test)
        previous = None
        if previous_test:
            previous = (previous_test, list(self.db.red_team_attacks.find({
                'company_id': test['company_id'], 'test_id': previous_test['_id'],
            })))
        return serialize({
            **build_report(test, attacks, paired=paired, previous=previous),
            'test': test_read(test), 'progress': self._with_progress(test)['progress'],
        })

    def export(self, user, test_id, format='json'):
        report = self.report(user, test_id)
        test = self._find(user, test_id)
        attacks = list(self.db.red_team_attacks.find({
            'company_id': test['company_id'], 'test_id': test['_id'],
        }).sort([('test_idx', 1), ('repeat_index', 1)]))
        rows = [attack_read(attack, detail=True) for attack in attacks]
        if format == 'json':
            return json.dumps({'report': report, 'results': rows}, ensure_ascii=False, indent=2), 'application/json'
        if format != 'csv':
            raise DomainError(422, 'invalid_format', 'Use json or csv')
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows({key: csv_safe(row.get(key)) for key in CSV_COLUMNS} for row in rows)
        return stream.getvalue(), 'text/csv; charset=utf-8'

    def capabilities(self):
        readiness = self.runtime_check()
        return {
            'promptfoo': {
                'version': readiness.get('version'), 'available': readiness.get('available', False),
                'cloud_key_configured': readiness.get('cloud_key_configured', False),
            },
            'plugins': [dict(plugin) for plugin in PLUGINS.values()],
            'strategies': [dict(strategy) for strategy in STRATEGIES.values()],
            'frameworks': framework_catalog(PLUGINS),
            'limits': {'max_target_calls': 200, 'max_tests_per_plugin': 10},
            'supported_providers': ['openai', 'groq', 'deepseek', 'anthropic', 'gemini', 'ollama'],
            'modes': ['raw', 'protected'],
        }
