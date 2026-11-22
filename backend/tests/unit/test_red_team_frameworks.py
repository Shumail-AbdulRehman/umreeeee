import pytest

from app.red_team import frameworks as fw

PLUGINS = set(fw.PLUGIN_IDS)


def test_plugin_ids_are_the_eight_fixed():
    assert len(fw.PLUGIN_IDS) == 8


def test_totals():
    totals = {f["id"]: f["total"] for f in fw.framework_catalog()}
    assert totals == {"owasp": 10, "atlas": 16, "nist": 21, "eu": 14}


def test_every_mapped_plugin_is_fixed_and_keys_unique():
    for f in fw.load_frameworks():
        keys = [c["key"] for c in f["controls"]]
        assert len(keys) == len(set(keys))
        for c in f["controls"]:
            assert set(c["plugins"]) <= PLUGINS


def test_owasp_ids_and_coverage_with_all_plugins():
    owasp = next(f for f in fw.load_frameworks() if f["id"] == "owasp")
    assert [c["id"] for c in owasp["controls"]] == [f"LLM{i:02d}" for i in range(1, 11)]
    covered = [fw.covered_controls(PLUGINS, "owasp")]
    ids = {c["key"].upper() for c in owasp["controls"] if c["key"] in covered[0]}
    assert ids == {"LLM01", "LLM02", "LLM05", "LLM06", "LLM07"}


def test_atlas_ids_are_null_and_names_present():
    atlas = next(f for f in fw.load_frameworks() if f["id"] == "atlas")
    assert all(c["id"] is None and c["name"] for c in atlas["controls"])


def test_catalog_per_plugin_lists():
    owasp = next(f for f in fw.framework_catalog() if f["id"] == "owasp")
    assert owasp["plugins"]["tool-injection"] == ["llm05", "llm06"]
    assert set(owasp["plugins"]) == PLUGINS


def _by_key(result, framework):
    return {c["key"]: c for c in result[framework]["controls"]}


def test_failed_when_any_worked():
    r = fw.compliance({"prompt-extraction": {"decided": 4, "worked": 1}})
    c = _by_key(r, "owasp")
    assert c["llm01"]["status"] == c["llm07"]["status"] == "failed"
    assert (c["llm01"]["worked"], c["llm01"]["decided"]) == (1, 4)


def test_passed_when_decided_none_worked():
    r = fw.compliance({"tool-injection": {"decided": 5, "worked": 0}})
    c = _by_key(r, "owasp")
    assert c["llm05"]["status"] == "passed" and c["llm05"]["reason"] is None


def test_not_tested_reasons():
    r = fw.compliance({"tool-injection": {"decided": 0, "worked": 0}})
    c = _by_key(r, "owasp")
    assert c["llm05"]["status"] == "not_tested"
    assert c["llm05"]["reason"] == fw.UNDECIDED_REASON
    assert c["llm01"]["reason"] == fw.NOT_SELECTED_REASON
    assert c["llm03"]["reason"] == "Chat attacks cannot exercise it"
    assert c["llm08"]["reason"] == "Needs a retrieval target"
    assert c["llm04"]["reason"] == fw.NO_PLUGIN_REASON


def test_empty_counts_all_not_tested():
    r = fw.compliance({})
    assert all(f["not_tested"] == f["total"] for f in r.values())


def test_sorting_failed_passed_not_tested_stable():
    r = fw.compliance(
        {"prompt-extraction": {"decided": 2, "worked": 1}, "tool-injection": {"decided": 2, "worked": 0}}
    )
    controls = r["owasp"]["controls"]
    statuses = [c["status"] for c in controls]
    assert statuses == sorted(statuses, key=lambda s: {"failed": 0, "passed": 1, "not_tested": 2}[s])
    assert [c["key"] for c in controls if c["status"] == "failed"] == ["llm01", "llm02", "llm07"]
    nt = [c["key"] for c in controls if c["status"] == "not_tested"]
    assert nt == sorted(nt)
    assert r["owasp"]["failed"] == 3 and r["owasp"]["passed"] == 2


def test_shared_control_aggregates_plugins():
    r = fw.compliance({"tool-injection": {"decided": 3, "worked": 0}, "excessive-agency": {"decided": 2, "worked": 2}})
    c = _by_key(r, "owasp")["llm06"]
    assert (c["status"], c["worked"], c["decided"]) == ("failed", 2, 5)


def test_validation_rejects_bad_data():
    good = fw.load_frameworks()
    bad = {"frameworks": good}
    bad["frameworks"][0]["controls"][0]["plugins"] = ["promptfoo-thing"]
    with pytest.raises(fw.FrameworkDataError):
        fw._validate(bad)
    dup = {"frameworks": fw.load_frameworks()}
    dup["frameworks"][1]["controls"][1]["key"] = dup["frameworks"][1]["controls"][0]["key"]
    with pytest.raises(fw.FrameworkDataError):
        fw._validate(dup)


def test_harmful_not_mapped_to_untested_topics():
    by_fw = {f["id"]: {c["key"]: c for c in f["controls"]} for f in fw.load_frameworks()}
    for fid, key in [("nist", "measure-2.11"), ("nist", "measure-2.7"), ("eu", "annex3-migration-border")]:
        assert "harmful" not in by_fw[fid][key]["plugins"]
    assert "tool-injection" in by_fw["nist"]["measure-2.7"]["plugins"]
    assert "pii" in by_fw["eu"]["annex3-migration-border"]["plugins"]
    assert "harmful" in by_fw["nist"]["measure-2.6"]["plugins"]
