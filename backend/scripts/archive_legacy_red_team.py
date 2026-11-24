"""Archive the retired in-house Red Team records before removing them.

Dry-run is the default. ``--apply`` requires a new output path and must be run
during a maintenance window against a transaction-capable MongoDB deployment.
Credentials and stored ciphertext are never decrypted or printed.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import os
from pathlib import Path
import sys

from bson import ObjectId, json_util

from app.db.mongo import close_mongo_client, get_database


ACTIVE_STATES = {"pending", "queued", "retry_wait", "running"}
LEGACY_FORMATS = {"categories", "plugins"}
LEGACY_ENGINES = {None, "in_house", "legacy"}


def is_legacy_test(document):
    """Recognize only the two retired schemas; exclude current and unknown rows."""
    if not isinstance(document, dict):
        return False
    if not isinstance(document.get("_id"), ObjectId) or not isinstance(document.get("company_id"), ObjectId):
        return False
    if document.get("engine") not in LEGACY_ENGINES:
        return False
    format_name = document.get("format")
    if format_name not in LEGACY_FORMATS:
        return False
    if format_name == "categories":
        return isinstance(document.get("attack_categories"), list) and type(document.get("num_attacks")) is int
    return isinstance(document.get("plugins"), list) and type(document.get("num_attacks")) is int


def _fingerprint(document):
    return sha256(json_util.dumps(document, sort_keys=True).encode("utf-8")).hexdigest()


def collect(db, session=None):
    tests = [row for row in db.red_team_tests.find({}, session=session) if is_legacy_test(row)]
    keys = {(row["company_id"], row["_id"]) for row in tests}
    jobs = [
        row for row in db.red_team_jobs.find({}, session=session)
        if (row.get("company_id"), row.get("test_id")) in keys
    ]
    return tests, jobs


def summarize(tests, jobs):
    job_counts = Counter((job["company_id"] for job in jobs))
    rows = []
    for company_id, count in sorted(Counter(test["company_id"] for test in tests).items(), key=lambda item: str(item[0])):
        rows.append({"company_id": str(company_id), "tests": count, "jobs": job_counts[company_id]})
    return rows


def archive_document(tests, jobs):
    return {
        "schema": "sentinel-red-team-legacy-archive-v1",
        "created_at": datetime.now(timezone.utc),
        "tests": tests,
        "jobs": jobs,
    }


def write_archive(path, document):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        payload = json_util.dumps(document, indent=2).encode("utf-8")
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = -1
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            target.unlink()
        except OSError:
            pass
        raise
    if target.stat().st_mode & 0o077:
        raise RuntimeError("archive_permissions_invalid")
    return target


def apply_archive(db, output_path):
    tests, jobs = collect(db)
    active = [job for job in jobs if job.get("state") in ACTIVE_STATES]
    if active:
        raise RuntimeError(f"active_legacy_jobs:{len(active)}")
    if not tests:
        return {"companies": [], "tests": 0, "jobs": 0, "archive": None}

    expected_tests = {row["_id"]: _fingerprint(row) for row in tests}
    expected_jobs = {row["_id"]: _fingerprint(row) for row in jobs}
    target = write_archive(output_path, archive_document(tests, jobs))
    with db.client.start_session() as session:
        with session.start_transaction():
            current_tests, current_jobs = collect(db, session=session)
            if ({row["_id"]: _fingerprint(row) for row in current_tests} != expected_tests
                    or {row["_id"]: _fingerprint(row) for row in current_jobs} != expected_jobs):
                raise RuntimeError("legacy_data_changed")
            if any(job.get("state") in ACTIVE_STATES for job in current_jobs):
                raise RuntimeError("active_legacy_jobs")
            test_pairs = {(row["company_id"], row["_id"]) for row in current_tests}
            job_pairs = {(row["company_id"], row["test_id"]) for row in current_jobs}
            if not job_pairs.issubset(test_pairs):
                raise RuntimeError("legacy_scope_changed")
            if current_jobs:
                result = db.red_team_jobs.delete_many(
                    {"_id": {"$in": list(expected_jobs)}}, session=session,
                )
                if result.deleted_count != len(expected_jobs):
                    raise RuntimeError("legacy_jobs_delete_incomplete")
            result = db.red_team_tests.delete_many(
                {"_id": {"$in": list(expected_tests)}}, session=session,
            )
            if result.deleted_count != len(expected_tests):
                raise RuntimeError("legacy_tests_delete_incomplete")
    return {
        "companies": summarize(tests, jobs), "tests": len(tests), "jobs": len(jobs),
        "archive": str(target),
    }


def dry_run(db):
    tests, jobs = collect(db)
    return {"companies": summarize(tests, jobs), "tests": len(tests), "jobs": len(jobs)}


def _print_summary(result, applied=False):
    action = "archived" if applied else "would archive"
    print(f"{action}: {result['tests']} legacy tests and {result['jobs']} related jobs")
    for row in result["companies"]:
        print(f"company {row['company_id']}: {row['tests']} tests, {row['jobs']} jobs")
    if result.get("archive"):
        print(f"archive written: {result['archive']}")


def main(argv=None, database=None):
    parser = argparse.ArgumentParser(description="Dry-run or archive retired Red Team records")
    parser.add_argument("--apply", action="store_true", help="write archive then transactionally delete archived IDs")
    parser.add_argument("--output", help="new owner-only archive path; required with --apply")
    args = parser.parse_args(argv)
    if args.apply and not args.output:
        parser.error("--apply requires --output")
    if not args.apply and args.output:
        parser.error("--output is only valid with --apply")
    db = database or get_database()
    try:
        result = apply_archive(db, args.output) if args.apply else dry_run(db)
        _print_summary(result, args.apply)
        return 0
    except Exception as exc:
        print(f"legacy archive stopped: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        if database is None:
            close_mongo_client()


if __name__ == "__main__":
    raise SystemExit(main())
