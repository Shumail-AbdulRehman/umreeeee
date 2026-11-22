import asyncio
import logging
from types import SimpleNamespace

import pytest
from pymongo.errors import ConfigurationError, InvalidURI, OperationFailure, ServerSelectionTimeoutError

from app.db import diagnostics, mongo


@pytest.mark.parametrize('error,reason', [
    (OperationFailure('secret', code=18), 'authentication_failed'),
    (OperationFailure('secret', code=13), 'permission_denied'),
    (OperationFailure('secret duplicate email', code=11000), 'duplicate_data'),
    (OperationFailure('secret index', code=85), 'index_conflict'),
    (OperationFailure('secret', code=20), 'transactions_unsupported'),
    (InvalidURI('secret URI'), 'invalid_configuration'),
    (ConfigurationError('DNS query failed for secret host'), 'dns_failure'),
    (ServerSelectionTimeoutError('SSL handshake failed secret'), 'tls_failure'),
    (ServerSelectionTimeoutError('secret server timeout'), 'server_selection_timeout'),
])
def test_safe_failure_categories(error, reason):
    result = diagnostics.describe_failure(error)
    assert result['reason'] == reason
    assert 'secret' not in str(result)


def test_wrapped_auth_error_preserves_real_cause():
    try:
        raise OperationFailure('do-not-log-this-password', code=18)
    except OperationFailure as error:
        wrapped = mongo.DatabaseTransactionError('transaction check failed')
        wrapped.__cause__ = error
    assert diagnostics.describe_failure(wrapped)['reason'] == 'authentication_failed'


def test_logs_redact_driver_details_and_rate_limit(caplog):
    diagnostics._recent.clear()
    error = OperationFailure('mongodb+srv://secret-user:secret-password@private-host/ email@example.test', code=11000)
    with caplog.at_level(logging.INFO, logger='uvicorn.error'):
        diagnostics.log_failure('startup_indexes', error)
        diagnostics.log_failure('startup_indexes', error)
    assert caplog.text.count('reason=duplicate_data') == 1
    assert 'phase=startup_indexes' in caplog.text
    for private in ('secret-user', 'secret-password', 'private-host', 'email@example.test', 'mongodb+srv'):
        assert private not in caplog.text


def test_connection_status_reports_safe_diagnostic(monkeypatch, caplog):
    diagnostics._recent.clear()
    def fail():
        raise InvalidURI('private credentials')
    monkeypatch.setattr(mongo, 'get_mongo_client', fail)
    assert mongo.get_database_status()['status'] == 'unavailable'
    assert 'reason=invalid_configuration' in caplog.text
    assert 'private credentials' not in caplog.text


@pytest.mark.parametrize('stage,method,error', [
    ('startup_connection', 'get_mongo_client', ServerSelectionTimeoutError('private-host')),
    ('startup_transactions', 'verify_transactions', mongo.DatabaseTransactionError('private-host')),
    ('startup_indexes', 'ensure_indexes', OperationFailure('private-email', code=11000)),
])
def test_startup_identifies_failure_phase_without_crashing(monkeypatch, caplog, stage, method, error):
    import app.main as application
    import app.queue.rabbit as rabbit
    diagnostics._recent.clear()
    for name in ('get_mongo_client', 'verify_transactions', 'get_database', 'ensure_indexes',
                 'reconcile', 'recover_red_team', 'close_mongo_client', 'validate_encryption_key', 'cipher'):
        monkeypatch.setattr(application, name, lambda *args: None)
    monkeypatch.setattr(application.registry, 'warm_local_models', lambda: None)
    monkeypatch.setattr(rabbit, 'RabbitPublisher', lambda: SimpleNamespace(close=lambda: None))
    def fail(*args):
        raise error
    monkeypatch.setattr(application, method, fail)
    async def run():
        async with application.lifespan(None):
            pass
    asyncio.run(run())
    assert f'phase={stage}' in caplog.text
    assert 'private-host' not in caplog.text and 'private-email' not in caplog.text


def test_readiness_details_stay_in_logs(monkeypatch, caplog):
    from fastapi import Response
    from app.api.routes import health
    diagnostics._recent.clear()
    monkeypatch.setattr(health, 'get_database_status', lambda: {'status': 'ready'})
    monkeypatch.setattr(health, 'verify_transactions', lambda: None)
    monkeypatch.setattr(health, 'get_database', lambda: None)
    def fail(db):
        raise OperationFailure('private-duplicate-value', code=11000)
    monkeypatch.setattr(health, 'ensure_indexes', fail)
    response = Response()
    assert health.readiness(response) == {'status': 'unavailable'}
    assert response.status_code == 503
    assert 'phase=readiness_indexes' in caplog.text
    assert 'private-duplicate-value' not in caplog.text
