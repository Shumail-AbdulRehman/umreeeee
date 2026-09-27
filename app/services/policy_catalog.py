"""Import-only policy definitions. Catalog metadata is not executable validation code."""
import ast
import hashlib
from datetime import datetime, timezone
from pathlib import Path

KINDS = {'dlp': 'DLP policy', 'guardrail': 'Guardrail policy'}


def selected_for_group(policy, group_id):
    """Older assignments retain their shared selection until explicitly edited."""
    for assignment in policy.get('group_entry_selections', []):
        if str(assignment['group_id']) == str(group_id):
            return assignment['selected_entry_ids']
    return policy.get('selected_entry_ids', [
        entry.get('pattern_id') or entry.get('id') for entry in policy.get('entries', [])])


def read_catalog(path, kind):
    raw = Path(path).read_bytes()
    entries = ast.literal_eval(raw.decode('utf-8-sig'))
    key = 'pattern_id' if kind == 'dlp' else 'id'
    if not isinstance(entries, list) or not entries:
        raise ValueError('Catalog must be a nonempty list')
    ids = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get(key), str) or not entry[key]:
            raise ValueError(f'Invalid {kind} catalog entry')
        ids.append(entry[key])
    if len(ids) != len(set(ids)):
        raise ValueError(f'Duplicate IDs in {kind} catalog')
    return {'entries': entries, 'entry_count': len(entries),
            'source_file': Path(path).name, 'source_sha256': hashlib.sha256(raw).hexdigest()}


def import_catalogs(db, catalogs, session):
    """Idempotent import; preserve assignments and all historical records."""
    now = datetime.now(timezone.utc)
    for company in db.companies.find({}, {'_id': 1}, session=session):
        cid = company['_id']
        for old in db.policies.find({'company_id': cid, 'managed_catalog': {'$ne': True},
                                     'status': {'$ne': 'archived'}}, session=session):
            old.update(status='archived', updated_at=now, version=old.get('version', 1) + 1)
            db.policies.replace_one({'_id': old['_id']}, old, session=session)
            db.policy_versions.insert_one({'company_id': cid, 'policy_id': old['_id'],
                'version': old['version'], 'snapshot': old, 'created_at': now}, session=session)
            db.audit_events.insert_one({'company_id': cid, 'action': 'policy.legacy_archived',
                'resource_type': 'policy', 'resource_id': old['_id'], 'created_at': now,
                'actor_user_id': None, 'request_id': 'catalog-import'}, session=session)
        for kind, name in KINDS.items():
            catalog = catalogs[kind]
            query = {'company_id': cid, 'managed_catalog': True, 'category': kind}
            old = db.policies.find_one(query, session=session)
            if old and old.get('source_sha256') == catalog['source_sha256'] and 'selected_entry_ids' in old:
                continue
            available = [entry.get('pattern_id') or entry.get('id') for entry in catalog['entries']]
            selected = old.get('selected_entry_ids', available) if old else available
            # Do not silently discard removed selections on a source refresh.
            if not set(selected).issubset(available):
                raise ValueError('Catalog update removes selected entries; deselect them before importing')
            if old and any(not set(selection['selected_entry_ids']).issubset(available)
                           for selection in old.get('group_entry_selections', [])):
                raise ValueError('Catalog update removes group-selected entries; deselect them before importing')
            item = {**query, **catalog, 'name': name, 'name_normalized': name.casefold(),
                'description': 'Imported reference catalog; detection adapters are not yet configured.',
                'status': 'active', 'action': 'BLOCK', 'severity': 'high', 'match': 'any',
                'stages': ['input', 'output'], 'scope': {'group_ids': [], 'integration_ids': []},
                'assignment_mode': 'explicit_groups', 'enforcement_ready': False,
                'selected_entry_ids': selected,
                'rules': [{'rule_id': f'catalog-{kind}', 'type': 'catalog',
                           'config': {'kind': kind, 'selected_entry_ids': selected}}],
                'version': 1, 'created_at': now, 'updated_at': now}
            if old:
                item.update(_id=old['_id'], scope=old['scope'], created_at=old['created_at'],
                            version=old['version'] + 1)
                if 'group_entry_selections' in old:
                    item['group_entry_selections'] = old['group_entry_selections']
                db.policies.replace_one({'_id': old['_id']}, item, session=session)
            else:
                item['_id'] = db.policies.insert_one(item, session=session).inserted_id
            db.policy_versions.insert_one({'company_id': cid, 'policy_id': item['_id'],
                'version': item['version'], 'snapshot': item, 'created_at': now}, session=session)
            db.audit_events.insert_one({'company_id': cid, 'action': 'policy.catalog_imported',
                'resource_type': 'policy', 'resource_id': item['_id'], 'created_at': now,
                'actor_user_id': None, 'request_id': 'catalog-import',
                'after': {'category': kind, 'entry_count': catalog['entry_count'],
                          'source_sha256': catalog['source_sha256']}}, session=session)
