"""Secrets kept in the database sealed, not as themselves.

A provider's tokens that the server holds for a person (Link's, since 17
October 2026) are written sealed with a key derived from `settings.SECRET`
and the purpose they serve, so a copy of the database alone opens none of
them, and a token sealed for one purpose cannot be read as another's.
Fernet: AES-128 in CBC mode with an HMAC over it, so a changed or truncated
value is refused, never half read. A changed `SECRET` leaves every sealed
value unreadable (`unseal` answers None), as it signs every device out:
the person connects again.
"""

from __future__ import annotations

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from simeon.config import settings


def _fernet(purpose: str) -> Fernet:
    key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"simeon-sealed",
        info=purpose.encode(),
    ).derive(settings.SECRET.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def seal(value: str, *, purpose: str) -> str:
    return _fernet(purpose).encrypt(value.encode()).decode()


def unseal(value: str, *, purpose: str) -> str | None:
    """The value sealed for `purpose`, or None when it was sealed with
    another key or purpose, or changed since."""
    try:
        return _fernet(purpose).decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


__all__ = ["seal", "unseal"]
