"""Database diagnostics containing only fixed labels, numeric codes and safe hints."""
from contextlib import contextmanager
import logging
from threading import Lock
from time import monotonic

from pymongo.errors import ConfigurationError, ConnectionFailure, InvalidURI, OperationFailure, ServerSelectionTimeoutError

logger = logging.getLogger('uvicorn.error')
_recent = {}
_lock = Lock()


def describe_failure(error):
    # Transaction checks wrap the original PyMongo exception; retain its actual cause.
    causes, current = [], error
    while current is not None and len(causes) < 8:
        causes.append(current)
        current = current.__cause__
    codes = [e.code for e in causes if isinstance(e, OperationFailure) and isinstance(e.code, int)]
    code = codes[-1] if codes else None
    # Inspect messages for classification only. Never return/log raw messages or details:
    # driver errors can contain a URI, password, document contents, or duplicate values.
    message = ' '.join(str(e).lower() for e in causes)
    if code == 18:
        reason, hint = 'authentication_failed', 'Check the database username, password and authSource in MONGODB_URL.'
    elif code == 13:
        reason, hint = 'permission_denied', 'Grant the database user the required access to MONGODB_DB_NAME.'
    elif code in {11000, 11001, 12582}:
        reason, hint = 'duplicate_data', 'Existing records violate a unique index. Back up and inspect duplicates before migrating; do not delete data blindly.'
    elif code in {85, 86}:
        reason, hint = 'index_conflict', 'An existing index has different options or keys. Review indexes and the migration plan.'
    elif code == 20 or 'transaction numbers are only allowed' in message or 'sessions are not supported' in message:
        reason, hint = 'transactions_unsupported', 'Use a transaction-capable replica set or sharded cluster.'
    elif any(term in message for term in ('certificate verify failed', 'ssl handshake', 'tls handshake', 'ssl:')):
        reason, hint = 'tls_failure', 'Check certificate trust, TLS compatibility and network middleboxes. Keep certificate verification enabled.'
    elif any(term in message for term in ('nxdomain', 'dns query', 'dns operation', 'resolution lifetime', 'name or service not known', 'getaddrinfo', '_mongodb._tcp')):
        reason, hint = 'dns_failure', 'Check the Atlas hostname and SRV/DNS resolution from the Heroku dyno.'
    elif any(isinstance(e, InvalidURI) for e in causes) or any(isinstance(e, ValueError) for e in causes):
        reason, hint = 'invalid_configuration', 'Check MONGODB_URL and MONGODB_DB_NAME for invalid syntax, embedded whitespace or unescaped credentials.'
    elif any(isinstance(e, ServerSelectionTimeoutError) for e in causes):
        reason, hint = 'server_selection_timeout', 'No usable MongoDB server was selected. Check Atlas network access for Heroku, cluster availability and timeout settings; this does not prove an IP restriction.'
    elif any(isinstance(e, ConfigurationError) for e in causes):
        reason, hint = 'driver_configuration', 'Check connection-string options, DNS and replica-set configuration.'
    elif any(isinstance(e, ConnectionFailure) for e in causes):
        reason, hint = 'connection_failure', 'Check network reachability, Atlas network access and cluster availability.'
    else:
        reason, hint = 'database_operation_failed', 'Use the phase and MongoDB error code to inspect permissions, database state and migrations.'
    return {'reason': reason, 'code': code, 'hint': hint}


def log_failure(phase, error):
    diagnostic = describe_failure(error)
    # Public readiness probes must not flood the logs with identical errors.
    key = (phase, diagnostic['reason'], diagnostic['code'])
    now = monotonic()
    with _lock:
        if now - _recent.get(key, float('-inf')) < 60:
            return
        if len(_recent) >= 100:
            _recent.clear()
        _recent[key] = now
    logger.error('MongoDB diagnostic phase=%s reason=%s code=%s hint=%s',
                 phase, diagnostic['reason'], diagnostic['code'], diagnostic['hint'])


@contextmanager
def database_phase(phase):
    logger.info('MongoDB check phase=%s started', phase)
    try:
        yield
    except Exception as error:
        log_failure(phase, error)
        raise
    else:
        logger.info('MongoDB check phase=%s passed', phase)
