from datetime import timedelta

from app.core.permissions import require_admin
from app.db.mongo import get_database
from app.services.admin_common import company_id, utcnow
from app.services.analytics_service import summary, series, models
from app.services.protected_prompt_service import serialize_run


class DashboardService:
    def get_dashboard_data(self, user):
        require_admin(user)
        db = get_database()
        end = utcnow()
        start = end - timedelta(days=7)
        tenant = {'company_id': company_id(user)}
        runs = {**tenant, 'source': 'workspace', 'created_at': {'$gte': start, '$lt': end}}
        incidents = {**tenant, 'source': 'workspace', 'created_at': {'$gte': start, '$lt': end}}
        admin_counts = {
            'users': db.users.count_documents(tenant),
            'active_users': db.users.count_documents({**tenant, 'is_active': True, 'is_email_verified': True}),
            'groups': db.groups.count_documents({**tenant, 'status': 'active'}),
            'integrations': db.integrations.count_documents({**tenant, 'status': 'active'}),
            'policies': db.policies.count_documents({**tenant, 'status': 'active'}),
        }
        violation_categories = list(db.violations.aggregate([
            {'$match': incidents}, {'$group': {'_id': '$category', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1, '_id': 1}},
        ]))
        violation_types = list(db.violations.aggregate([
            {'$match': incidents}, {'$unwind': '$findings'},
            {'$group': {'_id': '$findings.type', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1, '_id': 1}}, {'$limit': 8},
        ]))
        risk_rows = list(db.violations.aggregate([
            {'$match': incidents}, {'$group': {'_id': '$user_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1, '_id': 1}}, {'$limit': 5},
        ]))
        spend_rows = list(db.prompt_runs.aggregate([
            {'$match': runs}, {'$group': {'_id': '$user_id', 'runs': {'$sum': 1},
                'cost': {'$sum': {'$toDecimal': {'$ifNull': ['$estimated_cost_usd', '0']}}}}},
            {'$sort': {'cost': -1, '_id': 1}}, {'$limit': 5},
        ]))
        user_ids = [row['_id'] for row in risk_rows + spend_rows if row['_id'] is not None]
        user_names = {row['_id']: ' '.join(filter(None, [row.get('first_name'), row.get('last_name')]))
                      or row.get('email', 'Unknown user') for row in db.users.find(
                          {**tenant, '_id': {'$in': user_ids}}, {'first_name': 1, 'last_name': 1, 'email': 1})}
        cost_rows = list(db.prompt_runs.aggregate([
            {'$match': runs}, {'$group': {'_id': {'$dateTrunc': {'date': '$created_at', 'unit': 'day', 'timezone': 'UTC'}},
                'cost': {'$sum': {'$toDecimal': {'$ifNull': ['$estimated_cost_usd', '0']}}}}},
            {'$sort': {'_id': 1}},
        ]))
        recent_runs = list(db.prompt_runs.find(runs).sort([('created_at', -1), ('_id', -1)]).limit(10))
        return {'summary': summary(db, user, start, end), 'series': series(db, user, start, end)['items'],
                'models': models(db, user, start, end)['items'], 'administration': admin_counts,
                'violation_categories': [{'name': row['_id'] or 'Uncategorized', 'count': row['count']}
                                         for row in violation_categories],
                'violation_types': [{'name': row['_id'] or 'Other', 'count': row['count']}
                                    for row in violation_types],
                'users_at_risk': [{'name': user_names.get(row['_id'], 'Former user'), 'count': row['count']}
                                  for row in risk_rows],
                'spend_by_user': [{'name': user_names.get(row['_id'], 'Former user'), 'runs': row['runs'],
                                   'cost_usd': str(row['cost'])} for row in spend_rows],
                'cost_series': [{'date': row['_id'].isoformat(), 'cost_usd': str(row['cost'])}
                                for row in cost_rows],
                'recent_runs': [serialize_run(row) for row in recent_runs],
                'enforcement_ready': True}
