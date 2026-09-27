"""Dry-run-first migration for legacy MongoDB and optional app.db JSON exports."""

import argparse
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId, json_util
from pymongo.errors import DuplicateKeyError

from app.core.encryption import decrypt_credential, encrypt_credential, validate_encryption_key
from app.db.indexes import ensure_indexes
from app.db.mongo import get_database, get_mongo_client, verify_transactions


def normalize(value):
    return ' '.join(str(value or '').split()).casefold()


def load_source(path):
    content = json_util.loads(path.read_text(encoding='utf-8'))
    if not isinstance(content, dict) or not isinstance(content.get('collections'), dict):
        raise ValueError('Source JSON must contain a collections object')
    records = {}
    for name in ['companies', 'users', 'integrations', 'prompt_runs']:
        raw = content['collections'].get(name, {})
        documents = raw.get('documents', {}) if isinstance(raw, dict) else {}
        if not isinstance(documents, dict):
            raise ValueError(f'Invalid {name} collection shape')
        values = []
        for key, item in documents.items():
            if not isinstance(item, dict) or not ObjectId.is_valid(str(item.get('_id', key))):
                raise ValueError(f'Invalid {name} record ID')
            document = dict(item)
            document['_id'] = ObjectId(str(document.get('_id', key)))
            for field in ['company_id', 'user_id', 'integration_id']:
                if field in document and ObjectId.is_valid(str(document[field])):
                    document[field] = ObjectId(str(document[field]))
            values.append(document)
        records[name] = values
    return records


def inspect(records):
    conflicts = []
    for name, fields in [('companies', ('slug',)), ('users', ('email',)),
                         ('integrations', ('company_id', 'provider', 'account_name'))]:
        seen = set()
        for item in records[name]:
            key = tuple(normalize(item.get(field)) for field in fields)
            if any(not part for part in key) or key in seen:
                conflicts.append(f'{name}:{item["_id"]}: duplicate or invalid identity')
            seen.add(key)
    for user in records['users']:
        role = normalize(user.get('role'))
        if role not in {'manager', 'employee', 'user', 'org_admin', 'super_admin'}:
            conflicts.append(f'users:{user["_id"]}: unmapped role')
    company_ids = {str(item['_id']) for item in records['companies']}
    for name in ['users', 'integrations', 'prompt_runs']:
        for item in records[name]:
            if str(item.get('company_id')) not in company_ids:
                conflicts.append(f'{name}:{item["_id"]}: missing company')
    return conflicts


def inspect_import_target(source, target):
    """Check JSON import collisions without changing the target database."""
    conflicts = []
    identities = {
        'companies': ('slug',),
        'users': ('email',),
        'integrations': ('company_id', 'provider', 'account_name'),
    }
    for name, incoming in source.items():
        existing = target[name]
        by_id = {str(item['_id']): item for item in existing}
        by_identity = {}
        if name in identities:
            for item in existing:
                key = tuple(normalize(item.get(field)) for field in identities[name])
                by_identity.setdefault(key, str(item['_id']))
        for item in incoming:
            record_id = str(item['_id'])
            target_item = by_id.get(record_id)
            if target_item is not None and not target_item.get('phase1_migrated') and target_item != item:
                conflicts.append(f'{name}:{record_id}: conflicting target ID')
            if name in identities:
                key = tuple(normalize(item.get(field)) for field in identities[name])
                other_id = by_identity.get(key)
                if other_id is not None and other_id != record_id:
                    conflicts.append(f'{name}:{record_id}: conflicting target identity')
    return conflicts


def source_records(db):
    return {name: list(db[name].find({})) for name in ['companies', 'users', 'integrations', 'prompt_runs']}


def import_source(db, records):
    with get_mongo_client().start_session() as session:
        with session.start_transaction():
            for name, values in records.items():
                for item in values:
                    existing = db[name].find_one({'_id': item['_id']}, session=session)
                    if existing:
                        if existing.get('phase1_migrated') or existing == item:
                            continue
                        raise ValueError(f'Conflicting target ID in {name}: {item["_id"]}')
                    if name == 'companies' and db.companies.find_one({'slug': item['slug']}, session=session):
                        raise ValueError(f'Conflicting company slug: {item["_id"]}')
                    if name == 'users' and db.users.find_one({'email': normalize(item['email'])}, session=session):
                        raise ValueError(f'Conflicting email: {item["_id"]}')
                    db[name].insert_one(item, session=session)


