"""Single ordinary execution path. No provider call before durable input evaluation."""
from datetime import datetime, timedelta, timezone
from copy import deepcopy
from hashlib import sha256
import json
from time import monotonic
from uuid import UUID

from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from pymongo.read_concern import ReadConcern

from app.core.errors import DomainError, object_id
from app.db.mongo import get_database
from app.services.content_service import decrypt, encrypt
from app.services.cost_service import estimate_result_cost
from app.services.enforcement_service import decision, evaluate_stage, resolve_policies
from app.services.remote_detection import catalog_ready
from app.services.provider_service import ProviderError, ProviderService
from app.services.integration_admission import AdmissionUnavailable, IntegrationAdmission
from app.services.admin_common import utcnow
from app.core.permissions import ADMIN_ROLES
from app.validators.registry import registry


TERMINAL = {'allowed', 'blocked_input', 'blocked_output', 'provider_error', 'validation_error',
            'configuration_error', 'interrupted', 'legacy_completed', 'legacy_failed'}


class RunOutcome(Exception):
    def __init__(self, status, code, message, run):
        self.status, self.code, self.message, self.run = status, code, message, run


def _company(user):
    return object_id(user.company.id)


def _safe_result(result):
    if result is None:
        return None
    return {key: value for key, value in result.items() if key not in {'policy_id'}} | {
        'policy_id': str(result['policy_id'])} if 'policy_id' in result else result


def serialize_run(doc, *, detail=False, retention_days=7):
    if doc is None:
        return None
    status = doc.get('status', 'legacy_completed')
    expires = doc.get('content_expires_at')
    expired = doc.get('content_expired', False) or (expires is not None and expires <= utcnow())
    data = {key: str(doc[key]) for key in ('_id', 'user_id', 'integration_id') if doc.get(key)}
    data['id'] = data.pop('_id')
    for key in ('source', 'user_name', 'user_email', 'integration_account_name', 'provider', 'model',
                'status', 'execution_phase', 'error_code', 'error_message', 'input_length', 'output_length',
                'response_withheld', 'content_expired', 'prompt_tokens', 'completion_tokens', 'total_tokens',
                'estimated_cost_usd', 'cost_status', 'cost_source', 'pricing_snapshot', 'enforcement_latency_ms', 'provider_latency_ms',
                'total_latency_ms', 'provider_request_id', 'finish_reason', 'retry_after'):
        data[key] = doc.get(key)
    data['status'] = status
    data['content_expired'] = expired
    data['created_at'] = doc['created_at'].isoformat()
    data['finished_at'] = doc['finished_at'].isoformat() if doc.get('finished_at') else None
    data['group_ids_snapshot'] = [str(value) for value in doc.get('group_ids_snapshot', [])]
    if detail:
        data['input_evaluation'] = _serialize_evaluation(doc.get('input_evaluation'))
        data['output_evaluation'] = _serialize_evaluation(doc.get('output_evaluation'))
        data['policy_snapshots'] = [{'id': str(p['_id']), 'name': p['name'], 'version': p['version'],
                                    'action': p['action'], 'category': p['category'], 'severity': p['severity']}
                                   for p in doc.get('policy_snapshots', [])]
        data['prompt'] = None if expired else decrypt(doc.get('prompt_ciphertext'))
        data['system_prompt'] = None if expired else decrypt(doc.get('system_prompt_ciphertext'))
        data['response_text'] = None if expired or data['response_withheld'] else decrypt(doc.get('response_ciphertext'))
    return data


def _serialize_evaluation(value):
    if not value:
        return None
    return {**value, 'matched_policy_ids': [str(p) for p in value.get('matched_policy_ids', [])],
            'rule_results': [_safe_result(item) for item in value.get('rule_results', [])]}


def _http_outcome(doc):
    status = doc['status']
    if status == 'allowed' or status == 'legacy_completed':
        return {'run': serialize_run(doc, detail=True)}
    if status == 'processing':
        return {'run': serialize_run(doc), 'poll': f'/api/prompt-workspace/runs/{doc["_id"]}'}
    codes = {'blocked_input': (403, 'blocked_input', 'Input blocked by an organization policy.'),
             'blocked_output': (403, 'blocked_output', 'Generated response withheld by an organization policy.'),
             'validation_error': (503, 'validation_error', 'Validation could not complete; no unchecked content was released.'),
             'configuration_error': (429 if doc.get('error_code') == 'integration_busy' else 409,
                 doc.get('error_code') or 'configuration_error', doc.get('error_message') or 'Configuration is unavailable.'),
             'provider_error': (504 if doc.get('error_code') == 'timeout' else 502, doc.get('error_code') or 'provider_error', doc.get('error_message') or 'Provider request failed.'),
             'interrupted': (503, 'interrupted', 'Execution outcome could not be confirmed.')}
    code, name, message = codes.get(status, (503, status, 'Execution failed.'))
    raise RunOutcome(code, name, message, serialize_run(doc, detail=True))


