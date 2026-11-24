"""Execute one durable promptfoo Red Team run for each launch job."""

from datetime import timedelta
import json
import logging
import os
from pathlib import Path
import sys
from threading import Event, Thread
import time
from uuid import uuid4

from bson import BSON, ObjectId
import pika
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.core.config import (
    PROMPTFOO_API_KEY,
    PROMPTFOO_CLOUD_HOST,
    PROMPTFOO_WORKSPACE_ROOT,
    RED_TEAM_EXECUTION_LEASE_SECONDS,
    RED_TEAM_QUEUE_NAME,
)
from app.db.mongo import get_database
from app.queue.rabbit import connection, declare
from app.red_team.bridge_server import BridgeServer, make_executor
from app.red_team.catalog import PROMPTFOO_VERSION
from app.red_team.config_builder import build_clone_config, build_redteam_config, subprocess_env
from app.red_team.results_parser import ArtifactParseError, decide, parse_results_json, suite_breakdown
from app.red_team.runner import PromptfooRun
from app.red_team.runtime_paths import BACKEND_ROOT, RUNTIME_ROOT
from app.repositories.company_repository import CompanyRepository
from app.repositories.llm_integration_repository import LLMIntegrationRepository
from app.services.admin_common import utcnow
from app.services.content_service import encrypt
from app.services.provider_service import ProviderService
from app.services.red_team_report import build_report


logger = logging.getLogger(__name__)
_RESULTS_LIMIT = 100 * 1024 * 1024
_SUITE_LIMIT = 5 * 1024 * 1024


class CredentialUnavailable(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def heartbeat(db):
    now = utcnow()
    db.worker_heartbeats.update_one(
        {"kind": "worker"},
        {"$set": {"kind": "worker", "updated_at": now,
                  "expires_at": now + timedelta(minutes=3)}},
        upsert=True,
    )


def _authority(db, test):
    company = db.companies.find_one({"_id": test["company_id"], "status": "active"})
    actor = db.users.find_one({
        "_id": test["created_by"], "company_id": test["company_id"],
        "is_active": True, "is_email_verified": True,
        "role": {"$in": ["org_admin", "super_admin"]},
    })
    target = db.integrations.find_one({
        "_id": test["integration_id"], "company_id": test["company_id"], "status": "active",
    })
    grader_id = (test.get("grader") or {}).get("integration_id")
    grader = db.integrations.find_one({
        "_id": grader_id, "company_id": test["company_id"], "status": "active",
    }) if grader_id else None
    subject = None
    if test.get("mode") == "protected":
        subject = db.users.find_one({
            "_id": test.get("subject_user_id"), "company_id": test["company_id"],
            "is_active": True, "is_email_verified": True,
        })
    return company, actor, subject, target, grader


def _claim(db, job, generation):
    now = utcnow()
    token = str(uuid4())
    return db.red_team_jobs.find_one_and_update(
        {
            "_id": job["_id"], "company_id": job["company_id"], "test_id": job["test_id"],
            "kind": "run", "dispatch_generation": generation,
            "state": {"$in": ["pending", "queued", "retry_wait"]},
            "$or": [{"execution_lease_expires_at": {"$exists": False}},
                    {"execution_lease_expires_at": {"$lte": now}}],
        },
        {"$set": {
            "state": "running", "phase": "claimed", "execution_phase": "claimed",
            "execution_lease_token": token,
            "execution_lease_expires_at": now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS),
            "started_at": job.get("started_at") or now,
        }}, return_document=ReturnDocument.AFTER,
    )


def _keep_alive(db, job, lease_token, stop):
    while not stop.wait(10):
        now = utcnow()
        result = db.red_team_jobs.update_one(
            {"_id": job["_id"], "company_id": job["company_id"],
             "state": "running", "execution_lease_token": lease_token},
            {"$set": {"execution_lease_expires_at":
                      now + timedelta(seconds=RED_TEAM_EXECUTION_LEASE_SECONDS)}},
        )
        if result.matched_count != 1:
            return
        heartbeat(db)


