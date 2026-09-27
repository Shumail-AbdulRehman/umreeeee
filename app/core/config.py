import os
from pathlib import Path
from urllib.parse import quote, unquote

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(ENV_FILE)


def clean_env_value(value: str | None, default: str = '') -> str:
    if value is None:
        return default

    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {"'", '"'}:
        normalized = normalized[1:-1].strip()
    return normalized


def bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(clean_env_value(os.getenv(name), str(default)))
    except ValueError as exc:
        raise RuntimeError(f'{name} must be an integer from {minimum} to {maximum}') from exc
    if value < minimum or value > maximum:
        raise RuntimeError(f'{name} must be from {minimum} to {maximum}')
    return value


def normalize_mongodb_url(mongodb_url: str) -> str:
    if '://' not in mongodb_url or '@' not in mongodb_url:
        return mongodb_url

    scheme, remainder = mongodb_url.split('://', 1)
    credentials, separator, host_and_path = remainder.rpartition('@')
    if not separator or ':' not in credentials:
        return mongodb_url

    username, password = credentials.split(':', 1)
    encoded_username = quote(unquote(username), safe='')
    encoded_password = quote(unquote(password), safe='')
    return f'{scheme}://{encoded_username}:{encoded_password}@{host_and_path}'


def resolve_mongodb_url() -> str:
    explicit_mongodb_url = clean_env_value(os.getenv('MONGODB_URL'))
    if explicit_mongodb_url:
        return normalize_mongodb_url(explicit_mongodb_url)

    database_url = clean_env_value(os.getenv('DATABASE_URL'))
    if database_url.startswith(('mongodb://', 'mongodb+srv://')):
        return normalize_mongodb_url(database_url)

    return 'mongodb://127.0.0.1:27017/centurion'


ENVIRONMENT = clean_env_value(os.getenv('ENVIRONMENT', os.getenv('APP_ENV', 'development')), 'development').lower()
IS_PRODUCTION = ENVIRONMENT == 'production'
DEFAULT_SECRET_KEY = 'change-this-secret-before-production'
SECRET_KEY = clean_env_value(os.getenv('SECRET_KEY'))
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = bounded_int('ACCESS_TOKEN_EXPIRE_MINUTES', 60, 5, 1440)
INVITATION_EXPIRE_HOURS = bounded_int('INVITATION_EXPIRE_HOURS', 72, 1, 168)