def _violations(db, session, run, matched, stage, evaluation):
    now = utcnow()
    for policy in matched:
        findings = [_safe_result(item) for item in evaluation['rule_results']
                    if item['policy_id'] == policy['_id'] and item['outcome'] == 'match']
        doc = {'company_id': run['company_id'], 'run_id': run['_id'], 'source': run['source'],
               'user_id': run['user_id'], 'policy_id': policy['_id'], 'policy_version': policy['version'],
               'policy_name': policy['name'], 'category': policy['category'], 'severity': policy['severity'],
               'action': policy['action'], 'stage': stage, 'findings': findings,
               'resolution_status': 'open', 'resolution_note': '', 'version': 1,
               'created_at': now, 'updated_at': now}
        result = db.violations.update_one({'company_id': run['company_id'], 'run_id': run['_id'],
            'policy_id': policy['_id'], 'stage': stage}, {'$setOnInsert': doc}, upsert=True, session=session)
        if policy['action'] == 'ALERT' and result.upserted_id:
            admins = db.users.find({'company_id': run['company_id'], 'role': {'$in': list(ADMIN_ROLES)},
                'is_active': True, 'is_email_verified': True}, {'_id': 1}, session=session)
            for admin in admins:
                event_key = f'violation:{result.upserted_id}'
                db.notifications.update_one({'company_id': run['company_id'],
                    'recipient_user_id': admin['_id'], 'event_key': event_key}, {'$setOnInsert': {
                    'company_id': run['company_id'], 'recipient_user_id': admin['_id'],
                    'event_key': event_key, 'kind': 'policy_alert', 'title': 'Policy alert',
                    'summary': f'{policy["name"]} matched on {stage}.', 'resource_type': 'violation',
                    'resource_id': result.upserted_id, 'created_at': now, 'read_at': None}},
                    upsert=True, session=session)


