from app.core.permissions import require_admin
from app.db.mongo import get_database
from app.services.admin_common import company_id
from app.services.analytics_service import summary, series, models


class DashboardService:
    def get_dashboard_data(self, user):
        require_admin(user)
        db = get_database()
        tenant = {'company_id': company_id(user)}
        admin_counts = {
            'users': db.users.count_documents(tenant),
            'active_users': db.users.count_documents({**tenant, 'is_active': True, 'is_email_verified': True}),
            'groups': db.groups.count_documents({**tenant, 'status': 'active'}),
            'integrations': db.integrations.count_documents({**tenant, 'status': 'active'}),
            'policies': db.policies.count_documents({**tenant, 'status': 'active'}),
        }
        return {'summary': summary(db, user), 'series': series(db, user)['items'],
                'models': models(db, user)['items'], 'administration': admin_counts,
                'enforcement_ready': True}
