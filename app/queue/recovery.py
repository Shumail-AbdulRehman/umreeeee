"""Reconcile only durable job states; never replay an uncertain provider call."""
from datetime import timedelta
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.core.config import RED_TEAM_EXECUTION_LEASE_SECONDS
from app.db.mongo import get_database
from app.services.admin_common import utcnow
from app.services.red_team_report_service import score, terminal_status
from app.workers.red_team_worker import _finalize, _below_threshold, _judge_grading
from app.red_team.evidence import grade


def recover(db, now=None):
    now = now or utcnow()
    counts = {'dispatch_reset': 0, 'pre_call_reset': 0, 'response_resume': 0,
              'uncertain_finalized': 0, 'parent_reconciled': 0, 'judge_resume': 0, 'judge_exhausted': 0}
    publishing = db.red_team_jobs.update_many({'dispatch_state': 'publishing',
        'dispatch_lease_expires_at': {'$lte': now}, 'state': {'$in': ['pending', 'queued', 'retry_wait']}},
        {'$set': {'dispatch_state': 'pending', 'next_attempt_at': now},
         '$unset': {'dispatch_lease_token': '', 'dispatch_lease_expires_at': ''}})
    counts['dispatch_reset'] += publishing.modified_count
    # A broker may lose a confirmed delivery. Republishing a queued message is
    # safe because the job lease/generation prevents a second owner.
    stale_queued = db.red_team_jobs.update_many({'dispatch_state': 'published',
        'state': {'$in': ['pending', 'queued']}, 'published_at': {'$lt': now - timedelta(seconds=60)}},
        {'$set': {'dispatch_state': 'pending', 'next_attempt_at': now},
         '$inc': {'dispatch_generation': 1}})
    counts['dispatch_reset'] += stale_queued.modified_count
    for job in db.red_team_jobs.find({'state': 'running', 'execution_lease_expires_at': {'$lte': now}}):
        # The cursor may be stale: a worker can renew its lease or dispatch the
        # provider after this read. Take ownership atomically and use the current
        # phase; replacing the token also fences every write by the old worker.
        job = db.red_team_jobs.find_one_and_update({
            '_id': job['_id'], 'company_id': job['company_id'], 'test_id': job['test_id'],
            'state': 'running', 'execution_lease_token': job.get('execution_lease_token'),
            'execution_lease_expires_at': {'$lte': now}},
            {'$set': {'execution_lease_token': str(uuid4()),
                      'execution_lease_expires_at': now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS)}},
            return_document=ReturnDocument.AFTER)
        if not job:
            continue
        parent = db.red_team_tests.find_one({'_id': job['test_id'], 'company_id': job['company_id']})
        if not parent:
            continue
        phase = job.get('execution_phase')
        if phase == 'judging' and (job.get('judge') or {}).get('attempts', 0) >= 2 and not (job.get('judge') or {}).get('completed'):
            evidence = grade(job, response='')
            exhausted = {**(job.get('judge') or {}), 'verdict': 'inconclusive',
                         'error_code': 'judge_attempts_exhausted', 'reason': '', 'completed': True}
            # Fence metadata too: a stale recovery pass cannot overwrite a new owner.
            changed = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
                'state': 'running', 'execution_lease_token': job.get('execution_lease_token')},
                {'$set': {'judge': exhausted}})
            if changed.matched_count and _finalize(db, parent, job, job.get('execution_lease_token'),
                    'inconclusive', 'judge_attempts_exhausted', 'The judge attempt limit was reached.',
                    grading=_judge_grading(evidence, exhausted)):
                counts['judge_exhausted'] += 1
        elif phase == 'judging' and job.get('prepared_result'):
            result = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
                'execution_lease_token': job.get('execution_lease_token'), 'state': 'running'},
                {'$set': {'state': 'queued', 'dispatch_state': 'pending', 'next_attempt_at': now},
                 '$inc': {'dispatch_generation': 1},
                 '$unset': {'execution_lease_token': '', 'execution_lease_expires_at': ''}})
            counts['judge_resume'] += result.modified_count
        elif phase == 'response_persisted' and job.get('prepared_result'):
            result = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
                'execution_lease_token': job.get('execution_lease_token'), 'state': 'running'},
                {'$set': {'state': 'queued', 'dispatch_state': 'pending',
                          'next_attempt_at': now, 'execution_phase': 'response_persisted'},
                 '$inc': {'dispatch_generation': 1},
                 '$unset': {'execution_lease_token': '', 'execution_lease_expires_at': ''}})
            counts['response_resume'] += result.modified_count
        elif phase == 'calling_provider':
            if _finalize(db, parent, job, job.get('execution_lease_token'), 'error',
                         'execution_outcome_unknown', 'Provider outcome could not be confirmed; possible cost.',
                         'execution_outcome_unknown'):
                counts['uncertain_finalized'] += 1
        else:
            result = db.red_team_jobs.update_one({'_id': job['_id'], 'company_id': job['company_id'],
                'execution_lease_token': job.get('execution_lease_token'), 'state': 'running'},
                {'$set': {'state': 'queued', 'dispatch_state': 'pending',
                          'next_attempt_at': now, 'execution_phase': 'recovered_before_provider'},
                 '$inc': {'dispatch_generation': 1},
                 '$unset': {'execution_lease_token': '', 'execution_lease_expires_at': ''}})
            counts['pre_call_reset'] += result.modified_count
    # Job and parent updates normally commit together. Reconcile older or
    # interrupted records without treating a stale parent counter as truth.
    for test in db.red_team_tests.find({'status': {'$in': ['queued', 'running', 'cancelling']}}):
        for attempt in range(3):
            try:
                with db.client.start_session() as session:
                    with session.start_transaction():
                        parent = db.red_team_tests.find_one({'_id': test['_id'],
                            'company_id': test['company_id']}, session=session)
                        if not parent or parent['status'] not in {'queued', 'running', 'cancelling'}:
                            break
                        jobs = list(db.red_team_jobs.find({'test_id': parent['_id'],
                            'company_id': parent['company_id']}, session=session))
                        if len(jobs) != parent['num_attacks'] + parent['control_count']:
                            break
                        status = terminal_status(parent, jobs)
                        if not status:
                            break
                        updated = db.red_team_tests.update_one({'_id': parent['_id'],
                            'company_id': parent['company_id'],
                            'execution_revision': parent['execution_revision']},
                            {'$set': {'status': status, 'finished_at': now, 'updated_at': now},
                             '$inc': {'execution_revision': 1}}, session=session)
                        if updated.matched_count != 1:
                            break
                        if _below_threshold({**parent, 'status': status}, jobs):
                            for recipient in db.users.find({'company_id': parent['company_id'],
                                'role': {'$in': ['org_admin', 'super_admin']}, 'is_active': True,
                                'is_email_verified': True}, {'_id': 1}, session=session):
                                db.notifications.update_one({'company_id': parent['company_id'],
                                    'recipient_user_id': recipient['_id'],
                                    'event_key': f'red_team_threshold:{parent["_id"]}'},
                                    {'$setOnInsert': {'company_id': parent['company_id'],
                                        'recipient_user_id': recipient['_id'],
                                        'event_key': f'red_team_threshold:{parent["_id"]}',
                                        'kind': 'red_team_threshold', 'title': 'Red-team score below threshold',
                                        'summary': 'A synthetic evaluation finished below its configured threshold.',
                                        'resource_type': 'red_team_test', 'resource_id': parent['_id'],
                                        'created_at': now, 'read_at': None}}, upsert=True, session=session)
                        counts['parent_reconciled'] += 1
                        break
            except PyMongoError as exc:
                if attempt == 2 or not exc.has_error_label('TransientTransactionError'):
                    raise
    return counts


if __name__ == '__main__':
    from time import sleep
    database = get_database()
    while True:
        print(recover(database), flush=True)
        sleep(15)