class ProtectedPromptService:
    def __init__(self, db=None, provider=None):
        self.db = db if db is not None else get_database()
        self.provider = provider if provider is not None else ProviderService()

    def context(self, user):
        company = _company(user)
        groups = list(self.db.groups.find({'_id': {'$in': [object_id(g) for g in user.group_ids]},
            'company_id': company, 'status': 'active'}, {'name': 1}))
        integrations = list(self.db.integrations.find({'company_id': company, 'status': 'active'},
            {'provider': 1, 'account_name': 1, 'models': 1, 'system_prompt': 1}))
        applicable = [policy for integration in integrations for policy in resolve_policies(
            self.db, str(company), str(integration['_id']), [group['_id'] for group in groups])]
        active_types = {rule['type'] for policy in applicable for rule in policy['rules']}
        caps = registry.capabilities()
        missing = [kind for kind in active_types if not caps.get(kind, {}).get('ready')]
        if any((p.get('managed_catalog') or p.get('policy_set')) and not catalog_ready(p) for p in applicable) and 'catalog' not in missing:
            missing.append('catalog')
        return {'integrations': [{'id': str(i['_id']), 'provider': i['provider'],
                'account_name': i['account_name'], 'models': i.get('models', []),
                'has_system_instruction': bool(i.get('system_prompt'))} for i in integrations],
                'groups': [{'id': str(g['_id']), 'name': g['name']} for g in groups],
                'enforcement_ready': not missing,
                'readiness_reason': 'Unavailable active validators: ' + ', '.join(sorted(missing)) if missing else None,
                'max_prompt_length': 24000}

    def _admit(self, user, payload):
        company = _company(user)
        integration_id = object_id(payload.integration_id)
        integration = self.db.integrations.find_one({'_id': integration_id, 'company_id': company,
                                                       'status': 'active'})
        if not integration:
            raise DomainError(404, 'not_found', 'Integration is unavailable')
        if payload.model not in integration.get('models', []):
            raise DomainError(422, 'invalid_model', 'Selected model is not enabled')
        return integration

    def _create(self, user, payload, key, fingerprint, source, execution_identity):
        company, user_id = _company(user), object_id(user.id)
        with self.db.client.start_session() as session:
            with session.start_transaction(read_concern=ReadConcern('snapshot')):
                db_user = self.db.users.find_one({'_id': user_id, 'company_id': company,
                    'is_active': True, 'is_email_verified': True}, session=session)
                org = self.db.companies.find_one({'_id': company, 'status': 'active'}, session=session)
                integration = self.db.integrations.find_one({'_id': object_id(payload.integration_id),
                    'company_id': company, 'status': 'active'}, session=session)
                if not db_user or not org or not integration or payload.model not in integration.get('models', []):
                    raise DomainError(409, 'configuration_error', 'Account or integration became unavailable')
                frozen = execution_identity.get('snapshot') if source == 'red_team' else None
                if source == 'red_team' and not frozen:
                    raise DomainError(422, 'missing_snapshot', 'Protected test requires a trusted snapshot')
                if frozen:
                    group_ids = deepcopy(frozen['subject_group_ids'])
                    policies = deepcopy(frozen['policy_snapshots'])
                    system_instruction = frozen['system_instruction'] + '\n\n' + execution_identity['scenario_system']
                else:
                    groups = list(self.db.groups.find({'_id': {'$in': db_user.get('group_ids', [])},
                        'company_id': company, 'status': 'active'}, {'_id': 1}, session=session))
                    group_ids = [g['_id'] for g in groups]
                    policies = resolve_policies(self.db, str(company), str(integration['_id']), group_ids, session=session)
                    system_instruction = integration.get('system_prompt', '')
                integration = {**integration, 'system_prompt': system_instruction}
                now = utcnow()
                days = org.get('settings', {}).get('content_retention_days', 7)
                run = {'company_id': company, 'user_id': user_id, 'source': source,
                    'idempotency_key': key, 'input_fingerprint': fingerprint, 'status': 'processing',
                    'execution_phase': 'admitted', 'heartbeat_at': now, 'started_at': now,
                    'created_at': now, 'user_name': ' '.join(filter(None, [db_user.get('first_name'), db_user.get('last_name')])),
                    'user_email': db_user['email'], 'integration_id': integration['_id'],
                    'integration_account_name': integration['account_name'], 'provider': integration['provider'],
                    'model': payload.model, 'group_ids_snapshot': group_ids, 'policy_snapshots': policies,
                    'require_active_policy': frozen['require_active_policy'] if frozen else org.get('settings', {}).get('require_active_policy', True),
                    'prompt_ciphertext': encrypt(payload.prompt),
                    'system_prompt_ciphertext': encrypt(system_instruction),
                    'content_expires_at': now + timedelta(days=days), 'content_expired': False,
                    'input_length': len(payload.prompt), 'output_length': None, 'response_withheld': False,
                    'estimated_cost_usd': None, 'cost_status': 'unknown'}
                self.db.prompt_runs.insert_one(run, session=session)
                return run, integration

    def _persist_stage(self, run, evaluation, matched, stage, status, extras=None):
        now = utcnow()
        changes = {f'{stage}_evaluation': evaluation, 'heartbeat_at': now,
                   'execution_phase': stage + '_evaluated'}
        if status != 'allowed':
            changes.update({'status': status, 'finished_at': now, 'execution_phase': 'finished',
                'response_withheld': stage == 'output',
                'cost_status': 'not_incurred' if stage == 'input' else run.get('cost_status', 'unknown'),
                'estimated_cost_usd': '0' if stage == 'input' else run.get('estimated_cost_usd'),
                'total_latency_ms': round((monotonic() - run['_timer']) * 1000, 3)})
        changes.update(extras or {})
        with self.db.client.start_session() as session:
            with session.start_transaction():
                result = self.db.prompt_runs.update_one({'_id': run['_id'], 'company_id': run['company_id'],
                    'status': 'processing'}, {'$set': changes}, session=session)
                if result.matched_count != 1:
                    raise DomainError(409, 'run_changed', 'Run state changed')
                _violations(self.db, session, run, matched, stage, evaluation)
        run.update(changes)

    def _finish(self, run, changes):
        changes.update({'finished_at': utcnow(), 'heartbeat_at': utcnow(),
            'execution_phase': 'finished', 'total_latency_ms': round((monotonic() - run['_timer']) * 1000, 3)})
        with self.db.client.start_session() as session:
            with session.start_transaction():
                result = self.db.prompt_runs.update_one({'_id': run['_id'], 'company_id': run['company_id'],
                    'status': 'processing'}, {'$set': changes}, session=session)
                if result.matched_count != 1:
                    raise DomainError(409, 'run_changed', 'Run state changed')
        run.update(changes)

    def execute_protected(self, user, payload, execution_identity):
        """Trusted internal identity; HTTP always supplies workspace with current user."""
        source = execution_identity.get('source')
        if source not in {'workspace', 'red_team'}:
            raise DomainError(422, 'invalid_source', 'Invalid execution source')
        key = execution_identity['key']
        try:
            UUID(key)
        except (ValueError, TypeError) as exc:
            raise DomainError(422, 'invalid_idempotency_key', 'Idempotency-Key must be a UUID') from exc
        if getattr(payload, 'system_prompt', None) or getattr(payload, 'selected_groups', None):
            raise DomainError(422, 'client_scope_forbidden', 'Security scope and system instructions are server-managed')
        if not payload.prompt.strip():
            raise DomainError(422, 'invalid_prompt', 'Prompt cannot be blank')
        canonical = payload.model_dump(include={'integration_id', 'model', 'prompt', 'temperature', 'max_tokens'})
        if source == 'red_team':
            canonical['scenario_system'] = execution_identity.get('scenario_system')
        fingerprint = sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        existing = self.db.prompt_runs.find_one({'company_id': _company(user), 'user_id': object_id(user.id),
            'idempotency_key': key})
        if existing:
            if existing.get('input_fingerprint') != fingerprint:
                raise DomainError(409, 'idempotency_conflict', 'This key was already used for a different prompt')
            return _http_outcome(existing)
        self._admit(user, payload)
        started = monotonic()
        try:
            run, integration = self._create(user, payload, key, fingerprint, source, execution_identity)
        except DuplicateKeyError:
            existing = self.db.prompt_runs.find_one({'company_id': _company(user), 'user_id': object_id(user.id),
                'idempotency_key': key})
            if existing and existing.get('input_fingerprint') == fingerprint:
                return _http_outcome(existing)
            raise DomainError(409, 'idempotency_conflict', 'This key was already used for a different prompt') from None
        run['_timer'] = started
        policies = run['policy_snapshots']
        input_policies = [p for p in policies if 'input' in p.get('stages', [])]
        if not input_policies and run['require_active_policy']:
            self._finish(run, {'status': 'configuration_error', 'error_code': 'policy_required',
                'error_message': 'No applicable input policy is active', 'cost_status': 'not_incurred',
                'estimated_cost_usd': '0'})
            return _http_outcome(run)
        input_eval, matched = evaluate_stage(policies, 'input', {'user_prompt': payload.prompt,
            'system_prompt': integration.get('system_prompt', '')})
        outcome = decision(input_eval, matched, 'input')
        self._persist_stage(run, input_eval, matched, 'input', outcome,
            {'enforcement_latency_ms': input_eval['duration_ms']})
        if outcome != 'allowed':
            return _http_outcome(run)
        # Recheck immediately before the external call. Snapshot rules stay fixed.
        active = self.db.users.find_one({'_id': run['user_id'], 'company_id': run['company_id'],
            'is_active': True, 'is_email_verified': True, 'token_version': user.token_version})
        company = self.db.companies.find_one({'_id': run['company_id'], 'status': 'active'})
        live_integration = self.db.integrations.find_one({'_id': run['integration_id'],
            'company_id': run['company_id'], 'status': 'active'})
        if not active or not company or not live_integration or run['model'] not in live_integration.get('models', []):
            self._finish(run, {'status': 'configuration_error', 'error_code': 'configuration_unavailable',
                'error_message': 'Account or integration became unavailable',
                'cost_status': 'not_incurred', 'estimated_cost_usd': '0'})
            return _http_outcome(run)
        held_token = execution_identity.get('admission_token')
        owned_token = None
        admission = IntegrationAdmission(self.db)
        if held_token:
            if not admission.verify(run['company_id'], run['integration_id'], held_token):
                self._finish(run, {'status': 'configuration_error', 'error_code': 'integration_busy',
                    'error_message': 'Integration reservation is no longer active',
                    'cost_status': 'not_incurred', 'estimated_cost_usd': '0'})
                return _http_outcome(run)
        elif isinstance(self.provider, ProviderService):
            try:
                owned_token = admission.acquire(run['company_id'], run['integration_id'],
                                                f'workspace:{run["_id"]}')
                held_token = owned_token
            except AdmissionUnavailable as exc:
                self._finish(run, {'status': 'configuration_error', 'error_code': 'integration_busy',
                    'error_message': 'Integration is busy. Retry after the advised interval.',
                    'retry_after': exc.retry_after, 'cost_status': 'not_incurred', 'estimated_cost_usd': '0'})
                return _http_outcome(run)
        if source == 'red_team':
            live_integration = {**live_integration, 'system_prompt': integration.get('system_prompt', '')}
        if execution_identity.get('on_provider_dispatch'):
            try:
                execution_identity['on_provider_dispatch']()
            except Exception:
                if owned_token:
                    admission.release(run['company_id'], run['integration_id'], owned_token)
                self._finish(run, {'status': 'configuration_error', 'error_code': 'dispatch_cancelled',
                    'error_message': 'Execution was cancelled before provider dispatch.',
                    'cost_status': 'not_incurred', 'estimated_cost_usd': '0'})
                raise
        try:
            if isinstance(self.provider, ProviderService):
                result = self.provider.execute(live_integration, payload, execution_identity.get('request_id', ''),
                    (self.db, run['company_id'], run['integration_id'], held_token) if held_token else None)
            else:
                result = self.provider.execute(live_integration, payload, execution_identity.get('request_id', ''))
        except ProviderError as exc:
            self._finish(run, {'status': 'provider_error', 'error_code': exc.code, 'error_message': exc.message,
                'cost_status': 'unknown'})
            return _http_outcome(run)
        except Exception:
            # Unexpected adapter failures are still terminal and safe to retry only
            # with a new deliberate execution key; never replay an uncertain call.
            self._finish(run, {'status': 'provider_error', 'error_code': 'unknown',
                'error_message': 'Provider request failed.', 'cost_status': 'unknown'})
            return _http_outcome(run)
        finally:
            if owned_token:
                admission.release(run['company_id'], run['integration_id'], owned_token)
        frozen = execution_identity.get('snapshot') if source == 'red_team' else None
        prices = frozen.get('price_snapshot', []) if frozen is not None else live_integration.get('model_prices', [])
        cost = estimate_result_cost(payload.model, prices, live_integration['provider'], result)
        run.update(cost)
        run['provider_latency_ms'] = result.provider_latency_ms
        run['prompt_tokens'], run['completion_tokens'], run['total_tokens'] = (
            result.prompt_tokens, result.completion_tokens, result.total_tokens)
        output_eval, matched = evaluate_stage(policies, 'output', {'response_text': result.response_text})
        outcome = decision(output_eval, matched, 'output')
        output_meta = {**cost, 'output_length': len(result.response_text),
            'provider_latency_ms': result.provider_latency_ms, 'prompt_tokens': result.prompt_tokens,
            'completion_tokens': result.completion_tokens, 'total_tokens': result.total_tokens,
            'enforcement_latency_ms': input_eval['duration_ms'] + output_eval['duration_ms'],
            'provider_request_id': result.provider_request_id, 'finish_reason': result.finish_reason}
        if outcome == 'allowed':
            output_meta.update({'status': 'allowed', 'finished_at': utcnow(), 'execution_phase': 'finished',
                'response_ciphertext': encrypt(result.response_text),
                'total_latency_ms': round((monotonic() - started) * 1000, 3)})
        self._persist_stage(run, output_eval, matched, 'output', outcome, output_meta)
        if outcome != 'allowed':
            # The response exists only in memory and is never persisted or returned.
            return _http_outcome(run)
        return _http_outcome(run)

    def list_runs(self, user, *, page=1, page_size=20, status=None, model=None, provider=None,
                  start=None, end=None, user_id=None):
        query = {'company_id': _company(user), 'source': {'$in': ['workspace', 'legacy']}}
        if user.role not in ADMIN_ROLES:
            if user_id and user_id != user.id:
                raise DomainError(403, 'forbidden', 'Cannot view another user')
            query['user_id'] = object_id(user.id)
        elif user_id:
            query['user_id'] = object_id(user_id)
        if status:
            query['status'] = status
        if model:
            query['model'] = model
        if provider:
            query['provider'] = provider
        if start or end:
            if any(value.tzinfo is None for value in (start, end) if value) or (start and end and start >= end):
                raise DomainError(422, 'invalid_date', 'Use a timezone-aware valid interval')
            query['created_at'] = {}
            if start:
                query['created_at']['$gte'] = start
            if end:
                query['created_at']['$lt'] = end
        total = self.db.prompt_runs.count_documents(query)
        rows = self.db.prompt_runs.find(query).sort([('created_at', -1), ('_id', -1)]).skip((page - 1) * page_size).limit(page_size)
        return {'items': [serialize_run(row) for row in rows], 'page': page, 'page_size': page_size, 'total': total}

    def detail(self, user, run_id):
        query = {'_id': object_id(run_id), 'company_id': _company(user),
                 'source': {'$in': ['workspace', 'legacy']}}
        if user.role not in ADMIN_ROLES:
            query['user_id'] = object_id(user.id)
        run = self.db.prompt_runs.find_one(query)
        if not run:
            raise DomainError(404, 'not_found', 'Run not found')
        return {'run': serialize_run(run, detail=True)}
