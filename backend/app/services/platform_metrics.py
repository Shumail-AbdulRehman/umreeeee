"""Safe aggregate read models for the cross-company platform workspace.

Only small metadata projections leave MongoDB. Pagination and derived filters
are applied there, before any company row reaches the service layer.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import re

from app.core.errors import DomainError
from app.services.admin_common import utcnow
from app.services.enforcement_service import resolve_policies


BLOCKED_STATUSES = ('blocked_input', 'blocked_output')
PROVIDER_ERROR_THRESHOLD = 3


def window_for(days=7, now=None):
    if days not in (7, 30) or isinstance(days, bool):
        raise DomainError(422, 'invalid_window', 'Choose a 7-day or 30-day interval')
    end = now or utcnow()
    if end.tzinfo is None:
        raise DomainError(422, 'invalid_date', 'Use a timezone-aware report time')
    end = end.astimezone(timezone.utc)
    start = end.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    return start, end, {'days': days, 'from': start.isoformat(), 'to': end.isoformat(), 'timezone': 'UTC'}


def daily_series(rows, start, days):
    """Zero-fill a bounded daily series without changing the report's UTC dates."""
    indexed = {}
    for row in rows:
        point = row.get('date', row.get('_id'))
        if isinstance(point, str):
            point = datetime.fromisoformat(point.replace('Z', '+00:00'))
        if not isinstance(point, datetime):
            continue
        day = point.astimezone(timezone.utc).date() if point.tzinfo else point.date()
        indexed[day] = {key: int(row.get(key, 0)) for key in ('allowed', 'blocked', 'other')}
    return [{'date': (start + timedelta(days=offset)).isoformat(),
             **indexed.get((start + timedelta(days=offset)).date(), dict(allowed=0, blocked=0, other=0))}
            for offset in range(days)]


def company_summary(row, own_id, start, days):
    """One explicit allowlist; never reuse tenant serializers or pass through rows."""
    return {
        'id': str(row['_id']), 'name': row['name'], 'slug': row.get('slug', ''),
        'status': row.get('status') or 'active', 'version': row.get('version') or 1,
        'created_at': row['created_at'].isoformat(), 'is_own': str(row['_id']) == str(own_id),
        'onboarding': row['onboarding'], 'workspace_runs': int(row.get('workspace_runs', 0)),
        'last_workspace_submission': (row['last_workspace_submission'].isoformat()
                                      if row.get('last_workspace_submission') else None),
        'open_violations': int(row.get('open_violations', 0)),
        'high_severity_violations': int(row.get('high_severity_violations', 0)),
        'series': daily_series(row.get('daily', []), start, days),
    }


def company_metrics(row, coverage):
    fields = ('active_accounts', 'verified_admins', 'pending_invitations', 'failed_invitations',
              'active_groups', 'active_integrations', 'dlp_policies', 'guardrail_policies',
              'submitting_users', 'allowed_runs', 'blocked_runs', 'provider_errors', 'validation_errors',
              'configuration_errors', 'interrupted_runs', 'processing_runs', 'other_runs',
              'evaluated_runs', 'terminal_runs')
    result = {key: int(row.get(key, 0)) for key in fields}
    result['evaluation_coverage'] = (round(100 * result['evaluated_runs'] / result['terminal_runs'], 2)
                                     if result['terminal_runs'] else None)
    result['policy_coverage'] = coverage
    return result


def _sum_if(condition):
    return {'$sum': {'$cond': [condition, 1, 0]}}


def _active_account():
    return {'$and': [{'$eq': ['$is_active', True]}, {'$eq': ['$is_email_verified', True]},
                     {'$ne': [{'$ifNull': ['$password_hash', None]}, None]}]}


def _evaluated_run():
    return {'$and': [{'$ne': ['$status', 'processing']}, {'$or': [
        {'$gt': [{'$size': {'$filter': {
            'input': {'$ifNull': [f'${stage}_evaluation.rule_results', []]}, 'as': 'rule',
            'cond': {'$in': ['$$rule.outcome', ['pass', 'match']]},
        }}}, 0]} for stage in ('input', 'output')]}]}


def _lookup(collection, pipeline, output):
    return {'$lookup': {'from': collection, 'let': {'company': '$_id'},
                        'pipeline': pipeline, 'as': output}}


def _company_match(**extra):
    return {'$match': {'$expr': {'$eq': ['$company_id', '$$company']}, **extra}}


def _count_lookup(collection, output, **extra):
    return _lookup(collection, [_company_match(**extra), {'$count': 'count'}], output)


