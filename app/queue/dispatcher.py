"""Poll the Mongo outbox; publish only IDs; confirmation is not worker completion."""
from datetime import timedelta
import logging
from time import sleep
from uuid import uuid4

from pymongo import ReturnDocument

from app.db.mongo import get_database
from app.queue.rabbit import RabbitPublisher
from app.services.admin_common import utcnow


logger = logging.getLogger(__name__)


def heartbeat(db):
    now = utcnow()
    db.worker_heartbeats.update_one({'kind': 'dispatcher'}, {'$set': {'kind': 'dispatcher',
        'updated_at': now, 'expires_at': now + timedelta(minutes=3)}}, upsert=True)


def dispatch_once(db, publisher):
    now = utcnow()
    token = str(uuid4())
    job = db.red_team_jobs.find_one_and_update({'state': {'$in': ['pending', 'queued', 'retry_wait']},
        'next_attempt_at': {'$lte': now}, '$or': [
            {'dispatch_state': 'pending'},
            {'dispatch_state': 'publishing', 'dispatch_lease_expires_at': {'$lte': now}}]},
        {'$set': {'dispatch_state': 'publishing', 'dispatch_lease_token': token,
                  'dispatch_lease_expires_at': now + timedelta(seconds=30)},
         '$inc': {'dispatch_attempt': 1}}, return_document=ReturnDocument.AFTER)
    if not job:
        return False
    parent = db.red_team_tests.find_one({'_id': job['test_id'], 'company_id': job['company_id']},
                                        {'status': 1, 'cancel_requested_at': 1})
    if not parent or parent['status'] in {'cancelled', 'cancelling', 'failed'}:
        db.red_team_jobs.update_one({'_id': job['_id'], 'dispatch_lease_token': token,
            'state': {'$in': ['pending', 'queued', 'retry_wait']}},
            {'$set': {'state': 'cancelled', 'finished_at': utcnow(), 'dispatch_state': 'pending',
                      'response_withheld': True}, '$unset': {'dispatch_lease_token': ''}})
        return True
    try:
        publisher.publish({'v': 1, 'job_id': str(job['_id']), 'test_id': str(job['test_id']),
                           'generation': job['dispatch_generation']})
    except Exception as exc:
        delay = min(60, 2 ** min(job.get('dispatch_attempt', 1), 6))
        db.red_team_jobs.update_one({'_id': job['_id'], 'dispatch_lease_token': token,
            'dispatch_generation': job['dispatch_generation']},
            {'$set': {'dispatch_state': 'pending', 'next_attempt_at': utcnow() + timedelta(seconds=delay)},
             '$unset': {'dispatch_lease_token': '', 'dispatch_lease_expires_at': ''}})
        logger.warning('Red-team publication unavailable for job %s (%s)', job['_id'], type(exc).__name__)
        raise
    db.red_team_jobs.update_one({'_id': job['_id'], 'dispatch_lease_token': token,
        'dispatch_generation': job['dispatch_generation']},
        {'$set': {'dispatch_state': 'published', 'published_at': utcnow()},
         '$unset': {'dispatch_lease_token': '', 'dispatch_lease_expires_at': ''}})
    db.red_team_jobs.update_one({'_id': job['_id'], 'dispatch_generation': job['dispatch_generation'],
        'state': {'$in': ['pending', 'retry_wait']}}, {'$set': {'state': 'queued'}})
    return True


def main():
    db = get_database()
    publisher = None
    while True:
        heartbeat(db)
        try:
            if publisher is None:
                publisher = RabbitPublisher()
            worked = dispatch_once(db, publisher)
            if not worked:
                sleep(1)
        except KeyboardInterrupt:
            break
        except Exception as exc:
            logger.warning('Red-team dispatcher reconnecting (%s)', type(exc).__name__)
            if publisher:
                try:
                    publisher.close()
                except Exception:
                    pass
            publisher = None
            sleep(2)
    if publisher:
        publisher.close()


if __name__ == '__main__':
    main()
