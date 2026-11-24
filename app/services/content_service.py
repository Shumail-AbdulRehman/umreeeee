"""Text retention is independent of durable execution metadata."""
from datetime import timedelta

from cryptography.fernet import Fernet, InvalidToken

from app.core import config
from app.core.errors import DomainError
from app.services.admin_common import utcnow

CONTENT_FIELDS = ('prompt_ciphertext', 'system_prompt_ciphertext', 'response_ciphertext')


def cipher():
    if not config.CONTENT_ENCRYPTION_KEY or config.CONTENT_ENCRYPTION_KEY == config.INTEGRATION_ENCRYPTION_KEY:
        raise RuntimeError('Set CONTENT_ENCRYPTION_KEY to a separate Fernet key')
    return Fernet(config.CONTENT_ENCRYPTION_KEY.encode('ascii'))


def encrypt(text):
    return cipher().encrypt(text.encode('utf-8')).decode('ascii')


def decrypt(text):
    if text is None:
        return None
    try:
        return cipher().decrypt(text.encode('ascii')).decode('utf-8')
    except InvalidToken as exc:
        raise DomainError(503, 'content_unavailable', 'Stored content cannot currently be decrypted') from exc


def expire_content(db, now=None):
    cutoff = now or utcnow()
    query = {'content_expires_at': {'$lte': cutoff}, 'content_expired': {'$ne': True}}
    return sum(
        collection.update_many(query, {'$unset': dict.fromkeys(fields, ''),
                                      '$set': {'content_expired': True}}).modified_count
        for collection, fields in (
            (db.prompt_runs, CONTENT_FIELDS),
            (db.red_team_attacks, ('prompt_ciphertext', 'response_ciphertext')),
            (db.red_team_jobs, ('response_ciphertext',)),
        )
    )


def shorten_retention(db, company, days, session=None):
    # Pipeline uses the original creation date, never the time settings are edited.
    query = {'company_id': company, 'content_expired': {'$ne': True},
             'content_expires_at': {'$exists': True}}
    duration_ms = int(timedelta(days=days).total_seconds() * 1000)
    update = [{'$set': {'content_expires_at': {'$min': [
        '$content_expires_at', {'$add': ['$created_at', duration_ms]},
    ]}}}]
    for collection in (db.prompt_runs, db.red_team_attacks, db.red_team_jobs):
        collection.update_many(query, update, session=session)