def _first(path, default=0):
    return {'$ifNull': [{'$arrayElemAt': [path, 0]}, default]}


def attention_definitions():
    """Thresholds and metadata-only copy shared by detail and overview queries."""
    return [
        ('high_severity_violations', {'$gt': ['$high_severity_violations', 0]},
         {'$concat': [{'$toString': '$high_severity_violations'}, ' high-severity violations']},
         'Open and awaiting review. Includes high and critical severity.', 'rose',
         '$last_high_violation', 0),
        ('provider_errors', {'$gte': ['$provider_errors', PROVIDER_ERROR_THRESHOLD]},
         'Repeated provider errors',
         {'$concat': [{'$toString': '$provider_errors'}, ' failed workspace submissions in the selected period.']},
         'amber', '$last_provider_error', 1),
        ('awaiting_admin', {'$eq': ['$verified_admins', 0]}, 'First admin unverified',
         'No active verified administrator has completed onboarding.', 'violet', '$created_at', 2),
        ('failed_invitations', {'$gt': ['$failed_invitations', 0]}, 'Invitation delivery failed',
         {'$concat': [{'$toString': '$failed_invitations'}, ' pending invitations need a delivery retry.']},
         'amber', '$last_failed_invitation', 3),
        ('no_integration', {'$and': [{'$gt': ['$verified_admins', 0]},
                                   {'$eq': ['$active_integrations', 0]}]},
         'No active integration', 'Workspace setup is incomplete.', 'blue', '$created_at', 4),
    ]


def attention_stage():
    issues = []
    for kind, condition, title, description, tone, timestamp, priority in attention_definitions():
        issues.append({'$cond': [condition, [{
            'id': {'$concat': [{'$toString': '$_id'}, ':' + kind]},
            'company_id': {'$toString': '$_id'}, 'company_name': '$name', 'kind': kind,
            'title': title, 'description': description, 'tone': tone,
            'occurred_at': {'$ifNull': [timestamp, '$created_at']}, 'priority': priority,
        }], []]})
    return {'$set': {'attention': {'$concatArrays': issues}}}


def safe_attention(row):
    return {key: (row[key].isoformat() if key == 'occurred_at' and isinstance(row.get(key), datetime)
                  else row.get(key)) for key in
            ('id', 'company_id', 'company_name', 'kind', 'title', 'description', 'occurred_at', 'tone')}


