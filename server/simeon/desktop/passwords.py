"""Passwords for the apps' sign-in (19 October 2026).

scrypt from the standard library, with OWASP's setting for 16 MiB of memory
(N=2^14, r=8, p=5), a fresh 16-byte salt per password and a 32-byte digest.
What is stored reads `scrypt$<N>$<r>$<p>$<salt>$<digest>` (both URL-safe
base64), so a later change of setting still checks the passwords made
before it. The work runs off the event loop.

A check with no password to compare against (no such account, or one with
no password) does the same work and fails, so the time taken does not say
which accounts exist.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets

from .words import say

#: OWASP's scrypt setting for 16 MiB (Password Storage Cheat Sheet).
_N, _R, _P = 2**14, 8, 5
_DIGEST_BYTES = 32
_SALT_BYTES = 16
#: Above what N=2^14, r=8 needs (16 MiB); OpenSSL refuses past its limit.
_MAXMEM = 64 * 1024 * 1024
_PREFIX = "scrypt"

MIN_LENGTH = 8
#: Long enough for any passphrase, short enough that hashing it is cheap.
MAX_LENGTH = 128

_DUMMY_SALT = secrets.token_bytes(_SALT_BYTES)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=n,
        r=r,
        p=p,
        maxmem=_MAXMEM,
        dklen=_DIGEST_BYTES,
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = _derive(password, salt, _N, _R, _P)
    return f"{_PREFIX}${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    parts = (stored or "").split("$")
    try:
        if len(parts) != 6 or parts[0] != _PREFIX:
            raise ValueError("not a password")
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt, digest = _unb64(parts[4]), _unb64(parts[5])
    except ValueError:
        # Nothing to compare against: the same work as a real check, then no.
        _derive(password, _DUMMY_SALT, _N, _R, _P)
        return False
    return hmac.compare_digest(_derive(password, salt, n, r, p), digest)


async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password: str, stored: str | None) -> bool:
    return await asyncio.to_thread(verify_password, password, stored)


def password_problem(password: str, email: str) -> str | None:
    """The sentence the app shows for a password it can't take; None when it can."""
    if len(password) < MIN_LENGTH:
        return say("password.too_short", count=MIN_LENGTH)
    if len(password) > MAX_LENGTH:
        return say("password.too_long", count=MAX_LENGTH)
    if password.strip().lower() == email.strip().lower():
        return say("password.is_email")
    return None
