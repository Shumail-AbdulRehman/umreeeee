from datetime import timedelta

from app.core.config import INTERRUPTED_RUN_GRACE_SECONDS
from app.db.mongo import get_database
from app.services.admin_common import utcnow


def reconcile(db, now=None):
    now = now or utcnow()
    return db.prompt_runs.update_many({'source': {'$in': ['workspace', 'red_team']}, 'status': 'processing',
        'heartbeat_at': {'$lt': now - timedelta(seconds=INTERRUPTED_RUN_GRACE_SECONDS)}},
        {'$set': {'status': 'interrupted', 'execution_phase': 'finished',
                  'finished_at': now, 'error_code': 'interrupted',
                  'error_message': 'Execution outcome could not be confirmed'}}).modified_count


if __name__ == '__main__':
    print({'reconciled': reconcile(get_database())})
