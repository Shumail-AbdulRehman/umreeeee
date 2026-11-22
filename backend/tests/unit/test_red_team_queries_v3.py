import base64
import pytest
from app.services.red_team_queries_v3 import filter_query, decoded_response, csv_safe


def test_filters_are_scoped_and_cannot_inject_operators():
    test = {'_id': 'test', 'company_id': 'company'}
    assert filter_query(test, {'plugin': 'pii', 'strategy': 'base64', 'verdict_source': 'judge',
                               'verdict': 'fail', 'state': 'finished', 'case_kind': 'adversarial',
                               'company_id': 'other'}) == {
        'test_id': 'test', 'company_id': 'company', 'plugin_id': {'$eq': 'pii'},
        'strategy_id': {'$eq': 'base64'}, 'verdict_source': {'$eq': 'judge'},
        'verdict': {'$eq': 'fail'}, 'state': {'$eq': 'finished'}, 'case_kind': {'$eq': 'adversarial'}}
    assert filter_query(test, {'plugin': {'$ne': None}})['plugin_id'] == {'$eq': {'$ne': None}}


@pytest.mark.parametrize('flags', [{'response_withheld': True}, {'content_expired': True}])
def test_unavailable_response_is_never_decoded(flags):
    assert decoded_response({'response_text': base64.b64encode(b'SYNTH-PRIVATE-1234').decode(), **flags}, {}) is None


@pytest.mark.parametrize('text', ['ordinary prose', '', None, '123%%%'])
def test_undecodable_response_is_omitted(text):
    assert decoded_response({'response_text': text}, {}) is None


def test_base64_is_decoded():
    assert decoded_response({'response_text': base64.b64encode(b'SYNTH-PRIVATE-1234').decode()}, {}) == 'SYNTH-PRIVATE-1234'


@pytest.mark.parametrize('text', ['=formula', '+1', '-1', '@formula', '  =formula'])
def test_csv_formulas_are_neutralized(text):
    assert csv_safe(text) == "'" + text