def company_pipeline(start, end):
    """Company metadata plus bounded aggregate counters, never raw user/run docs."""
    pending = {'$and': [{'$eq': ['$is_active', True]},
                        {'$eq': [{'$ifNull': ['$password_hash', None]}, None]},
                        {'$ne': [{'$ifNull': ['$invitation_token_hash', None]}, None]}]}
    failed = {'$and': [pending, {'$eq': ['$invitation_delivery_status', 'failed']}]}
    user_group = {'_id': None, 'active_accounts': _sum_if(_active_account()),
                  'verified_admins': _sum_if({'$and': [_active_account(),
                      {'$in': ['$role', ['org_admin', 'super_admin']]}]}),
                  'pending_invitations': _sum_if(pending), 'failed_invitations': _sum_if(failed),
                  'last_failed_invitation': {'$max': {'$cond': [failed, '$updated_at', None]}}}
    in_window = {'created_at': {'$gte': start, '$lt': end}}
    blocked = {'$in': ['$status', list(BLOCKED_STATUSES)]}
    other = {'$not': [{'$in': ['$status', ['allowed', *BLOCKED_STATUSES]]}]}
    run_group = {'_id': None, 'workspace_runs': {'$sum': 1},
                 'allowed_runs': _sum_if({'$eq': ['$status', 'allowed']}),
                 'blocked_runs': _sum_if(blocked), 'other_runs': _sum_if(other),
                 'terminal_runs': _sum_if({'$ne': ['$status', 'processing']}),
                 'evaluated_runs': _sum_if(_evaluated_run()),
                 'submitting_user_ids': {'$addToSet': '$user_id'},
                 'last_provider_error': {'$max': {'$cond': [
                     {'$eq': ['$status', 'provider_error']}, '$created_at', None]}}}
    for status, output in [('provider_error', 'provider_errors'), ('validation_error', 'validation_errors'),
                           ('configuration_error', 'configuration_errors'), ('interrupted', 'interrupted_runs'),
                           ('processing', 'processing_runs')]:
        run_group[output] = _sum_if({'$eq': ['$status', status]})
    daily_group = {'_id': {'$dateTrunc': {'date': '$created_at', 'unit': 'day', 'timezone': 'UTC'}},
                   'allowed': _sum_if({'$eq': ['$status', 'allowed']}),
                   'blocked': _sum_if(blocked), 'other': _sum_if(other)}
    pipeline = [
        {'$project': {'name': 1, 'slug': 1, 'created_at': 1,
                       'status': {'$ifNull': ['$status', 'active']},
                       'version': {'$ifNull': ['$version', 1]},
                       'require_active_policy': {'$ifNull': ['$settings.require_active_policy', True]}}},
        _lookup('users', [_company_match(), {'$group': user_group}], '_users'),
        _count_lookup('groups', '_groups', status='active'),
        _count_lookup('integrations', '_integrations', status='active'),
        _lookup('policies', [_company_match(status='active', managed_catalog={'$ne': True}),
            {'$group': {'_id': None,
                        'dlp_policies': _sum_if({'$eq': ['$category', 'dlp']}),
                        'guardrail_policies': _sum_if({'$eq': ['$category', 'guardrail']})}}], '_policies'),
        _lookup('prompt_runs', [_company_match(source='workspace', **in_window), {'$facet': {
            'metrics': [{'$group': run_group}, {'$set': {'submitting_users': {
                '$size': {'$setDifference': ['$submitting_user_ids', [None]]}}}},
                {'$unset': 'submitting_user_ids'}],
            'daily': [{'$group': daily_group}, {'$sort': {'_id': 1}}],
        }}], '_window'),
        _lookup('prompt_runs', [_company_match(source='workspace'),
            {'$sort': {'created_at': -1, '_id': -1}}, {'$limit': 1},
            {'$project': {'_id': 0, 'created_at': 1}}], '_latest'),
        _lookup('violations', [_company_match(source='workspace', resolution_status={'$ne': 'resolved'}),
            {'$group': {'_id': None, 'open_violations': {'$sum': 1},
                'high_severity_violations': _sum_if({'$in': ['$severity', ['high', 'critical']]}),
                'last_high_violation': {'$max': {'$cond': [
                    {'$in': ['$severity', ['high', 'critical']]}, '$created_at', None]}}}}], '_violations'),
        {'$set': {'_run_window': _first('$_window', {}), '_name_sort': {'$toLower': '$name'}}},
        {'$set': {'daily': {'$ifNull': ['$_run_window.daily', []]},
                   '_run_metrics': _first('$_run_window.metrics', {}),
                   'last_workspace_submission': _first('$_latest.created_at', None),
                   'active_groups': _first('$_groups.count'),
                   'active_integrations': _first('$_integrations.count'),
                   **{key: _first(f'$_users.{key}', None if key == 'last_failed_invitation' else 0)
                      for key in user_group if key != '_id'},
                   **{key: _first(f'$_policies.{key}') for key in ('dlp_policies', 'guardrail_policies')},
                   **{key: _first(f'$_violations.{key}', None if key == 'last_high_violation' else 0)
                      for key in ('open_violations', 'high_severity_violations', 'last_high_violation')}}},
        {'$set': {key: {'$ifNull': [f'$_run_metrics.{key}', None if key == 'last_provider_error' else 0]}
                   for key in (*[key for key in run_group if key not in ('_id', 'submitting_user_ids')],
                               'submitting_users')}},
        {'$set': {'onboarding': {'$cond': [{'$eq': ['$verified_admins', 0]}, 'awaiting_admin',
            {'$cond': [{'$and': [{'$gt': ['$active_integrations', 0]}, {'$gt': ['$active_groups', 0]},
                                {'$gt': [{'$add': ['$dlp_policies', '$guardrail_policies']}, 0]}]},
                        'ready', 'setup_incomplete']}]}}},
        attention_stage(),
        {'$unset': ['_users', '_groups', '_integrations', '_policies', '_window', '_latest',
                    '_violations', '_run_window', '_run_metrics']},
    ]
    return pipeline


