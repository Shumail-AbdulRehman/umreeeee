from datetime import datetime, timedelta, timezone
from math import ceil

from app.core.errors import DomainError, object_id
from app.core.permissions import ADMIN_ROLES
from app.services.admin_common import utcnow


def filters(user, start=None, end=None, user_id=None, status=None, group_id=None):
    end = end or utcnow()
    start = start or end - timedelta(days=7)
    if start.tzinfo is None or end.tzinfo is None or start >= end or end - start > timedelta(days=90):
        raise DomainError(422, 'invalid_date', 'Use a timezone-aware interval of at most 90 days')
    query = {'company_id': object_id(user.company.id), 'source': 'workspace',
             'created_at': {'$gte': start, '$lt': end}}
    if user.role not in ADMIN_ROLES:
        if user_id and user_id != user.id:
            raise DomainError(403, 'forbidden', 'Cannot view another user')
        query['user_id'] = object_id(user.id)
    elif user_id:
        query['user_id'] = object_id(user_id)
    if group_id:
        if user.role not in ADMIN_ROLES:
            raise DomainError(403, 'forbidden', 'Group analytics filters require administrator access')
        query['group_ids_snapshot'] = object_id(group_id)
    if status:
        query['status'] = status
    return query, {'from': start.isoformat(), 'to': end.isoformat(), 'user_id': user_id,
                   'status': status, 'group_id': group_id, 'timezone': 'UTC'}


def percentile(values):
    values = sorted(values)
    return {'count': len(values), 'p50': values[ceil(.50 * len(values)) - 1] if values else None,
            'p95': values[ceil(.95 * len(values)) - 1] if values else None,
            'p99': values[ceil(.99 * len(values)) - 1] if values else None}


def summary(db, user, start=None, end=None, user_id=None, status=None, group_id=None):
    query, echoed = filters(user, start, end, user_id, status, group_id)
    statuses = list(db.prompt_runs.aggregate([{'$match': query}, {'$group': {'_id': '$status',
        'count': {'$sum': 1}, 'known_prompt_tokens': {'$sum': {'$ifNull': ['$prompt_tokens', 0]}},
        'known_completion_tokens': {'$sum': {'$ifNull': ['$completion_tokens', 0]}},
        'unknown_usage': {'$sum': {'$cond': [{'$and': [
            {'$eq': ['$total_tokens', None]},
            {'$not': [{'$in': ['$status', ['blocked_input', 'configuration_error']]}]}]}, 1, 0]}},
        'incomplete': {'$sum': {'$cond': [{'$or': [
            {'$eq': ['$input_evaluation.evaluation_complete', False]},
            {'$eq': ['$output_evaluation.evaluation_complete', False]}]}, 1, 0]}},
        'completed_rules': {'$sum': {'$cond': [{'$or': [
            {'$gt': [{'$size': {'$filter': {'input': {'$ifNull': ['$input_evaluation.rule_results', []]},
                'as': 'rule', 'cond': {'$in': ['$$rule.outcome', ['pass', 'match']]}}}}, 0]},
            {'$gt': [{'$size': {'$filter': {'input': {'$ifNull': ['$output_evaluation.rule_results', []]},
                'as': 'rule', 'cond': {'$in': ['$$rule.outcome', ['pass', 'match']]}}}}, 0]}]}, 1, 0]}}}}]))
    counts = {str(row['_id']): row['count'] for row in statuses}
    total = sum(counts.values())
    terminal = total - counts.get('processing', 0)
    evaluated = sum(row['completed_rules'] for row in statuses if row['_id'] != 'processing')
    # Incident counts follow the run's creation time and every run filter, not the
    # incident's insertion time (which can differ around a date boundary).
    eligible = {**query, 'status': {'$ne': 'processing'}, '$or': [
        {'input_evaluation.rule_results': {'$elemMatch': {'outcome': {'$in': ['pass', 'match']}}}},
        {'output_evaluation.rule_results': {'$elemMatch': {'outcome': {'$in': ['pass', 'match']}}}},
    ]}
    violations = list(db.prompt_runs.aggregate([{'$match': query},
        {'$lookup': {'from': 'violations', 'localField': '_id', 'foreignField': 'run_id',
                     'pipeline': [{'$match': {'company_id': query['company_id']}}], 'as': 'incidents'}},
        {'$project': {'events': {'$size': '$incidents'}}},
        {'$match': {'events': {'$gt': 0}}},
        {'$group': {'_id': None, 'runs': {'$sum': 1}, 'events': {'$sum': '$events'}}}]))
    vruns = violations[0]['runs'] if violations else 0
    events = violations[0]['events'] if violations else 0
    violated_evaluated = list(db.prompt_runs.aggregate([{'$match': eligible},
        {'$lookup': {'from': 'violations', 'localField': '_id', 'foreignField': 'run_id',
                     'pipeline': [{'$match': {'company_id': query['company_id']}}], 'as': 'incidents'}},
        {'$match': {'incidents.0': {'$exists': True}}}, {'$count': 'count'}]))
    violation_numerator = violated_evaluated[0]['count'] if violated_evaluated else 0
    cost_rows = list(db.prompt_runs.aggregate([{'$match': query}, {'$group': {'_id': None,
        'amount': {'$sum': {'$toDecimal': {'$ifNull': ['$estimated_cost_usd', '0']}}},
        'unknown': {'$sum': {'$cond': [{'$in': ['$cost_status', ['unknown', 'partial']]}, 1, 0]}}}}]))
    cost = cost_rows[0]['amount'].to_decimal() if cost_rows else 0
    unknown_cost = cost_rows[0]['unknown'] if cost_rows else 0
    latency = {}
    for field in ('provider_latency_ms', 'enforcement_latency_ms', 'total_latency_ms'):
        values = [row[field] for row in db.prompt_runs.find({**query, field: {'$ne': None}}, {field: 1}).limit(10000)
                  if isinstance(row.get(field), (int, float))]
        latency[field] = percentile(values)
        latency[field]['sample_capped'] = len(values) == 10000
    return {'filters': echoed, 'generated_at': utcnow().isoformat(), 'total_submissions': total,
        'allowed': counts.get('allowed', 0), 'blocked': counts.get('blocked_input', 0) + counts.get('blocked_output', 0),
        'errors': {key: counts.get(key, 0) for key in ('provider_error', 'validation_error', 'configuration_error', 'interrupted')},
        'processing': counts.get('processing', 0), 'violation_events': events, 'runs_with_violations': vruns,
        'violation_rate': violation_numerator / evaluated if evaluated else None,
        'violation_rate_denominator': evaluated, 'evaluation_coverage': evaluated / terminal if terminal else None,
        'fully_evaluated': db.prompt_runs.count_documents({**query, 'status': {'$ne': 'processing'},
            'input_evaluation.evaluation_complete': True,
            '$or': [{'output_evaluation': None}, {'output_evaluation.state': 'not_evaluated'},
                    {'output_evaluation.evaluation_complete': True}]}),
        'incomplete_evaluation': sum(row['incomplete'] for row in statuses),
        'known_prompt_tokens': sum(row['known_prompt_tokens'] for row in statuses),
        'known_completion_tokens': sum(row['known_completion_tokens'] for row in statuses),
        'unknown_usage_runs': sum(row['unknown_usage'] for row in statuses),
        'estimated_cost_usd': str(cost), 'unknown_cost_runs': unknown_cost,
        'cost_status': 'partial' if unknown_cost else 'known', 'latency': latency,
        'legacy_history_count': db.prompt_runs.count_documents({'company_id': query['company_id'], 'source': 'legacy',
            'created_at': query['created_at'], **({'user_id': query['user_id']} if 'user_id' in query else {}),
            **({'group_ids_snapshot': query['group_ids_snapshot']} if 'group_ids_snapshot' in query else {})})}


