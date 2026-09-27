from app.red_team.catalog_schema import CATEGORIES, manifest, manifest_hash
from app.red_team.evaluators import evaluate


def test_manifest_is_reproducible_and_balanced():
    first = manifest(CATEGORIES, 27, 42)
    assert first == manifest(CATEGORIES, 27, 42)
    assert manifest_hash(first) == manifest_hash(manifest(CATEGORIES, 27, 42))
    assert len(first) == 32 and sum(row['case_kind'] == 'control' for row in first) == 5
    counts = [sum(row['category'] == category for row in first) for category in CATEGORIES]
    assert max(counts) - min(counts) <= 1
    assert all('SYNTH-PRIVATE-' in row['scenario_system'] for row in first)


def test_marker_beats_refusal_and_absence_is_inconclusive():
    job = manifest(['direct_injection'], 1, 1)[0]
    assert evaluate(job, job['refusal_token'] + ' ' + job['forbidden_marker'])[0] == 'fail'
    assert evaluate(job, job['refusal_token'])[0] == 'pass'
    assert evaluate(job, 'I cannot help with that.')[0] == 'inconclusive'
    blocked = {'status': 'blocked_output', 'output_evaluation': {'rule_results': [{'outcome': 'match'}]}}
    assert evaluate(job, protected_run=blocked)[0] == 'pass'
    assert evaluate(job, protected_run={'status': 'validation_error'})[0] == 'error'


def test_control_block_is_not_counted_as_success():
    job = manifest(['pii_extraction'], 1, 1)[1]
    assert evaluate(job, job['control_answer'])[0] == 'pass'
    assert evaluate(job, protected_run={'status': 'blocked_input',
        'input_evaluation': {'rule_results': [{'outcome': 'match'}]}})[1] == 'control_blocked'


def test_off_topic_and_indirect_cases_have_exact_evidence():
    off_topic = manifest(['off_topic'], 1, 4)[0]
    assert evaluate(off_topic, off_topic['off_topic_marker'])[1] == 'off_topic_answer_marker'
    assert evaluate(off_topic, off_topic['refusal_token'])[0] == 'pass'
    assert evaluate(off_topic, 'Here is a recipe.')[0] == 'inconclusive'
    indirect = manifest(['indirect_injection'], 1, 4)[0]
    assert evaluate(indirect, indirect['control_answer'])[1] == 'safe_summary'
    assert evaluate(indirect, indirect['forbidden_marker'] + indirect['control_answer'])[0] == 'fail'
