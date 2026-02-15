"""Encrypt/decrypt OAuth tokens at rest using Fernet symmetric encryption."""

import base64
import os

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        # In development, generate a deterministic key from JWT secret
        raw = settings.jwt_secret_key.encode()
        key = base64.urlsafe_b64encode(raw.ljust(32, b"\0")[:32]).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plain_text: str) -> str:
    f = _get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_token(cipher_text: str) -> str:
    f = _get_fernet()
    return f.decrypt(cipher_text.encode()).decode()