class PlatformMetrics:
    def __init__(self, db):
        self.db = db

    def overview(self, start, end):
        result = list(self.db.companies.aggregate(company_pipeline(start, end) + [{'$facet': {
            'totals': [{'$group': {'_id': None, 'total_companies': {'$sum': 1},
                'using_companies': _sum_if({'$gt': ['$workspace_runs', 0]}),
                'onboarding_companies': _sum_if({'$ne': ['$onboarding', 'ready']}),
                'suspended_companies': _sum_if({'$eq': ['$status', 'suspended']})}}],
            'companies': [{'$sort': {'workspace_runs': -1, '_id': 1}}, {'$limit': 4}],
            'series': [{'$unwind': '$daily'}, {'$group': {'_id': '$daily._id',
                **{key: {'$sum': f'$daily.{key}'} for key in ('allowed', 'blocked', 'other')}}},
                {'$sort': {'_id': 1}}],
            'attention_items': [{'$unwind': '$attention'}, {'$replaceWith': '$attention'},
                {'$sort': {'priority': 1, 'occurred_at': -1, 'id': 1}},
                {'$limit': 4}],
            'attention_total': [{'$unwind': '$attention'}, {'$count': 'count'}],
        }}]))
        return result[0] if result else {
            'totals': [], 'companies': [], 'series': [], 'attention_items': [], 'attention_total': [],
        }

    def companies(self, start, end, *, page=1, page_size=8, q='', access=None,
                  onboarding=None, activity=None, sort='runs'):
        query = {}
        if q:
            query['$or'] = [{'name': {'$regex': re.escape(q), '$options': 'i'}},
                            {'slug': {'$regex': re.escape(q), '$options': 'i'}}]
        pipeline = ([{'$match': query}] if query else []) + company_pipeline(start, end)
        filters = {}
        if access:
            filters['status'] = access
        if onboarding:
            filters['onboarding'] = onboarding
        if activity:
            filters['workspace_runs'] = {'$gt': 0} if activity == 'used' else 0
        if filters:
            pipeline.append({'$match': filters})
        sorting = {'runs': {'workspace_runs': -1, '_id': 1},
                   'name': {'_name_sort': 1, '_id': 1},
                   'violations': {'open_violations': -1, '_id': 1}}[sort]
        pipeline += [{'$sort': sorting}, {'$facet': {
            'items': [{'$skip': (page - 1) * page_size}, {'$limit': page_size}],
            'total': [{'$count': 'count'}],
        }}]
        result = list(self.db.companies.aggregate(pipeline))
        return result[0] if result else {'items': [], 'total': []}

    def company(self, company_id, start, end):
        rows = list(self.db.companies.aggregate([{'$match': {'_id': company_id}}] + company_pipeline(start, end)))
        return rows[0] if rows else None

    def policy_coverage(self, company_id, required=True):
        """Evaluate unique membership sets with the actual resolver, without N×M DB reads."""
        members = self.db.users.find({'company_id': company_id, 'role': 'user',
            'is_active': True, 'is_email_verified': True, 'password_hash': {'$ne': None}},
            {'_id': 0, 'group_ids': 1})
        active_groups = {row['_id'] for row in self.db.groups.find(
            {'company_id': company_id, 'status': 'active'}, {'_id': 1})}
        memberships = Counter(frozenset(set(member.get('group_ids') or ()) & active_groups) for member in members)
        eligible = sum(memberships.values())
        integrations = list(self.db.integrations.find(
            {'company_id': company_id, 'status': 'active', 'models.0': {'$exists': True}}, {'_id': 1}))
        if not eligible or not integrations:
            return {'required': bool(required), 'eligible_members': eligible, 'covered_members': 0}
        policies = list(self.db.policies.find({'company_id': company_id, 'status': 'active'}, {
            '_id': 1, 'scope.group_ids': 1, 'scope.integration_ids': 1,
            'stages': 1, 'rules.type': 1, 'managed_catalog': 1,
            'assignment_mode': 1, 'policy_set': 1, 'entries.id': 1, 'entries.pattern_id': 1,
            'selected_entry_ids': 1, 'group_entry_selections.group_id': 1,
            'group_entry_selections.selected_entry_ids': 1,
        }))
        # The resolver needs rule count/type and catalog IDs, not keyword terms,
        # regexes, policy descriptions or detector-specific free text. Config is
        # initialized locally because catalog resolution populates its selection.
        for policy in policies:
            for rule in policy.get('rules', []):
                rule.setdefault('config', {})
        # resolve_policies owns the semantics. Cache only its company-filtered input
        # so identical memberships do not repeatedly fetch the same definitions.
        class PolicyCollection:
            def find(self, _query, session=None):
                return policies
        cached = SimpleNamespace(policies=PolicyCollection())
        covered = 0
        for groups, count in memberships.items():
            complete = True
            for integration in integrations:
                matches = resolve_policies(cached, str(company_id), str(integration['_id']), list(groups))
                if not any('input' in policy.get('stages', []) for policy in matches):
                    complete = False
                    break
            if complete:
                covered += count
        return {'required': bool(required), 'eligible_members': eligible, 'covered_members': covered}