def _set_phase(db, test, job, token, phase, status=None):
    now = utcnow()
    result = db.red_team_jobs.update_one(
        {"_id": job["_id"], "company_id": job["company_id"],
         "state": "running", "execution_lease_token": token},
        {"$set": {"phase": phase, "execution_phase": phase}},
    )
    if result.matched_count != 1:
        raise RuntimeError("execution_lease_lost")
    if status:
        db.red_team_tests.update_one(
            {"_id": test["_id"], "company_id": test["company_id"],
             "status": {"$in": ["queued", "generating", "running"]}},
            {"$set": {"status": status, "updated_at": now}},
        )


def _credential(db, integration_id, company_id, code):
    try:
        repository = LLMIntegrationRepository(db, CompanyRepository(db))
        integration = repository.find_by_id(
            str(integration_id), str(company_id), include_credential=True,
        )
    except Exception as exc:
        raise CredentialUnavailable(code) from exc
    if integration is None or not integration.api_key:
        raise CredentialUnavailable(code)
    return integration.api_key


def _store_suite(db, test, job, token, event):
    if len(BSON.encode(event.suite)) > _SUITE_LIMIT:
        raise CredentialUnavailable("promptfoo_failed")
    now = utcnow()
    breakdown = suite_breakdown(event.suite)
    by_plugin = {plugin: breakdown["by_plugin"].get(plugin, 0)
                 for plugin in test.get("plugins") or ()}
    by_plugin.update(breakdown["by_plugin"])
    suite_id = ObjectId()
    document = {
        "_id": suite_id, "company_id": test["company_id"], "created_by": test["created_by"],
        "test_id": test["_id"], "promptfoo_version": test.get("promptfoo_version", PROMPTFOO_VERSION),
        "suite": event.suite, "test_count": event.test_count,
        "by_plugin": by_plugin, "by_strategy": breakdown["by_strategy"],
        "config_hash": (test.get("config_snapshot") or {}).get("config_hash"),
        "created_at": now,
    }
    def persist(session):
        held = db.red_team_jobs.update_one(
            {"_id": job["_id"], "company_id": test["company_id"], "state": "running",
             "execution_lease_token": token},
            {"$set": {"phase": "evaluating", "execution_phase": "evaluating"}}, session=session,
        )
        if held.matched_count != 1:
            raise RuntimeError("execution_lease_lost")
        changes = {"suite_id": suite_id, "counts.planned": event.test_count, "updated_at": now}
        db.red_team_suites.insert_one(document, session=session)
        db.red_team_tests.update_one(
            {"_id": test["_id"], "company_id": test["company_id"]}, {"$set": changes}, session=session,
        )
        db.red_team_tests.update_many(
            {"company_id": test["company_id"], "comparison_group_id": test["comparison_group_id"],
             "status": "draft", "suite_id": None},
            {"$set": changes}, session=session,
        )

    with db.client.start_session() as session:
        session.with_transaction(persist)
    test["suite_id"] = suite_id
    test.setdefault("counts", {})["planned"] = event.test_count
    return document


def _write_progress(db, test, executed):
    db.red_team_tests.update_one(
        {"_id": test["_id"], "company_id": test["company_id"]},
        {"$max": {"counts.executed": executed}, "$set": {"updated_at": utcnow()}},
    )


def _content_expiry(db, test, now):
    company = db.companies.find_one(
        {"_id": test["company_id"]}, {"settings.content_retention_days": 1},
    ) or {}
    return now + timedelta(days=company.get("settings", {}).get("content_retention_days", 7))


