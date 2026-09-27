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
    ordinary = db.prompt_runs.update_many({'content_expires_at': {'$lte': cutoff},
        'content_expired': {'$ne': True}}, {'$unset': {field: '' for field in CONTENT_FIELDS},
        '$set': {'content_expired': True}}).modified_count
    red_team = db.red_team_jobs.update_many({'content_expires_at': {'$lte': cutoff},
        'content_expired': {'$ne': True}}, {'$unset': {'response_ciphertext': ''},
        '$set': {'content_expired': True}}).modified_count
    return ordinary + red_team


def shorten_retention(db, company, days, session=None):
    # Pipeline uses the original creation date, never the time settings are edited.
    db.prompt_runs.update_many({'company_id': company, 'content_expired': {'$ne': True},
        'content_expires_at': {'$exists': True}}, [{'$set': {'content_expires_at': {'$min': [
            '$content_expires_at', {'$add': ['$created_at', int(timedelta(days=days).total_seconds() * 1000)]}]}}}], session=session)
    db.red_team_jobs.update_many({'company_id': company, 'content_expired': {'$ne': True},
        'content_expires_at': {'$exists': True}}, [{'$set': {'content_expires_at': {'$min': [
            '$content_expires_at', {'$add': ['$created_at', int(timedelta(days=days).total_seconds() * 1000)]}]}}}], session=session)
