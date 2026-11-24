import pytest
from pydantic import ValidationError
from unittest.mock import MagicMock

from app.core.errors import DomainError
from app.red_team.config_builder import config_hash
from app.schemas.red_team import CloneRequest, LaunchRequest, TestConfig as Config, TestEdit as Edit
from app.services.red_team_service import RedTeamService, csv_safe


def valid(**changes):
    data = {
        'name': 'Security test',
        'purpose': 'Help users safely without exposing private records.',
        'integration_id': 'target',
        'model': 'target-model',
        'mode': 'raw',
        'plugins': ['pii:direct'],
        'strategies': [],
        'tests_per_plugin': 1,
        'grader': {'integration_id': 'grader', 'model': 'grader-model'},
        'threshold_score': .8,
    }
    data.update(changes)
    return data


def test_valid_shape_and_edit_version():
    assert Config(**valid()).grader.model == 'grader-model'
    assert Edit(**valid(version=2)).version == 2
    assert LaunchRequest(version=1).version == 1
    assert CloneRequest(mode='protected').mode == 'protected'


@pytest.mark.parametrize('changes,field', [
    ({'name': 'x'}, 'name'),
    ({'purpose': 'too short'}, 'purpose'),
    ({'plugins': []}, 'plugins'),
    ({'plugins': ['pii:direct', 'pii:direct']}, 'plugins'),
    ({'plugins': ['unknown']}, 'plugins'),
    ({'strategies': ['basic']}, 'strategies'),
    ({'strategies': ['base64', 'base64']}, 'strategies'),
    ({'tests_per_plugin': 0}, 'tests_per_plugin'),
    ({'tests_per_plugin': 11}, 'tests_per_plugin'),
    ({'grader': None}, 'grader'),
    ({'mode': 'protected', 'subject_user_id': None}, 'subject_user_id'),
])
def test_validation_limits(changes, field):
    with pytest.raises(ValidationError) as exc:
        Config(**valid(**changes))
    assert field in str(exc.value)


def test_200_call_cap_uses_strategy_multiplier():
    with pytest.raises(ValidationError) as exc:
        Config(**valid(
            plugins=['pii:direct', 'prompt-extraction', 'ssrf', 'rbac'],
            strategies=['goat'],
            tests_per_plugin=10,
        ))
    assert '200' in str(exc.value) and 'tests_per_plugin' in str(exc.value)


def test_extra_keys_are_rejected_everywhere():
    with pytest.raises(ValidationError):
        Config(**valid(seed=1))
    with pytest.raises(ValidationError):
        LaunchRequest(version=1, extra=True)
    with pytest.raises(ValidationError):
        CloneRequest(mode='raw', extra=True)


def test_suite_settings_allow_target_edits_but_reject_generation_drift():
    original = valid()
    suite = {'config_hash': config_hash(original)}
    RedTeamService._validate_suite_settings(valid(model='replacement', name='Renamed'), suite, original)
    with pytest.raises(DomainError) as exc:
        RedTeamService._validate_suite_settings(valid(plugins=['prompt-extraction']), suite, original)
    assert exc.value.code == 'suite_config_locked'


def test_comparison_waits_for_first_suite_and_reuses_it_when_available():
    db = MagicMock()
    service = RedTeamService(db)
    draft = {'_id': 'draft', 'company_id': 'company', 'comparison_group_id': 'group'}
    session = object()
    db.red_team_tests.find_one.side_effect = [None, {'status': 'generating'}]
    with pytest.raises(DomainError) as exc:
        service._suite_for_launch(draft, session)
    assert exc.value.code == 'suite_pending'
    db.red_team_tests.find_one.side_effect = None
    db.red_team_tests.find_one.return_value = {**draft, 'suite_id': 'suite'}
    stored = {'_id': 'suite'}
    db.red_team_suites.find_one.return_value = stored
    assert service._suite_for_launch(draft, session) == stored
    db.red_team_suites.find_one.assert_called_once_with({'_id': 'suite', 'company_id': 'company'}, session=session)


@pytest.mark.parametrize('value', ['=fixture', ' +fixture', '-fixture', '@fixture'])
def test_csv_export_neutralizes_formula_prefixes(value):
    assert csv_safe(value) == "'" + value
