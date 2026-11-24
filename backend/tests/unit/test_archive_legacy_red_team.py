from pathlib import Path

from bson import ObjectId, json_util
import pytest

from scripts import archive_legacy_red_team as archive


class Result:
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count


class Collection:
    def __init__(self, rows):
        self.rows = list(rows)

    def find(self, _query, session=None):
        return [dict(row) for row in self.rows]

    def delete_many(self, query, session=None):
        ids = set(query["_id"]["$in"])
        before = len(self.rows)
        self.rows = [row for row in self.rows if row["_id"] not in ids]
        return Result(before - len(self.rows))


class Transaction:
    def __init__(self, callback=None):
        self.callback = callback

    def __enter__(self):
        if self.callback:
            callback, self.callback = self.callback, None
            callback()
        return self

    def __exit__(self, *_args):
        return False


class Session(Transaction):
    def start_transaction(self):
        return Transaction(self.callback)


class Client:
    def __init__(self, callback=None):
        self.callback = callback

    def start_session(self):
        return Session(self.callback)


class Database:
    def __init__(self, tests, jobs, callback=None):
        self.red_team_tests = Collection(tests)
        self.red_team_jobs = Collection(jobs)
        self.client = Client(callback)


def legacy(company=None, **changes):
    row = {
        "_id": ObjectId(), "company_id": company or ObjectId(), "format": "categories",
        "attack_categories": ["direct_injection"], "num_attacks": 1, "status": "completed",
    }
    row.update(changes)
    return row


def job(test, **changes):
    row = {
        "_id": ObjectId(), "company_id": test["company_id"], "test_id": test["_id"],
        "state": "finished", "response_ciphertext": "ciphertext-only",
    }
    row.update(changes)
    return row


def test_classifier_excludes_promptfoo_unknown_and_malformed():
    assert archive.is_legacy_test(legacy())
    assert archive.is_legacy_test(legacy(format="plugins", plugins=["pii"], num_attacks=3))
    assert not archive.is_legacy_test(legacy(engine="promptfoo"))
    assert not archive.is_legacy_test(legacy(engine="something-else"))
    assert not archive.is_legacy_test(legacy(format="mystery"))
    assert not archive.is_legacy_test(legacy(company_id="not-an-id"))


def test_dry_run_scopes_jobs_by_company_and_test():
    company = ObjectId()
    selected = legacy(company)
    other = legacy(ObjectId(), engine="promptfoo")
    rows = [job(selected), job(selected, company_id=ObjectId()), job(other)]
    result = archive.dry_run(Database([selected, other], rows))
    assert result == {
        "companies": [{"company_id": str(company), "tests": 1, "jobs": 1}],
        "tests": 1, "jobs": 1,
    }


def test_apply_writes_owner_only_archive_before_exact_deletes(tmp_path):
    test = legacy()
    related = job(test)
    db = Database([test], [related])
    output = tmp_path / "legacy.json"
    result = archive.apply_archive(db, output)
    assert result["tests"] == result["jobs"] == 1
    assert output.stat().st_mode & 0o777 == 0o600
    payload = json_util.loads(output.read_text())
    assert payload["tests"][0]["_id"] == test["_id"]
    assert payload["jobs"][0]["response_ciphertext"] == "ciphertext-only"
    assert db.red_team_tests.rows == [] and db.red_team_jobs.rows == []
    assert archive.apply_archive(db, tmp_path / "unused.json")["archive"] is None


def test_active_jobs_refuse_before_writing(tmp_path):
    test = legacy()
    db = Database([test], [job(test, state="running")])
    output = tmp_path / "legacy.json"
    with pytest.raises(RuntimeError, match="active_legacy_jobs"):
        archive.apply_archive(db, output)
    assert not output.exists()
    assert len(db.red_team_tests.rows) == 1


def test_existing_or_failed_archive_never_deletes(tmp_path, monkeypatch):
    test = legacy()
    db = Database([test], [job(test)])
    output = tmp_path / "legacy.json"
    output.write_text("keep")
    with pytest.raises(FileExistsError):
        archive.apply_archive(db, output)
    assert output.read_text() == "keep"
    assert len(db.red_team_tests.rows) == 1

    def failed(*_args):
        raise OSError("synthetic write failure")

    monkeypatch.setattr(archive, "write_archive", failed)
    with pytest.raises(OSError):
        archive.apply_archive(db, tmp_path / "other.json")
    assert len(db.red_team_tests.rows) == 1


def test_changed_data_keeps_archive_and_refuses_delete(tmp_path):
    test = legacy()
    db = None

    def change():
        db.red_team_tests.rows[0]["status"] = "changed"

    db = Database([test], [job(test)], callback=change)
    output = tmp_path / "legacy.json"
    with pytest.raises(RuntimeError, match="legacy_data_changed"):
        archive.apply_archive(db, output)
    assert output.exists()
    assert len(db.red_team_tests.rows) == len(db.red_team_jobs.rows) == 1


def test_cli_requires_output_for_apply():
    with pytest.raises(SystemExit):
        archive.main(["--apply"], database=Database([], []))