def series(db, user, start=None, end=None, user_id=None, status=None, group_id=None):
    query, echoed = filters(user, start, end, user_id, status, group_id)
    rows = db.prompt_runs.aggregate([{'$match': query}, {'$group': {
        '_id': {'date': {'$dateTrunc': {'date': '$created_at', 'unit': 'day', 'timezone': 'UTC'}},
                'status': '$status'}, 'count': {'$sum': 1}}}, {'$sort': {'_id.date': 1, '_id.status': 1}}])
    return {'filters': echoed, 'generated_at': utcnow().isoformat(), 'items': [
        {'date': row['_id']['date'].isoformat(), 'status': row['_id']['status'], 'count': row['count']} for row in rows]}


def models(db, user, start=None, end=None, user_id=None, status=None, group_id=None):
    query, echoed = filters(user, start, end, user_id, status, group_id)
    groups = db.prompt_runs.aggregate([{'$match': query}, {'$group': {
        '_id': {'provider': '$provider', 'model': '$model'}, 'runs': {'$sum': 1},
        'known_tokens': {'$sum': {'$ifNull': ['$total_tokens', 0]}},
        'unknown_usage_runs': {'$sum': {'$cond': [{'$eq': ['$total_tokens', None]}, 1, 0]}},
        'known_cost': {'$sum': {'$toDecimal': {'$ifNull': ['$estimated_cost_usd', '0']}}},
        'unknown_cost_runs': {'$sum': {'$cond': [{'$in': ['$cost_status', ['unknown', 'partial']]}, 1, 0]}}}},
        {'$sort': {'runs': -1, '_id.provider': 1, '_id.model': 1}}])
    return {'filters': echoed, 'generated_at': utcnow().isoformat(), 'items': [
        {**row['_id'], 'runs': row['runs'], 'known_tokens': row['known_tokens'],
         'unknown_usage_runs': row['unknown_usage_runs'], 'estimated_cost_usd': str(row['known_cost']),
         'unknown_cost_runs': row['unknown_cost_runs']} for row in groups]}