def _import_results(db, test, results_path, issued_run_ids):
    try:
        if results_path.stat().st_size > _RESULTS_LIMIT:
            raise CredentialUnavailable("results_too_large")
        parsed = parse_results_json(results_path.read_text(encoding="utf-8"))
    except CredentialUnavailable:
        raise
    except (OSError, UnicodeError, ArtifactParseError) as exc:
        raise CredentialUnavailable("promptfoo_failed") from exc

    now = utcnow()
    expires_at = _content_expiry(db, test, now)
    error_count = 0
    for row in parsed.rows:
        verdict = decide(row, issued_run_ids)
        error_count += verdict.verdict == "error"
        document = {
            "company_id": test["company_id"], "test_id": test["_id"],
            "test_idx": row.test_idx, "repeat_index": row.repeat_index,
            "plugin_id": row.plugin_id, "strategy_id": row.strategy_id,
            "severity": row.severity, "decision": row.decision,
            "verdict": verdict.verdict, "verdict_source": verdict.verdict_source,
            "grader_reason": row.grader_reason, "policy_evidence": row.policy_evidence,
            "guardrails": row.guardrails,
            "protected_run_id": (ObjectId(row.protected_run_id)
                                 if ObjectId.is_valid(row.protected_run_id) else row.protected_run_id),
            "assert_type": row.assert_type, "assert_metric": row.assert_metric,
            "latency_ms": row.latency_ms, "prompt_tokens": row.token_usage.get("prompt"),
            "completion_tokens": row.token_usage.get("completion"),
            "total_tokens": row.token_usage.get("total"), "cost_usd": row.cost,
            "error_code": "grader_error" if verdict.verdict == "error" else None,
            "score": row.score, "failure_reason": row.failure_reason,
            "content_expires_at": expires_at, "content_expired": False,
            "created_at": now, "updated_at": now,
        }
        if row.prompt is not None:
            document["prompt_ciphertext"] = encrypt(row.prompt)
        if row.response is not None:
            document["response_ciphertext"] = encrypt(row.response)
        db.red_team_attacks.update_one(
            {"company_id": test["company_id"], "test_id": test["_id"],
             "test_idx": row.test_idx, "repeat_index": row.repeat_index},
            {"$set": document}, upsert=True,
        )
    if parsed.skipped:
        logger.info("Skipped promptfoo rows for test %s: %s", test["_id"], parsed.skipped)
    db.red_team_tests.update_one(
        {"_id": test["_id"], "company_id": test["company_id"]},
        {"$set": {"stats": parsed.stats, "total_latency_ms": parsed.total_latency_ms,
                  "counts.graded": len(parsed.rows), "updated_at": now}},
    )
    return error_count


def _notify_below_threshold(db, test, session):
    attacks = list(db.red_team_attacks.find(
        {"company_id": test["company_id"], "test_id": test["_id"]}, session=session,
    ))
    if (build_report(test, attacks).get("threshold") or {}).get("verdict") != "below_threshold":
        return
    recipients = db.users.find({
        "company_id": test["company_id"], "role": {"$in": ["org_admin", "super_admin"]},
        "is_active": True, "is_email_verified": True,
    }, {"_id": 1}, session=session)
    for recipient in recipients:
        db.notifications.update_one(
            {"company_id": test["company_id"], "recipient_user_id": recipient["_id"],
             "event_key": f'red_team_threshold:{test["_id"]}'},
            {"$setOnInsert": {
                "company_id": test["company_id"], "recipient_user_id": recipient["_id"],
                "event_key": f'red_team_threshold:{test["_id"]}', "kind": "red_team_threshold",
                "title": "Red-team score below threshold",
                "summary": "A synthetic evaluation finished below its configured threshold.",
                "resource_type": "red_team_test", "resource_id": test["_id"],
                "created_at": utcnow(), "read_at": None,
            }}, upsert=True, session=session,
        )


def _finalize(db, test, job, token, status, error_code=None, exit_code=None, output_tail=""):
    for attempt in range(3):
        try:
            with db.client.start_session() as session:
                with session.start_transaction():
                    current = db.red_team_tests.find_one(
                        {"_id": test["_id"], "company_id": test["company_id"]}, session=session,
                    )
                    if not current:
                        return False
                    final_status = "cancelled" if current.get("cancel_requested_at") else status
                    now = utcnow()
                    result = db.red_team_jobs.update_one(
                        {"_id": job["_id"], "company_id": test["company_id"],
                         "state": "running", "execution_lease_token": token},
                        {"$set": {
                            "state": "cancelled" if final_status == "cancelled" else "finished",
                            "phase": "finished", "execution_phase": "finished",
                            "exit_code": exit_code, "error_code": error_code,
                            "output_tail": (output_tail or "")[-4096:], "finished_at": now,
                        }, "$unset": {"execution_lease_token": "", "execution_lease_expires_at": ""}},
                        session=session,
                    )
                    if result.matched_count != 1:
                        return False
                    changes = {"status": final_status, "finished_at": now, "updated_at": now,
                               "failure_reason": error_code if final_status == "failed" else None}
                    db.red_team_tests.update_one(
                        {"_id": test["_id"], "company_id": test["company_id"]},
                        {"$set": changes, "$inc": {"execution_revision": 1}}, session=session,
                    )
                    if final_status in {"completed", "partially_failed"}:
                        _notify_below_threshold(db, {**current, **changes}, session)
                    return True
        except PyMongoError as exc:
            if attempt == 2 or not exc.has_error_label("TransientTransactionError"):
                raise
    return False


