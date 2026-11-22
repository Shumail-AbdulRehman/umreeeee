"""Tenant-scoped v3 reads; no writes or provider calls."""
import codecs
from hashlib import sha256

from app.core.errors import DomainError
from app.red_team.plugins import PLUGINS, STRATEGIES
from app.red_team.strategies import decoded_variants, normalize, StrategyError
from app.services.admin_common import serialize
from app.services.red_team_report_service import progress, TERMINAL_TEST_STATES
from app.services.red_team_report_v3 import build_report, outcome
from app.services.red_team_service import job_read, test_read

FILTERS = {'plugin': 'plugin_id', 'strategy': 'strategy_id', 'verdict': 'verdict',
           'verdict_source': 'verdict_source', 'case_kind': 'case_kind', 'state': 'state'}
CSV_COLUMNS = ['attack_index', 'attack_id', 'category', 'case_kind', 'state', 'verdict',
               'verdict_reason_code', 'prompt', 'response_text', 'error_code',
               'plugin_id', 'strategy_id', 'severity', 'verdict_source', 'judge_reason']


def scope(test):
    return {'company_id': test['company_id'], 'test_id': test['_id']}


def filter_query(test, filters):
    query = scope(test)
    for name, field in FILTERS.items():
        value = filters.get(name)
        if value:
            # Values are equality operands, never Mongo operators.
            query[field] = {'$eq': value}
    return query


def read_job(job, *, detail=False):
    row = job_read(job, detail=detail)
    row.update(serialize({key: job.get(key) for key in (
        'plugin_id', 'strategy_id', 'severity', 'verdict_source', 'execution_phase')}))
    row['plugin_name'] = PLUGINS.get(job.get('plugin_id'), {}).get('name', 'Control question')
    row['strategy_name'] = STRATEGIES.get(job.get('strategy_id'), {}).get('name', 'Plain')
    row['evidence'] = job.get('explanation') or job.get('verdict_reason_code')
    if detail:
        row['original_prompt'] = job.get('original_prompt')
        row['evidence_steps'] = job.get('evidence_steps', job.get('steps', []))
        judge = job.get('judge')
        row['judge'] = serialize({k: judge.get(k) for k in (
            'verdict', 'reason', 'model', 'latency_ms', 'cost', 'error_code', 'attempts', 'rubric_version'
        )}) if judge else None
        decoded = decoded_response(row, job)
        if decoded is not None:
            row['decoded_response'] = decoded
    return row


def decoded_response(row, job):
    raw = row.get('response_text')
    if not raw or row.get('response_withheld') or row.get('content_expired'):
        return None
    try:
        variants = decoded_variants(raw)[1:]
        markers = [job.get(k) for k in ('failure_marker', 'refusal_token', 'control_answer')]
        # ROT13 and leetspeak can transform any prose. Display them only when
        # they reveal known evidence; base64/hex must actually decode text.
        mechanical = {codecs.decode(raw, 'rot13'),
                      raw.casefold().translate(str.maketrans('431057', 'aeiost'))}
        for text in variants:
            if normalize(text) == normalize(raw):
                continue
            if text not in mechanical or any(m and normalize(m) in normalize(text) for m in markers):
                return text
    except StrategyError:
        pass
    return None


def results(db, test, page=1, page_size=20, filters=None):
    query = filter_query(test, filters or {})
    jobs = list(db.red_team_jobs.find(scope(test), {'state': 1, 'verdict': 1, 'case_kind': 1}))
    attacks = [job for job in jobs if job.get('case_kind') == 'adversarial']
    counts = {'all': len(jobs), 'controls': len(jobs) - len(attacks)}
    for label, verdict in [('unsafe', 'fail'), ('defended', 'pass'),
                           ('inconclusive', 'inconclusive'), ('errors', 'error')]:
        counts[label] = sum(outcome(job) == verdict for job in attacks)
    rows = db.red_team_jobs.find(query).sort('attack_index', 1).skip((page - 1) * page_size).limit(page_size)
    return {'items': [read_job(job) for job in rows], 'page': page, 'page_size': page_size,
            'total': db.red_team_jobs.count_documents(query), 'counts': counts}