def migrate(db, records):
    now = datetime.now(timezone.utc)
    for item in records['companies']:
        db.companies.update_one({'_id': item['_id']}, {'$set': {
            'status': item.get('status', 'active'), 'version': item.get('version', 1),
            'administration_revision': item.get('administration_revision', 0),
            'settings': item.get('settings', {'content_retention_days': 7, 'require_active_policy': True}),
            'updated_at': item.get('updated_at', now), 'phase1_migrated': True,
        }})

    group_cache = {}
    for item in records['users']:
        role = normalize(item.get('role'))
        mapped = {'manager': 'org_admin', 'employee': 'user', 'user': 'user',
                  'org_admin': 'org_admin', 'super_admin': 'super_admin'}[role]
        group_ids = []
        for group_name in item.get('groups', []):
            name = ' '.join(str(group_name).split())
            if not name:
                continue
            key = (str(item['company_id']), name.casefold())
            if key not in group_cache:
                group = db.groups.find_one({'company_id': item['company_id'], 'name_normalized': key[1]})
                if group is None:
                    result = db.groups.insert_one({'company_id': item['company_id'], 'name': name,
                        'name_normalized': key[1], 'description': '', 'status': 'active',
                        'version': 1, 'created_at': now, 'updated_at': now})
                    group_cache[key] = result.inserted_id
                else:
                    group_cache[key] = group['_id']
            if group_cache[key] not in group_ids:
                group_ids.append(group_cache[key])
        existing_ids = [ObjectId(str(value)) for value in item.get('group_ids', []) if ObjectId.is_valid(str(value))]
        db.users.update_one({'_id': item['_id']}, {'$set': {
            'role': mapped, 'email': normalize(item['email']), 'group_ids': existing_ids or group_ids,
            'is_active': item.get('is_active', True), 'token_version': item.get('token_version', 0),
            'version': item.get('version', 1), 'updated_at': item.get('updated_at', now),
            'phase1_migrated': True,
        }})

    for item in records['integrations']:
        ciphertext = item.get('api_key_ciphertext')
        if ciphertext:
            decrypt_credential(ciphertext)
        elif item.get('api_key'):
            ciphertext = encrypt_credential(item['api_key'])
            if decrypt_credential(ciphertext) != item['api_key']:
                raise ValueError(f'Credential verification failed for integration {item["_id"]}')
        update = {'$set': {
            'api_key_ciphertext': ciphertext,
            'api_key_key_id': 'v1' if ciphertext else None,
            'api_key_suffix': item.get('api_key_suffix') or (item.get('api_key') or '')[-4:] or None,
            'account_name_normalized': normalize(item['account_name']),
            'status': item.get('status', 'active'), 'version': item.get('version', 1),
            'system_prompt': item.get('system_prompt', ''), 'base_url': item.get('base_url'),
            'updated_at': item.get('updated_at', now), 'phase1_migrated': True,
        }, '$unset': {'api_key': ''}}
        db.integrations.update_one({'_id': item['_id']}, update)
    db.phase1_migrations.update_one({'_id': 'phase1'}, {'$set': {'completed_at': now}}, upsert=True)
    ensure_indexes(db)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true', help='Apply after a verified external backup')
    mode.add_argument('--dry-run', action='store_true', help='Inspect only (default)')
    parser.add_argument('--backup-confirmed', action='store_true', help='Confirm a user-created backup exists')
    parser.add_argument('--source-json', type=Path, help='Explicit legacy app.db JSON file; never modified')
    args = parser.parse_args()
    if args.apply and not args.backup_confirmed:
        parser.error('--apply requires --backup-confirmed')
    validate_encryption_key()
    db = get_database()
    records = load_source(args.source_json) if args.source_json else source_records(db)
    conflicts = inspect(records)
    if args.source_json:
        conflicts.extend(inspect_import_target(records, source_records(db)))
    for name, items in records.items():
        print(f'{name}: {len(items)} record(s)')
    for conflict in conflicts:
        print(f'CONFLICT {conflict}')
    if conflicts:
        return 2
    if not args.apply:
        print('Dry run only. No changes made.')
        return 0
    verify_transactions()
    if args.source_json:
        import_source(db, records)
        records = source_records(db)
    try:
        migrate(db, records)
    except (DuplicateKeyError, ValueError) as exc:
        print(f'Migration stopped: {exc}', file=sys.stderr)
        return 2
    print('Phase 1 migration applied. Re-run --dry-run to verify counts.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
