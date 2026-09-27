"""Explicitly create one isolated synthetic demonstration tenant; never reset data."""
import argparse
import os
from datetime import datetime, timezone

from bson import ObjectId

from app.core.security import hash_password
from app.db.mongo import get_database, verify_transactions
from app.repositories.company_repository import CompanyRepository


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--slug', required=True, help='Unique slug beginning sentinel-demo-')
    parser.add_argument('--email', required=True, help='Synthetic administrator address ending .test')
    parser.add_argument('--apply', action='store_true', help='Actually create the tenant')
    args = parser.parse_args()
    if not args.slug.startswith('sentinel-demo-') or not args.email.endswith('.test'):
        parser.error('Use a sentinel-demo- slug and a .test email to keep this tenant unmistakably synthetic')
    password = os.environ.get('DEMO_ADMIN_PASSWORD', '')
    if args.apply and len(password) < 12:
        parser.error('Set DEMO_ADMIN_PASSWORD to a private value of at least 12 characters')
    db = get_database()
    if db.companies.find_one({'slug': args.slug}) or db.users.find_one({'email': args.email.lower()}):
        parser.error('Slug or email already exists; this script never overwrites data')
    print(f'Demo tenant: {args.slug}; admin: {args.email.lower()}; database: {db.name}')
    if not args.apply:
        print('Dry run only. Supply --apply after reviewing the target database.')
        return 0
    verify_transactions()
    now = datetime.now(timezone.utc)
    with db.client.start_session() as session:
        with session.start_transaction():
            company = CompanyRepository(db).create('Sentinel Synthetic Demo', args.slug, session=session)
            user = {'company_id': ObjectId(company.id), 'first_name': 'Demo', 'last_name': 'Administrator',
                    'full_name': 'Demo Administrator', 'email': args.email.lower(),
                    'department': 'Synthetic demo', 'role': 'org_admin', 'group_ids': [], 'groups': [],
                    'password_hash': hash_password(password), 'is_email_verified': True, 'is_active': True,
                    'token_version': 0, 'version': 1, 'created_at': now, 'updated_at': now}
            result = db.users.insert_one(user, session=session)
            db.audit_events.insert_one({'company_id': ObjectId(company.id),
                'actor_user_id': result.inserted_id, 'action': 'demo.seeded', 'resource_type': 'company',
                'resource_id': ObjectId(company.id), 'before': {}, 'after': {'synthetic': True},
                'request_id': 'local-demo-seed', 'created_at': now}, session=session)
    print(f'Created synthetic organization {company.id}; administrator {result.inserted_id}. No integration or live provider calls were created.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
