import pytest

from app.services.policy_catalog import read_catalog


def test_catalog_preserves_all_fields_and_hashes_source(tmp_path):
    source = tmp_path / 'catalog.txt'
    source.write_text("[{'pattern_id': 'email', 'name': 'Email', 'category': 'PII', 'extra': True}]")
    catalog = read_catalog(source, 'dlp')
    assert catalog['entry_count'] == 1
    assert catalog['entries'][0]['extra'] is True
    assert len(catalog['source_sha256']) == 64


@pytest.mark.parametrize('text', ["[]", "{}", "[{'id': 'x'}, {'id': 'x'}]",
                                 "[{'title': 'Missing ID'}]", "__import__('os').getcwd()"])
def test_invalid_catalog_rejected_without_execution(tmp_path, text):
    source = tmp_path / 'catalog.txt'
    source.write_text(text)
    with pytest.raises((ValueError, SyntaxError)):
        read_catalog(source, 'guardrail')
