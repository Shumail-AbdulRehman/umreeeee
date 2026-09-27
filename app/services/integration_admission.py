"""Mongo-backed single-flight and pacing lease shared by workspace and red team."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import ceil
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import INTEGRATION_REQUESTS_PER_MINUTE
from app.services.admin_common import utcnow


@dataclass(frozen=True)
class AdmissionUnavailable(Exception):
    retry_after: int


class IntegrationAdmission:
    def __init__(self, db):
        self.db = db

    def acquire(self, company_id, integration_id, holder, lease_seconds=120):
        now = utcnow()
        key = {'company_id': company_id, 'integration_id': integration_id}
        try:
            self.db.integration_execution_locks.update_one(key, {'$setOnInsert': {
                **key, 'lease_expires_at': datetime(1970, 1, 1, tzinfo=timezone.utc),
                'next_allowed_at': datetime(1970, 1, 1, tzinfo=timezone.utc)}}, upsert=True)
        except DuplicateKeyError:
            pass
        token = str(uuid4())
        row = self.db.integration_execution_locks.find_one_and_update({**key,
            'lease_expires_at': {'$lte': now}, 'next_allowed_at': {'$lte': now}},
            {'$set': {'lease_token': token, 'holder': holder,
                      'lease_expires_at': now + timedelta(seconds=lease_seconds),
                      'next_allowed_at': now + timedelta(seconds=60 / INTEGRATION_REQUESTS_PER_MINUTE)}},
            return_document=ReturnDocument.AFTER)
        if row:
            return token
        current = self.db.integration_execution_locks.find_one(key) or {}
        wait = max((current.get(field, now) - now).total_seconds() for field in
                   ('lease_expires_at', 'next_allowed_at'))
        raise AdmissionUnavailable(max(1, min(120, ceil(wait))))

    def verify(self, company_id, integration_id, token):
        return bool(self.db.integration_execution_locks.find_one({'company_id': company_id,
            'integration_id': integration_id, 'lease_token': token,
            'lease_expires_at': {'$gt': utcnow()}}, {'_id': 1}))

    def heartbeat(self, company_id, integration_id, token, lease_seconds=120):
        return self.db.integration_execution_locks.update_one({'company_id': company_id,
            'integration_id': integration_id, 'lease_token': token,
            'lease_expires_at': {'$gt': utcnow()}},
            {'$set': {'lease_expires_at': utcnow() + timedelta(seconds=lease_seconds)}}).matched_count == 1

    def release(self, company_id, integration_id, token):
        return self.db.integration_execution_locks.update_one({'company_id': company_id,
            'integration_id': integration_id, 'lease_token': token},
            {'$set': {'lease_expires_at': utcnow(), 'holder': None, 'lease_token': None}}).matched_count == 1
