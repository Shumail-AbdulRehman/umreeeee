"""Deliver imported invitations from MongoDB. Uncertain sends are never replayed."""

import logging
import signal
from datetime import timedelta
from threading import Event
from uuid import uuid4

from pymongo import ASCENDING, ReturnDocument
from pymongo.errors import PyMongoError

from app.core.config import INVITATION_EXPIRE_HOURS
from app.core.security import generate_invitation_token, hash_invitation_token
from app.db.mongo import close_mongo_client, get_database
from app.services.admin_common import utcnow
from app.services.email_service import send_invitation_email


logger = logging.getLogger(__name__)
CLAIM_LEASE = timedelta(seconds=60)
SEND_LEASE = timedelta(minutes=5)


def _job_filter(job, state):
    return {'_id': job['_id'], 'company_id': job['company_id'], 'state': state,
            'attempt': job['attempt']}


def _account_filter(job):
    return {'_id': job['user_id'], 'company_id': job['company_id']}


def _claim(db):
    now = utcnow()
    return db.staff_invitation_jobs.find_one_and_update(
        {'$or': [{'state': 'pending'}, {'state': 'claimed', 'lease_until': {'$lte': now}}]},
        {'$set': {'state': 'claimed', 'attempt': str(uuid4()), 'lease_until': now + CLAIM_LEASE}},
        sort=[('created_at', ASCENDING), ('_id', ASCENDING)], return_document=ReturnDocument.AFTER,
    )


def _begin_send(db, job, token_hash):
    def operation(session):
        now = utcnow()
        until = now + SEND_LEASE
        changed = db.staff_invitation_jobs.update_one(
            {**_job_filter(job, 'claimed'), 'lease_until': {'$gt': now}},
            {'$set': {'state': 'sending', 'lease_until': until}}, session=session,
        )
        if not changed.modified_count:
            return None
        company = db.companies.find_one(
            {'_id': job['company_id'], 'status': 'active'}, {'name': 1}, session=session,
        )
        account = None
        if company:
            account = db.users.find_one_and_update(
                {**_account_filter(job), 'password_hash': None, 'is_active': True,
                 'invitation_token_hash': job['expected_hash']},
                {'$set': {'invitation_token_hash': token_hash,
                          'invitation_expires_at': now + timedelta(hours=INVITATION_EXPIRE_HOURS),
                          'invitation_delivery_status': 'pending', 'invited_at': now,
                          'staff_invite_attempt': job['attempt'], 'staff_invite_sending_until': until},
                 '$inc': {'version': 1, 'token_version': 1}},
                projection={'email': 1}, return_document=ReturnDocument.AFTER, session=session,
            )
        if not account:
            db.staff_invitation_jobs.update_one(
                _job_filter(job, 'sending'),
                {'$set': {'state': 'skipped', 'finished_at': now},
                 '$unset': {'lease_until': '', 'expected_hash': '', 'attempt': ''}}, session=session,
            )
            db.users.update_one(
                {**_account_filter(job), 'password_hash': None, 'invitation_token_hash': job['expected_hash']},
                {'$set': {'invitation_delivery_status': 'failed'}}, session=session,
            )
            return None
        return account['email'], company['name']

    with db.client.start_session() as session:
        return session.with_transaction(operation)


def _finish(db, job, state, *, expired_only=False):
    def operation(session):
        query = _job_filter(job, 'sending')
        if expired_only:
            query['lease_until'] = {'$lte': utcnow()}
        changed = db.staff_invitation_jobs.update_one(
            query, {'$set': {'state': state, 'finished_at': utcnow()},
                    '$unset': {'lease_until': '', 'expected_hash': '', 'attempt': ''}}, session=session,
        )
        if not changed.modified_count:
            return
        db.users.update_one(
            {**_account_filter(job), 'staff_invite_attempt': job['attempt']},
            {'$set': {'invitation_delivery_status': 'sent' if state == 'sent' else 'failed'},
             '$unset': {'staff_invite_attempt': '', 'staff_invite_sending_until': ''}}, session=session,
        )

    with db.client.start_session() as session:
        session.with_transaction(operation)


def deliver_next(db):
    expired = db.staff_invitation_jobs.find_one({'state': 'sending', 'lease_until': {'$lte': utcnow()}})
    if expired:
        _finish(db, expired, 'unconfirmed', expired_only=True)
        return True
    job = _claim(db)
    if not job:
        return False

    token = generate_invitation_token()
    token_hash = hash_invitation_token(token)
    recipient = _begin_send(db, job, token_hash)
    if not recipient:
        return True
    if not db.users.find_one(
        {**_account_filter(job), 'password_hash': None, 'is_active': True,
         'staff_invite_attempt': job['attempt'], 'invitation_token_hash': token_hash,
         'staff_invite_sending_until': {'$gt': utcnow()}}, {'_id': 1},
    ) or not db.companies.find_one({'_id': job['company_id'], 'status': 'active'}, {'_id': 1}):
        _finish(db, job, 'skipped')
        return True
    email, company_name = recipient
    try:
        result = send_invitation_email(email, token, company_name)
    except Exception as exc:
        logger.warning('Staff invitation outcome is unconfirmed (%s)', type(exc).__name__)
        _finish(db, job, 'unconfirmed')
    else:
        _finish(db, job, 'sent' if result.delivered else 'failed')
    return True


def main():
    logging.basicConfig(level=logging.INFO)
    stop = Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    try:
        while not stop.is_set():
            try:
                if deliver_next(get_database()):
                    continue
            except PyMongoError as exc:
                logger.warning('Staff invitation worker could not reach the database (%s)', type(exc).__name__)
            stop.wait(2)
    finally:
        close_mongo_client()


if __name__ == '__main__':
    main()
