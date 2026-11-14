import copy
import json
import re

import pytest

from app.red_team import plugins
from app.red_team.plugins import CatalogError, validate

RAW = json.loads(plugins.CATALOG_PATH.read_text(encoding='utf-8'))


def broken(mutate):
    data = copy.deepcopy(RAW)
    mutate(data)
    return data


def rejects(mutate, *words):
    with pytest.raises(CatalogError) as error:
        validate(broken(mutate))
    for word in words:
        assert word in str(error.value)


def test_real_catalog_counts_and_version():
    assert plugins.CATALOG_VERSION == 'synthetic-catalog-3'
    assert 'synthetic' in plugins.CATALOG_SOURCE
    assert len(plugins.PLUGINS) == 8 and len(plugins.STRATEGIES) == 8 and len(plugins.CONTROLS) == 5
    assert all(4 <= len(p['templates']) <= 6 for p in plugins.PLUGINS.values())


def test_decided_plugin_metadata():
    expected = {'prompt-extraction': 'high', 'pii': 'high', 'direct-injection': 'high', 'indirect-injection': 'high',
                'tool-injection': 'high', 'hijacking': 'medium', 'harmful': 'high', 'excessive-agency': 'high'}
    assert {k: v['severity'] for k, v in plugins.PLUGINS.items()} == expected
    assert {p['group'] for p in plugins.PLUGINS.values()} == set(plugins.GROUPS)
    assert plugins.PLUGINS['tool-injection']['evidence_type'] == 'tool_call'


def test_strategies_match_decisions():
    assert plugins.STRATEGY_IDS[0] == 'basic'
    efforts = {k: v['effort'] for k, v in plugins.STRATEGIES.items()}
    assert {k for k, v in efforts.items() if v == 'medium'} == {'roleplay', 'hypothetical'}
    assert {v['group'] for v in plugins.STRATEGIES.values()} == set(plugins.STRATEGY_GROUPS)


def test_registries_are_read_only():
    with pytest.raises(TypeError):
        plugins.PLUGINS['x'] = {}
    with pytest.raises(TypeError):
        plugins.PLUGINS['pii']['severity'] = 'low'
    assert isinstance(plugins.PLUGINS['pii']['templates'], tuple)


def test_accessors_and_fill():
    assert plugins.get_plugin('pii')['name'] == 'Personal data leak'
    assert plugins.get_strategy('hex')['group'] == 'Encodings'
    with pytest.raises(CatalogError):
        plugins.get_plugin('nope')
    assert plugins.fill('a {marker} {"k":1} {other}', {'marker': 'M'}) == 'a M {"k":1} {other}'


def test_duplicate_plugin_id_rejected():
    rejects(lambda d: d['plugins'][1].update(id=d['plugins'][0]['id']), 'plugins.id', 'duplicate')


def test_duplicate_template_id_rejected():
    rejects(lambda d: d['plugins'][1]['templates'][0].update(id=d['plugins'][0]['templates'][0]['id']), 'templates.id', 'duplicate')


def test_unknown_severity_rejected():
    rejects(lambda d: d['plugins'][0].update(severity='severe'), 'severity')


def test_unknown_group_rejected():
    rejects(lambda d: d['plugins'][0].update(group='Other'), 'group')


def test_unknown_evidence_type_rejected():
    rejects(lambda d: d['plugins'][0].update(evidence_type='vibes'), 'evidence_type')


def test_three_templates_rejected():
    rejects(lambda d: d['plugins'][0].update(templates=d['plugins'][0]['templates'][:3]), 'templates')


def test_seven_templates_rejected():
    rejects(lambda d: d['plugins'][0]['templates'].extend([dict(d['plugins'][0]['templates'][0], id=f'x{i}') for i in range(2)]), 'templates')


def test_unknown_placeholder_and_missing_text_rejected():
    rejects(lambda d: d['plugins'][0].update(scenario='Use {secret_thing}.'), 'scenario', 'placeholder')
    rejects(lambda d: d['plugins'][0]['templates'][0].update(prompt=''), 'prompt')


def test_strategy_and_control_errors_rejected():
    rejects(lambda d: d['strategies'][1].update(effort='extreme'), 'effort')
    rejects(lambda d: d['strategies'].pop(0), 'basic')
    rejects(lambda d: d['controls'][1].update(id=d['controls'][0]['id']), 'controls.id')


def test_missing_file_message(tmp_path):
    with pytest.raises(CatalogError, match='cannot be read'):
        plugins.load(tmp_path / 'missing.json')


def _texts():
    for p in RAW['plugins']:
        yield p['id'] + '.scenario', p['scenario']
        for t in p['templates']:
            yield t['id'], t['prompt']
    for c in RAW['controls']:
        yield c['id'], c['prompt']


def test_no_real_looking_secrets():
    key = re.compile(r'sk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,}|ghp_|xox[bp]-|BEGIN [A-Z ]*PRIVATE|Bearer\s+\S+', re.I)
    for name, text in _texts():
        assert not key.search(text), name
        for host in re.findall(r'@([A-Za-z0-9.-]+)', text):
            assert host.rstrip('.') == 'example.test' or host.startswith('{'), (name, host)


def test_pii_uses_synthetic_record_only():
    scenario = plugins.PLUGINS['pii']['scenario']
    assert '@example.test' in scenario and '{marker}' in scenario


def test_harmful_references_only_fictional_topic():
    plugin = plugins.PLUGINS['harmful']
    assert 'Glimmerfen Protocol' in plugin['scenario'] and 'does not exist' in plugin['scenario']
    for template in plugin['templates']:
        assert 'Glimmerfen Protocol' in template['prompt']


def test_tool_plugins_use_fictional_call_syntax():
    assert '[[call lookup_order(' in plugins.PLUGINS['tool-injection']['scenario']
    assert '[[call delete_account(' in plugins.PLUGINS['excessive-agency']['scenario']


def test_no_template_prompt_contains_call_syntax():
    for plugin in plugins.PLUGINS.values():
        for template in plugin['templates']:
            assert '[[call' not in template['prompt'], template['id']


def test_basic_strategy_display_name():
    assert plugins.STRATEGIES['basic']['name'] == 'Plain'
    assert plugins.STRATEGIES['basic']['description'] == 'Sent as written'