def paired_test(db, test):
    if not test.get('comparison_group_id') or not test.get('manifest_hash'):
        return None
    return db.red_team_tests.find_one({
        'company_id': test['company_id'], 'format': 'plugins', '_id': {'$ne': test['_id']},
        'comparison_group_id': test['comparison_group_id'], 'manifest_hash': test['manifest_hash'],
        'mode': 'protected' if test['mode'] == 'raw' else 'raw',
        'status': {'$in': sorted(TERMINAL_TEST_STATES)},
    }, sort=[('finished_at', -1), ('_id', -1)])


def result_detail(db, test, job):
    if job.get('company_id') != test['company_id'] or job.get('test_id') != test['_id']:
        raise DomainError(404, 'not_found', 'Result not found')
    row = read_job(job, detail=True)
    paired = paired_test(db, test)
    other = db.red_team_jobs.find_one({**scope(paired), 'attack_index': job['attack_index']}) if paired else None
    row['paired'] = {key: other.get(key) for key in (
        'verdict', 'verdict_source', 'prevention_stage')} if other else None
    return {'result': row}


def previous_test(db, test):
    if not test.get('finished_at'):
        return None
    query = {'company_id': test['company_id'], 'format': 'plugins', '_id': {'$ne': test['_id']},
             'status': {'$in': sorted(TERMINAL_TEST_STATES)},
             'finished_at': {'$lt': test['finished_at']}}
    for key in ('integration_id', 'model', 'mode'):
        query[key] = test.get(key)
    for key in ('plugins', 'strategies'):
        values = sorted(set(test.get(key, [])) | ({'basic'} if key == 'strategies' else set()))
        # Compare sets to tolerate order and older documents omitting basic.
        if key == 'strategies':
            query['$expr'] = {'$setEquals': [{'$setUnion': [{'$ifNull': ['$strategies', []]}, ['basic']]}, values]}
        else:
            query[key] = {'$all': values, '$size': len(values)}
    return db.red_team_tests.find_one(query, sort=[('finished_at', -1), ('_id', -1)])


def report(db, test):
    def jobs(t):
        return list(db.red_team_jobs.find(scope(t)))
    current = jobs(test)
    paired, previous = paired_test(db, test), previous_test(db, test)
    payload = build_report(test, current, (paired, jobs(paired)) if paired else None,
                           (previous, jobs(previous)) if previous else None)
    snapshot = test.get('config_snapshot') or {}
    unique = len({j.get('template_id', j.get('attack_id')) for j in current if j['case_kind'] == 'adversarial'})
    payload.update({
        'test': test_read(test), 'progress': progress(current, test),
        'catalog_version': test.get('catalog_version'), 'evaluator_version': test.get('evaluator_version'),
        'manifest_hash': test.get('manifest_hash'), 'adversarial_unique_templates': unique,
        'adversarial_repetitions': max(0, test['num_attacks'] - unique), 'control_templates': 5,
        'snapshot': {'integration_name': snapshot.get('integration_name'), 'provider': snapshot.get('provider'),
                     'model': test.get('model'), 'temperature': snapshot.get('temperature'),
                     'max_tokens': snapshot.get('max_tokens'),
                     'system_instruction_sha256': sha256(snapshot.get('system_instruction', '').encode()).hexdigest() if snapshot else None,
                     'policy_versions': [{'id': str(p['_id']), 'name': p['name'], 'version': p['version']}
                                         for p in snapshot.get('policy_snapshots', [])]},
        'partial': payload['provisional'],
        'limitations': ['Synthetic exact evidence and optional model judgement, not universal model safety',
                        'Provider outputs may vary between runs',
                        'Unavailable or inconclusive jobs are excluded from score'],
    })
    return serialize(payload)


def csv_safe(value):
    text = str(value if value is not None else '')
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else text


def export_rows(db, test, *, csv=False):
    rows = []
    for job in db.red_team_jobs.find(scope(test)).sort('attack_index', 1):
        row = read_job(job, detail=True)
        row.pop('scenario_system', None)
        row['judge_reason'] = (row.get('judge') or {}).get('reason')
        rows.append({k: csv_safe(row.get(k)) for k in CSV_COLUMNS} if csv else row)
    return rows
