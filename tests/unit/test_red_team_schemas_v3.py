import pytest
from pydantic import ValidationError
from app.schemas.red_team import TestConfig as Config, TestEdit as Edit
from app.red_team.plugins import PLUGIN_IDS

BASE = {'name': 'Synthetic v3', 'integration_id': 'target', 'model': 'fake', 'mode': 'raw',
        'plugins': ['pii'], 'strategies': [], 'tests_per_plugin': 1}


def test_v3_infers_format_and_accepts_judge_and_edit():
    payload = Config(**BASE, judge={'integration_id': 'judge', 'model': 'fake'})
    assert payload.format == 'plugins' and payload.judge.model == 'fake'
    assert Edit(**payload.model_dump(), version=2).version == 2


@pytest.mark.parametrize('patch,field', [
    ({'plugins': ['unknown']}, 'plugins'), ({'plugins': ['pii', 'pii']}, 'plugins'),
    ({'plugins': []}, 'plugins'), ({'strategies': ['base64', 'base64']}, 'strategies'),
    ({'strategies': ['unknown']}, 'strategies'), ({'tests_per_plugin': 11}, 'tests_per_plugin'),
    ({'tests_per_plugin': 0}, 'tests_per_plugin'), ({'tests_per_plugin': True}, 'tests_per_plugin'),
    ({'plugins': list(PLUGIN_IDS), 'strategies': ['base64', 'rot13'], 'tests_per_plugin': 5}, 'tests_per_plugin'),
    ({'num_attacks': 101}, 'num_attacks'), ({'num_attacks': 2}, 'num_attacks'),
    ({'judge': {'integration_id': 'j', 'model': ''}}, 'judge.model'),
    ({'attack_categories': ['direct_injection']}, 'attack_categories'),
])
def test_v3_rejects_invalid_fields_at_the_field_path(patch, field):
    with pytest.raises(ValidationError) as exc:
        Config(**{**BASE, **patch})
    assert field in {'.'.join(map(str, error['loc'])) for error in exc.value.errors()}


def test_limit_counts_plain_once():
    payload = Config(**{**BASE, 'plugins': list(PLUGIN_IDS)[:5], 'strategies': ['basic', 'base64'], 'tests_per_plugin': 10})
    assert payload.format == 'plugins'  # 5 x 2 x 10 = 100, plus controls


def test_legacy_config_still_validates():
    payload = Config(name='Synthetic legacy', integration_id='target', model='fake', mode='raw',
                     attack_categories=['direct_injection'], num_attacks=1)
    assert payload.format == 'categories' and payload.num_attacks == 1


@pytest.mark.parametrize('field', ['attack_categories', 'num_attacks'])
def test_legacy_requires_its_own_fields(field):
    values = {'name': 'Legacy', 'integration_id': 'i', 'model': 'f', 'mode': 'raw',
              'attack_categories': ['direct_injection'], 'num_attacks': 1}
    values.pop(field)
    with pytest.raises(ValidationError) as exc:
        Config(**values)
    assert exc.value.errors()[0]['loc'] == (field,)
