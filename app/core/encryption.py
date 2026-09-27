from cryptography.fernet import Fernet, InvalidToken

from app.core.config import INTEGRATION_ENCRYPTION_KEY


def _fernet() -> Fernet:
    try:
        return Fernet(INTEGRATION_ENCRYPTION_KEY.encode('ascii'))
    except (ValueError, TypeError) as exc:
        raise RuntimeError('INTEGRATION_ENCRYPTION_KEY must be a valid Fernet key') from exc


def validate_encryption_key() -> None:
    _fernet()


def encrypt_credential(value: str) -> str:
    return _fernet().encrypt(value.encode('utf-8')).decode('ascii')


def decrypt_credential(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode('ascii')).decode('utf-8')
    except InvalidToken as exc:
        raise RuntimeError('Stored integration credential cannot be decrypted') from exc