MONGODB_URL = resolve_mongodb_url()
MONGODB_DB_NAME = clean_env_value(os.getenv('MONGODB_DB_NAME'), 'centurion') or 'centurion'
DATABASE_MODE = clean_env_value(os.getenv('DATABASE_MODE'), 'mongodb').lower() or 'mongodb'
# Explicit opt-in only. Leave disabled while the Cytex endpoints are being built.
REMOTE_DETECTION_ENABLED = clean_env_value(os.getenv('REMOTE_DETECTION_ENABLED'), 'false').lower() == 'true'
DLP_DETECTION_API_KEY = clean_env_value(os.getenv('DLP_DETECTION_API_KEY'))
REMOTE_DETECTION_TIMEOUT_SECONDS = bounded_int('REMOTE_DETECTION_TIMEOUT_SECONDS', 5, 1, 30)
MONGODB_SERVER_SELECTION_TIMEOUT_MS = bounded_int('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 2000, 100, 30000)

VERIFICATION_CODE_EXPIRE_MINUTES = bounded_int('VERIFICATION_CODE_EXPIRE_MINUTES', 10, 1, 60)
VERIFICATION_RESEND_COOLDOWN_SECONDS = bounded_int('VERIFICATION_RESEND_COOLDOWN_SECONDS', 60, 10, 3600)
VERIFICATION_MAX_ATTEMPTS = bounded_int('VERIFICATION_MAX_ATTEMPTS', 5, 1, 20)
PASSWORD_RESET_CODE_EXPIRE_MINUTES = bounded_int('PASSWORD_RESET_CODE_EXPIRE_MINUTES', 10, 1, 60)
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = bounded_int('PASSWORD_RESET_RESEND_COOLDOWN_SECONDS', 60, 10, 3600)
PASSWORD_RESET_MAX_ATTEMPTS = bounded_int('PASSWORD_RESET_MAX_ATTEMPTS', 5, 1, 20)
AUTH_LOGIN_ACCOUNT_LIMIT = bounded_int('AUTH_LOGIN_ACCOUNT_LIMIT', 10, 1, 100)
AUTH_LOGIN_IP_LIMIT = bounded_int('AUTH_LOGIN_IP_LIMIT', 60, 1, 1000)
AUTH_RECOVERY_ACCOUNT_LIMIT = bounded_int('AUTH_RECOVERY_ACCOUNT_LIMIT', 5, 1, 100)
AUTH_RECOVERY_IP_LIMIT = bounded_int('AUTH_RECOVERY_IP_LIMIT', 30, 1, 1000)
SMTP_HOST = clean_env_value(os.getenv('SMTP_HOST'))
SMTP_PORT = bounded_int('SMTP_PORT', 587, 1, 65535)
SMTP_USERNAME = clean_env_value(os.getenv('SMTP_USERNAME'))
SMTP_PASSWORD = clean_env_value(os.getenv('SMTP_PASSWORD'))
SMTP_FROM_EMAIL = clean_env_value(os.getenv('SMTP_FROM_EMAIL'))
SMTP_FROM_NAME = clean_env_value(os.getenv('SMTP_FROM_NAME'), 'Sentinel AI')
SMTP_USE_TLS = clean_env_value(os.getenv('SMTP_USE_TLS'), 'true').lower() in {'1', 'true', 'yes', 'on'}
SMTP_USE_SSL = clean_env_value(os.getenv('SMTP_USE_SSL'), 'false').lower() in {'1', 'true', 'yes', 'on'}
SMTP_ENABLED = bool(SMTP_HOST and SMTP_FROM_EMAIL)
INTEGRATION_ENCRYPTION_KEY = clean_env_value(os.getenv('INTEGRATION_ENCRYPTION_KEY'))
CONTENT_ENCRYPTION_KEY = clean_env_value(os.getenv('CONTENT_ENCRYPTION_KEY'))
VALIDATION_STAGE_TIMEOUT_MS = bounded_int('VALIDATION_STAGE_TIMEOUT_MS', 5000, 25, 30000)
VALIDATOR_MODEL_CACHE_DIR = clean_env_value(os.getenv('VALIDATOR_MODEL_CACHE_DIR'), str(ENV_FILE.parent / '.model-cache'))
INJECTION_MODEL_ID = clean_env_value(os.getenv('INJECTION_MODEL_ID'), 'protectai/deberta-v3-base-prompt-injection-v2')
INJECTION_MODEL_REVISION = clean_env_value(os.getenv('INJECTION_MODEL_REVISION'), '90c9989b1a342275dd0d1a95aad283c04e075671')
TOXICITY_MODEL_ID = clean_env_value(os.getenv('TOXICITY_MODEL_ID'), 'unitary/toxic-bert')
TOXICITY_MODEL_REVISION = clean_env_value(os.getenv('TOXICITY_MODEL_REVISION'), '4d6c22e74ba2fdd26bc4f7238f50766b045a0d94')
PII_PHONE_REGION = clean_env_value(os.getenv('PII_PHONE_REGION'), 'US')
PROVIDER_TIMEOUT_SECONDS = bounded_int('PROVIDER_TIMEOUT_SECONDS', 45, 5, 120)
INTERRUPTED_RUN_GRACE_SECONDS = bounded_int('INTERRUPTED_RUN_GRACE_SECONDS', 300, 240, 3600)
RABBITMQ_URL = clean_env_value(os.getenv('RABBITMQ_URL'), 'amqp://guest:guest@127.0.0.1:5672/%2F')
RED_TEAM_QUEUE_NAME = clean_env_value(os.getenv('RED_TEAM_QUEUE_NAME'), 'sentinel.red_team.local')
if not RED_TEAM_QUEUE_NAME.startswith('sentinel.') or len(RED_TEAM_QUEUE_NAME) > 100:
    raise RuntimeError('RED_TEAM_QUEUE_NAME must be an application-owned sentinel.* queue')
RED_TEAM_MAX_ATTEMPTS = bounded_int('RED_TEAM_MAX_ATTEMPTS', 3, 1, 3)
RED_TEAM_EXECUTION_LEASE_SECONDS = bounded_int('RED_TEAM_EXECUTION_LEASE_SECONDS', 120, 90, 600)
INTEGRATION_REQUESTS_PER_MINUTE = bounded_int('INTEGRATION_REQUESTS_PER_MINUTE', 6, 1, 60)
ALLOWED_OLLAMA_ORIGINS = [value.strip().rstrip('/') for value in clean_env_value(
    os.getenv('ALLOWED_OLLAMA_ORIGINS'), 'http://127.0.0.1:11434'
).split(',') if value.strip()]
FRONTEND_APP_URL = (
    clean_env_value(os.getenv('FRONTEND_APP_URL'), 'http://localhost:5173').rstrip('/')
    or 'http://localhost:5173'
)
CORS_ORIGINS = [
    origin.strip()
    for origin in clean_env_value(
        os.getenv('CORS_ORIGINS'),
        'http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
]

if not SECRET_KEY or SECRET_KEY == DEFAULT_SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError('Set SECRET_KEY to a random value of at least 32 characters')

if not INTEGRATION_ENCRYPTION_KEY:
    raise RuntimeError('Set INTEGRATION_ENCRYPTION_KEY to a Fernet key')

if IS_PRODUCTION and (not SMTP_HOST or not SMTP_FROM_EMAIL):
    raise RuntimeError('SMTP_HOST and SMTP_FROM_EMAIL must be configured')

if DATABASE_MODE != 'mongodb':
    raise RuntimeError('DATABASE_MODE must be mongodb; migrate legacy app.db with scripts.migrate_phase1')
