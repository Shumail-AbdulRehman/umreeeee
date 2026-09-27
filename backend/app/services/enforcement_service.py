from copy import deepcopy
from time import monotonic

from bson import ObjectId

from app.core import config
from app.core.errors import DomainError
from app.validators.registry import registry
from app.services.remote_detection import evaluate_catalog
from app.services.policy_catalog import selected_for_group


def resolve_policies(db, company_id, integration_id, group_ids, session=None):
    policies = list(db.policies.find({'company_id': ObjectId(company_id), 'status': 'active'}, session=session))
    matches = []
    active_groups = set(group_ids)
    for policy in policies:
        scope = policy.get('scope', {})
        groups = set(scope.get('group_ids', []))
        integrations = set(scope.get('integration_ids', []))
        if (policy.get('managed_catalog') or policy.get('assignment_mode') == 'explicit_groups') and not groups:
            continue
        if (not groups or groups & active_groups) and (not integrations or ObjectId(integration_id) in integrations):
            effective = deepcopy(policy)
            if policy.get('managed_catalog'):
                # Combine only this user's assigned groups, then call the detector once.
                selected = {entry_id for group_id in groups & active_groups
                            for entry_id in selected_for_group(policy, group_id)}
                available = [entry.get('pattern_id') or entry.get('id') for entry in policy['entries']]
                effective['selected_entry_ids'] = [entry_id for entry_id in available if entry_id in selected]
                # Preserve invalid IDs for the strict detector adapter to reject, never silently pass.
                effective['selected_entry_ids'] += sorted(selected - set(available))
                for rule in effective['rules']:
                    if rule['type'] == 'catalog':
                        rule['config']['selected_entry_ids'] = effective['selected_entry_ids'][:]
            matches.append(effective)
    if len(matches) > 50 or sum(len(p['rules']) for p in matches) > 500:
        raise DomainError(503, 'validation_limit', 'Too many applicable policies or rules')
    return matches


def evaluate_stage(policies, stage, fields):
    start = monotonic()
    results, matched, errors = [], [], []
    for policy in policies:
        if stage not in policy.get('stages', []):
            continue
        policy_hit = False
        for rule in policy['rules']:
            for field, text in fields.items():
                if (monotonic() - start) * 1000 > config.VALIDATION_STAGE_TIMEOUT_MS:
                    item = {'rule_id': rule['rule_id'], 'type': rule['type'], 'field': field,
                            'outcome': 'error', 'reason_code': 'stage_timeout', 'evidence': [],
                            'duration_ms': 0, 'implementation_version': None}
                elif rule['type'] == 'catalog':
                    if not text:
                        continue
                    item = evaluate_catalog(policy, rule, text, field,
                        max(0, config.VALIDATION_STAGE_TIMEOUT_MS / 1000 - (monotonic() - start)))
                else:
                    item = registry.evaluate(rule, text, field)
                item['policy_id'] = policy['_id']
                item['policy_version'] = policy['version']
                item['policy_name'] = policy.get('name', policy.get('category', 'Policy'))
                item['policy_category'] = policy.get('category')
                results.append(item)
                policy_hit |= item['outcome'] == 'match'
                if item['outcome'] == 'error':
                    errors.append(item['reason_code'])
        if policy_hit:
            matched.append(policy)
    applicable = [p for p in policies if stage in p.get('stages', [])]
    return {'state': 'not_evaluated' if not applicable else 'incomplete' if errors else 'evaluated',
            'evaluation_complete': not errors and bool(applicable), 'rule_results': results,
            'matched_policy_ids': [p['_id'] for p in matched],
            'checked_fields': list(fields), 'duration_ms': round((monotonic() - start) * 1000, 3),
            'errors': errors}, matched


def decision(evaluation, matched, stage):
    if any(p['action'] == 'BLOCK' for p in matched):
        return 'blocked_' + stage
    if evaluation['errors']:
        return 'validation_error'
    return 'allowed'
