"""Dry-run-first, resumable prompt-history migration. Apply only after a verified backup."""
import argparse
from datetime import datetime, timedelta, timezone

from app.db.mongo import get_database, verify_transactions
from app.services.content_service import cipher, encrypt


def migrate_record(db, doc, *, apply=False, now=None):
    now = now or datetime.now(timezone.utc)
    if doc.get('source') in {'workspace', 'red_team'} or doc.get('phase2_migrated'):
        return 'skip'
    created = doc.get('created_at') or now
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    company = db.companies.find_one({'_id': doc['company_id']}, {'settings.content_retention_days': 1})
    days = (company or {}).get('settings', {}).get('content_retention_days', 7)
    expires = created + timedelta(days=days)
    expired = expires <= now
    old_status = doc.get('status', 'completed')
    changes = {'source': 'legacy', 'status': 'legacy_completed' if old_status in {'completed', 'allowed'} else 'legacy_failed',
        'content_expires_at': expires, 'content_expired': expired,
        'input_length': len(doc.get('prompt') or ''), 'output_length': len(doc.get('response_text') or ''),
        'response_withheld': False, 'cost_status': 'unknown', 'estimated_cost_usd': None,
        'provider_latency_ms': doc.get('latency_ms'), 'enforcement_latency_ms': None,
        'total_latency_ms': doc.get('latency_ms'), 'phase2_migrated': True}
    if not expired:
        for old, new in [('prompt', 'prompt_ciphertext'), ('system_prompt', 'system_prompt_ciphertext'),
                         ('response_text', 'response_ciphertext')]:
            if doc.get(old) is not None:
                changes[new] = encrypt(doc[old])
    if not apply:
        return 'expire_text' if expired else 'encrypt_text'
    with db.client.start_session() as session:
        with session.start_transaction():
            db.prompt_runs.update_one({'_id': doc['_id'], 'company_id': doc['company_id'],
                'phase2_migrated': {'$ne': True}}, {'$set': changes, '$unset': {
                'prompt': '', 'system_prompt': '', 'response_text': '', 'selected_groups': '',
                'policy_name': ''}}, session=session)
    return 'expire_text' if expired else 'encrypt_text'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-confirmed', action='store_true')
    args = parser.parse_args()
    if args.apply and not args.backup_confirmed:
        parser.error('--apply requires --backup-confirmed')
    cipher()
    db = get_database()
    if args.apply:
        verify_transactions()
    counts = {'skip': 0, 'expire_text': 0, 'encrypt_text': 0}
    for doc in db.prompt_runs.find({}, {'company_id': 1, 'created_at': 1, 'status': 1, 'source': 1,
        'phase2_migrated': 1, 'prompt': 1, 'system_prompt': 1, 'response_text': 1, 'latency_ms': 1}):
        counts[migrate_record(db, doc, apply=args.apply)] += 1
    print(counts)
    print('Applied.' if args.apply else 'Dry run only. No changes made.')


if __name__ == '__main__':
    main()
