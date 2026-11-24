"""Recover promptfoo run leases without replaying target calls."""

from datetime import timedelta
import logging
import time
from uuid import uuid4

from pymongo import ReturnDocument

from app.core.config import RED_TEAM_EXECUTION_LEASE_SECONDS
from app.db.mongo import get_database
from app.services.admin_common import utcnow


logger = logging.getLogger(__name__)


def _fail_interrupted(db, job, test, token, now):
    with db.client.start_session() as session:
        with session.start_transaction():
            changed = db.red_team_jobs.update_one(
                {"_id": job["_id"], "company_id": job["company_id"], "state": "running",
                 "execution_lease_token": token},
                {"$set": {"state": "finished", "phase": "finished", "execution_phase": "finished",
                          "error_code": "interrupted", "finished_at": now},
                 "$unset": {"execution_lease_token": "", "execution_lease_expires_at": ""}},
                session=session,
            )
            if changed.matched_count != 1:
                return False
            db.red_team_tests.update_one(
                {"_id": test["_id"], "company_id": test["company_id"]},
                {"$set": {"status": "failed", "failure_reason": "interrupted",
                          "finished_at": now, "updated_at": now},
                 "$inc": {"execution_revision": 1}}, session=session,
            )
            return True


def recover(db, now=None):
    now = now or utcnow()
    counts = {"dispatch_reset": 0, "generating_requeued": 0,
              "interrupted_failed": 0, "parent_reconciled": 0}
    publishing = db.red_team_jobs.update_many(
        {"dispatch_state": "publishing", "dispatch_lease_expires_at": {"$lte": now},
         "state": {"$in": ["pending", "queued", "retry_wait"]}},
        {"$set": {"dispatch_state": "pending", "next_attempt_at": now},
         "$unset": {"dispatch_lease_token": "", "dispatch_lease_expires_at": ""}},
    )
    counts["dispatch_reset"] += publishing.modified_count
    published = db.red_team_jobs.update_many(
        {"dispatch_state": "published", "state": {"$in": ["pending", "queued"]},
         "published_at": {"$lt": now - timedelta(seconds=60)}},
        {"$set": {"dispatch_state": "pending", "next_attempt_at": now},
         "$inc": {"dispatch_generation": 1}},
    )
    counts["dispatch_reset"] += published.modified_count

    for stale in db.red_team_jobs.find({
        "kind": "run", "state": "running", "execution_lease_expires_at": {"$lte": now},
    }):
        token = str(uuid4())
        job = db.red_team_jobs.find_one_and_update(
            {"_id": stale["_id"], "company_id": stale["company_id"], "test_id": stale["test_id"],
             "kind": "run", "state": "running",
             "execution_lease_token": stale.get("execution_lease_token"),
             "execution_lease_expires_at": {"$lte": now}},
            {"$set": {"execution_lease_token": token,
                      "execution_lease_expires_at":
                          now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS)}},
            return_document=ReturnDocument.AFTER,
        )
        if not job:
            continue
        test = db.red_team_tests.find_one(
            {"_id": job["test_id"], "company_id": job["company_id"]},
        )
        if not test:
            continue
        phase = job.get("phase") or job.get("execution_phase")
        if phase in {"claimed", "generating", "logging_in"} and not test.get("suite_id"):
            result = db.red_team_jobs.update_one(
                {"_id": job["_id"], "company_id": job["company_id"], "state": "running",
                 "execution_lease_token": token},
                {"$set": {"state": "queued", "dispatch_state": "pending", "next_attempt_at": now,
                          "phase": "claimed", "execution_phase": "claimed"},
                 "$inc": {"dispatch_generation": 1},
                 "$unset": {"execution_lease_token": "", "execution_lease_expires_at": ""}},
            )
            if result.modified_count:
                db.red_team_tests.update_one(
                    {"_id": test["_id"], "company_id": test["company_id"],
                     "status": {"$in": ["generating", "running"]}},
                    {"$set": {"status": "queued", "updated_at": now}},
                )
                counts["generating_requeued"] += 1
        elif test.get("suite_id") or phase in {"evaluating", "importing"}:
            if _fail_interrupted(db, job, test, token, now):
                counts["interrupted_failed"] += 1

    for test in db.red_team_tests.find({
        "status": {"$in": ["queued", "generating", "running", "cancelling"]},
    }):
        job = db.red_team_jobs.find_one(
            {"company_id": test["company_id"], "test_id": test["_id"], "kind": "run"},
            sort=[("created_at", -1)],
        )
        if not job or job.get("state") not in {"finished", "cancelled"}:
            continue
        status = "cancelled" if job.get("state") == "cancelled" else "failed"
        result = db.red_team_tests.update_one(
            {"_id": test["_id"], "company_id": test["company_id"],
             "status": {"$in": ["queued", "generating", "running", "cancelling"]}},
            {"$set": {"status": status, "failure_reason": job.get("error_code"),
                      "finished_at": job.get("finished_at") or now, "updated_at": now},
             "$inc": {"execution_revision": 1}},
        )
        counts["parent_reconciled"] += result.modified_count
    return counts


def main(database=None, sleep=time.sleep, iterations=None):
    database = database or get_database()
    try:
        while iterations is None or iterations > 0:
            try:
                print(recover(database), flush=True)
            except Exception as exc:
                logger.warning("Red-team recovery retrying (%s)", type(exc).__name__)
            if iterations is not None:
                iterations -= 1
                if iterations == 0:
                    break
            sleep(15)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
