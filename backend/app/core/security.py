import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY


pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def generate_verification_code() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'


def hash_one_time_code(email: str, purpose: str, code: str) -> str:
    payload = f'{SECRET_KEY}:{purpose}:{email}:{code}'.encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def hash_verification_code(email: str, code: str) -> str:
    return hash_one_time_code(email, 'email-verification', code)


def verify_email_code(email: str, code: str, expected_hash: str | None) -> bool:
    if not expected_hash:
        return False
    return secrets.compare_digest(hash_verification_code(email, code), expected_hash)


def hash_password_reset_code(email: str, code: str) -> str:
    return hash_one_time_code(email, 'password-reset', code)


def verify_password_reset_code(email: str, code: str, expected_hash: str | None) -> bool:
    if not expected_hash:
        return False
    return secrets.compare_digest(hash_password_reset_code(email, code), expected_hash)


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invitation_token(token: str) -> str:
    payload = f'{SECRET_KEY}:invite:{token}'.encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def create_access_token(subject: str, token_version: int, expires_delta: timedelta | None = None) -> str:
    issued_at = datetime.now(timezone.utc)
    expire = issued_at + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {'sub': subject, 'ver': token_version, 'iat': issued_at, 'exp': expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired token',
        ) from exc
