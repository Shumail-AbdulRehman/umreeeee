"""Mongo-backed fixed-window limits. Keys are HMACed; TTL is cleanup only."""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import (SECRET_KEY, AUTH_LOGIN_ACCOUNT_LIMIT, AUTH_LOGIN_IP_LIMIT,
    AUTH_RECOVERY_ACCOUNT_LIMIT, AUTH_RECOVERY_IP_LIMIT)
from app.db.mongo import get_database


LIMITS = {
    'login': ((AUTH_LOGIN_ACCOUNT_LIMIT, 900), (AUTH_LOGIN_IP_LIMIT, 900)),
    'signup': ((10, 3600), (10, 3600)),
    'recovery': ((AUTH_RECOVERY_ACCOUNT_LIMIT, 3600), (AUTH_RECOVERY_IP_LIMIT, 3600)),
}


def _increment(bucket, identity, maximum, seconds):
    now = datetime.now(timezone.utc)
    start = int(now.timestamp()) // seconds * seconds
    digest = hmac.new(SECRET_KEY.encode(), f'{bucket}:{identity}:{start}'.encode(), hashlib.sha256).hexdigest()
    window_start = datetime.fromtimestamp(start, timezone.utc)
    query = {'bucket_key': digest}
    update = {'$inc': {'count': 1}, '$setOnInsert': {
        'window_start': window_start, 'expires_at': window_start + timedelta(seconds=seconds * 2),
        'bucket': bucket}}
    for attempt in range(2):
        try:
            record = get_database().auth_rate_limits.find_one_and_update(
                query, update, upsert=True, return_document=ReturnDocument.AFTER)
            break
        except DuplicateKeyError:
            if attempt:
                raise
    if record['count'] > maximum:
        retry = max(1, start + seconds - int(now.timestamp()))
        raise HTTPException(status_code=429, detail='Too many requests. Try again later.',
                            headers={'Retry-After': str(retry)})


def check_auth_limit(request: Request, bucket: str, account: str = ''):
    account_limit, ip_limit = LIMITS[bucket]
    observed_ip = request.client.host if request.client else 'unknown'
    if bucket != 'signup' and account:
        _increment(f'{bucket}:account', account.strip().lower(), *account_limit)
    _increment(f'{bucket}:ip', observed_ip, *ip_limit)