def _cancelled(db, test):
    current = db.red_team_tests.find_one(
        {"_id": test["_id"], "company_id": test["company_id"]},
        {"cancel_requested_at": 1, "status": 1},
    )
    return not current or bool(current.get("cancel_requested_at")) or current.get("status") == "cancelling"


def process_job(db, job_id, test_id, generation, provider_service=None, *,
                runner_factory=PromptfooRun, bridge_factory=BridgeServer):
    if not ObjectId.is_valid(job_id) or not ObjectId.is_valid(test_id):
        return "noop"
    job = db.red_team_jobs.find_one({"_id": ObjectId(job_id), "test_id": ObjectId(test_id)})
    if not job or job.get("kind") != "run":
        return "noop"
    job = _claim(db, job, generation)
    if not job:
        return "noop"
    token = job["execution_lease_token"]
    test = db.red_team_tests.find_one({"_id": job["test_id"], "company_id": job["company_id"]})
    if not test:
        return "noop"

    keepalive_stop = Event()
    keeper = Thread(target=_keep_alive, args=(db, job, token, keepalive_stop), daemon=True)
    keeper.start()
    bridge = runner = None
    cancel_stop = Event()
    cancel_thread = None
    try:
        company, actor, subject, target, grader = _authority(db, test)
        if (_cancelled(db, test) or not all((company, actor, target, grader))
                or (test.get("mode") == "protected" and subject is None)):
            _finalize(db, test, job, token, "cancelled", "authority_or_target_revoked")
            return "cancelled"

        snapshot = test.get("config_snapshot") or {}
        clone = bool(test.get("suite_id"))
        _set_phase(db, test, job, token, "evaluating" if clone else "generating",
                   "running" if clone else "generating")
        target_key = ""
        if test.get("mode") == "raw":
            target_key = _credential(db, test["integration_id"], test["company_id"],
                                     "target_key_unavailable")
        grader_key = _credential(db, (test.get("grader") or {}).get("integration_id"),
                                 test["company_id"], "grader_key_unavailable")

        provider_service = provider_service or ProviderService()
        bridge_config = None
        if test.get("mode") == "protected":
            bridge = bridge_factory(
                make_executor(db, test, snapshot, subject, provider_service),
                lambda: _cancelled(db, test), str(job["_id"]),
            )
            bridge_url, bridge_token = bridge.start()
            bridge_config = {"url": bridge_url, "token": bridge_token, "run_id": str(job["_id"])}

        workspace_root = Path(PROMPTFOO_WORKSPACE_ROOT)
        suite_doc = db.red_team_suites.find_one({
            "_id": test["suite_id"], "company_id": test["company_id"],
        }) if clone else None
        if clone and not suite_doc:
            raise CredentialUnavailable("promptfoo_failed")
        if suite_doc:
            config = build_clone_config(
                test, snapshot, suite_doc["suite"], target_key=target_key, grader_key=grader_key,
                workspace=workspace_root, bridge=bridge_config,
            )
        else:
            config = build_redteam_config(
                test, snapshot, target_key=target_key, grader_key=grader_key,
                workspace=workspace_root, bridge=bridge_config,
            )
        env = subprocess_env(os.environ, workspace_root, sys.executable, RUNTIME_ROOT, backend_root=BACKEND_ROOT)
        runner = runner_factory(
            workspace_root=workspace_root, config=config,
            cloud_host=PROMPTFOO_CLOUD_HOST, cloud_api_key=PROMPTFOO_API_KEY,
            env=env, suite=suite_doc["suite"] if suite_doc else None,
        )

        def watch_cancel():
            while not cancel_stop.wait(2):
                if _cancelled(db, test):
                    runner.cancel()
                    return

        cancel_thread = Thread(target=watch_cancel, daemon=True)
        cancel_thread.start()
        last_progress_write = float("-inf")
        observed_executed = persisted_executed = (test.get("counts") or {}).get("executed", 0)
        final_event = None
        error_rows = 0
        for event in runner.events():
            if event.type == "suite_ready":
                if not event.test_count:
                    runner.cancel()
                    raise CredentialUnavailable("no_tests_generated")
                _store_suite(db, test, job, token, event)
            elif event.type == "phase":
                status = "running" if event.phase in {"evaluating", "importing"} else None
                _set_phase(db, test, job, token, event.phase, status)
            elif event.type == "progress":
                observed_executed = max(observed_executed, event.executed)
                monotonic_now = time.monotonic()
                if observed_executed > persisted_executed and monotonic_now - last_progress_write >= 2:
                    _write_progress(db, test, observed_executed)
                    persisted_executed = observed_executed
                    last_progress_write = monotonic_now
            elif event.type == "finished":
                final_event = event
                if observed_executed > persisted_executed:
                    _write_progress(db, test, observed_executed)
                if event.status == "completed":
                    _set_phase(db, test, job, token, "importing", "running")
                    error_rows = _import_results(
                        db, test, event.results_path, bridge.issued_run_ids() if bridge else set(),
                    )

        if final_event is None:
            raise CredentialUnavailable("promptfoo_failed")
        if final_event.status == "cancelled" or _cancelled(db, test):
            status = "cancelled"
        elif final_event.status != "completed":
            status = "failed"
        else:
            status = "partially_failed" if error_rows else "completed"
        _finalize(db, test, job, token, status, final_event.error_code,
                  final_event.exit_code, final_event.output_tail)
        return status
    except CredentialUnavailable as exc:
        _finalize(db, test, job, token, "failed", exc.code)
        return "failed"
    except Exception as exc:
        logger.warning("Promptfoo worker failed for job %s (%s)", job["_id"], type(exc).__name__)
        _finalize(db, test, job, token, "failed", "promptfoo_failed")
        return "failed"
    finally:
        cancel_stop.set()
        if cancel_thread:
            cancel_thread.join(timeout=3)
        if bridge:
            bridge.stop()
        keepalive_stop.set()
        keeper.join(timeout=3)


