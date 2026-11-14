from collections import Counter

import pytest

from app.red_team import plugins
from app.red_team.manifest_v3 import build_manifest, manifest_hash

ALL = list(plugins.PLUGIN_IDS)
FOUR = ['base64', 'rot13', 'roleplay']  # plus basic


def rows_for(**kw):
    args = {'plugins': ALL, 'strategies': FOUR, 'tests_per_plugin': 3, 'seed': 7}
    args.update(kw)
    return build_manifest(args['plugins'], args['strategies'], args['tests_per_plugin'], args['seed'])


def test_deterministic_and_seed_sensitive():
    a, b, c = rows_for(), rows_for(), rows_for(seed=8)
    assert a == b and manifest_hash(a) == manifest_hash(b)
    assert manifest_hash(a) != manifest_hash(c)
    assert {r['forbidden_marker'] for r in a}.isdisjoint(r['forbidden_marker'] for r in c)


def test_counts_and_pairs():
    rows = rows_for()
    adv = [r for r in rows if r['case_kind'] == 'adversarial']
    assert len(adv) == 96 and len(rows) - len(adv) == 5
    assert all(r['case_kind'] == 'control' for r in rows[-5:])
    assert [r['attack_index'] for r in rows] == list(range(101))
    assert set(Counter((r['plugin_id'], r['strategy_id']) for r in adv).values()) == {3}
    for pid in ALL:
        tids = [r['template_id'] for r in adv if r['plugin_id'] == pid and r['strategy_id'] == 'basic']
        assert len(set(tids)) == 3


def test_basic_always_included_and_row_fields():
    rows = rows_for(strategies=[], plugins=['harmful'], tests_per_plugin=2)
    assert {r['strategy_id'] for r in rows} == {'basic'}
    assert len(rows) == 7
    r = rows[0]
    for key in ('attack_index', 'case_kind', 'attack_id', 'plugin_id', 'strategy_id', 'severity', 'template_id',
                'original_prompt', 'prompt', 'scenario_system', 'evidence_type', 'forbidden_marker', 'off_topic_marker',
                'refusal_token', 'control_answer', 'tool_payload_marker', 'failure_marker'):
        assert key in r


@pytest.mark.parametrize('kwargs', [
    {'plugins': ['nope']}, {'strategies': ['nope']}, {'plugins': ['pii', 'pii']}, {'strategies': ['rot13', 'rot13']},
    {'plugins': []}, {'tests_per_plugin': 0}, {'tests_per_plugin': 11},
    {'plugins': ALL, 'strategies': ['base64', 'rot13', 'hex', 'roleplay', 'hypothetical', 'authority', 'leetspeak'],
     'tests_per_plugin': 2},
])
def test_validation_raises(kwargs):
    with pytest.raises(ValueError):
        rows_for(**kwargs)


def test_total_101_names_limit():
    with pytest.raises(ValueError, match='100'):
        build_manifest(ALL, ['base64', 'rot13', 'hex'], 4, 1)  # 8*4*4 = 128
    with pytest.raises(ValueError, match='100'):
        build_manifest(ALL[:7], ['base64', 'rot13'], 5, 1)  # 7*3*5 = 105


def test_markers_unique_and_isolated():
    rows = rows_for()
    keys = ('forbidden_marker', 'off_topic_marker', 'refusal_token', 'control_answer', 'tool_payload_marker')
    values = [r[k] for r in rows for k in keys]
    assert len(values) == len(set(values))
    for r in rows:
        if r['evidence_type'] == 'tool_call':
            assert r['failure_marker'] == r['tool_payload_marker']
            if r['strategy_id'] == 'basic':
                assert r['tool_payload_marker'] in r['prompt']
            continue
        for k in ('forbidden_marker', 'off_topic_marker', 'refusal_token', 'control_answer', 'tool_payload_marker'):
            assert r[k] not in r['prompt'] and r[k] not in r['original_prompt']


def test_failure_marker_and_scenario():
    for r in rows_for():
        et = r['evidence_type']
        if et == 'control':
            assert r['failure_marker'] is None and r['control_answer'] in r['scenario_system']
        elif et == 'off_topic':
            assert r['failure_marker'] == r['off_topic_marker'] and r['failure_marker'] in r['scenario_system']
        elif et == 'tool_call':
            assert r['failure_marker'] == r['tool_payload_marker']
        else:
            assert r['failure_marker'] == r['forbidden_marker'] and r['failure_marker'] in r['scenario_system']
        assert '{marker}' not in r['scenario_system'] and '{refusal}' not in r['original_prompt']
