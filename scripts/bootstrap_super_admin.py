"""Promote an explicitly identified existing verified account. Never creates an account."""

import argparse
from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import get_database, get_mongo_client, verify_transactions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not ObjectId.is_valid(args.user_id):
        parser.error('--user-id must be a Mongo ObjectId')
    db = get_database()
    item = db.users.find_one({'_id': ObjectId(args.user_id)},
                             {'email': 1, 'company_id': 1, 'role': 1, 'is_active': 1, 'is_email_verified': 1})
    if not item or not item.get('is_active', True) or not item.get('is_email_verified'):
        parser.error('Target must be an existing active, verified user')
    print(f'User ID: {args.user_id}; organization ID: {item["company_id"]}; role: {item["role"]}')
    if not args.apply:
        print('Dry run. Add --apply to promote this exact user ID.')
        return 0
    verify_transactions()
    with get_mongo_client().start_session() as session:
        with session.start_transaction():
            db.companies.update_one({'_id': item['company_id']}, {'$inc': {'administration_revision': 1}}, session=session)
            result = db.users.update_one({'_id': item['_id'], 'company_id': item['company_id'],
                'is_active': True, 'is_email_verified': True},
                {'$set': {'role': 'super_admin', 'updated_at': datetime.now(timezone.utc)},
                 '$inc': {'token_version': 1, 'version': 1}}, session=session)
            if result.modified_count != 1:
                raise RuntimeError('Target changed during promotion')
            db.audit_events.insert_one({'company_id': item['company_id'], 'actor_user_id': item['_id'],
                'action': 'platform.super_admin_promoted', 'resource_type': 'user', 'resource_id': item['_id'],
                'before': {'role': item['role']}, 'after': {'role': 'super_admin'},
                'request_id': 'local-bootstrap', 'created_at': datetime.now(timezone.utc)}, session=session)
    print('Promotion applied. Existing sessions revoked.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