def _valid_message(body):
    message = json.loads(body)
    if set(message) != {"v", "job_id", "test_id", "generation"} or message["v"] != 1:
        raise ValueError("invalid_message")
    if not ObjectId.is_valid(message["job_id"]) or not ObjectId.is_valid(message["test_id"]):
        raise ValueError("invalid_message")
    if type(message["generation"]) is not int or message["generation"] < 1:
        raise ValueError("invalid_message")
    return message


def _heartbeat_loop(db, stop):
    while not stop.wait(30):
        try:
            heartbeat(db)
        except Exception as exc:
            logger.warning("Worker heartbeat failed (%s)", type(exc).__name__)


def main():
    db = get_database()
    heartbeat_stop = Event()
    Thread(target=lambda: _heartbeat_loop(db, heartbeat_stop), daemon=True).start()
    while True:
        try:
            conn = connection()
            channel = conn.channel()
            declare(channel)
            channel.basic_qos(prefetch_count=1)

            def on_message(ch, method, _properties, body):
                try:
                    message = _valid_message(body)
                except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                    ch.basic_publish(
                        exchange="", routing_key=RED_TEAM_QUEUE_NAME + ".dead",
                        body=b'{"reason":"invalid_message"}',
                        properties=pika.BasicProperties(
                            delivery_mode=pika.DeliveryMode.Persistent, content_type="application/json",
                        ),
                    )
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    return

                def work():
                    try:
                        process_job(db, message["job_id"], message["test_id"], message["generation"])
                    except Exception as exc:
                        logger.warning("Worker will recover job %s (%s)", message["job_id"], type(exc).__name__)
                    finally:
                        conn.add_callback_threadsafe(
                            lambda: ch.basic_ack(delivery_tag=method.delivery_tag),
                        )

                Thread(target=work, daemon=True).start()

            channel.basic_consume(queue=RED_TEAM_QUEUE_NAME, on_message_callback=on_message, auto_ack=False)
            heartbeat(db)
            channel.start_consuming()
        except KeyboardInterrupt:
            heartbeat_stop.set()
            break
        except Exception as exc:
            logger.warning("Worker reconnecting (%s)", type(exc).__name__)
            time.sleep(2)


if __name__ == "__main__":
    main()
