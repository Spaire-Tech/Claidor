"""Apple's DeviceCheck: one free month per iPhone (12 October 2026).

The iPhone app asks iOS for a device token (`DCDevice.generateToken`) and
sends it with its request for the free month (`simeon.plans.free_month`).
Apple keeps two bits per device for each developer team, which survive
deleting the app and signing in with another account; bit 0 here means
"this iPhone has had its free month". The server reads the bits before a
free month starts and sets bit 0 once it has.

A token from a build signed for development (a run from Xcode) is only
known to Apple's development service, one from TestFlight or the App
Store only to production. The app says which it thinks it is; when Apple
does not know the token there, the other service is asked.

Set up: a key with DeviceCheck ticked in the developer account (Keys),
`APPLE_DEVICECHECK_KEY_ID` and `APPLE_DEVICECHECK_KEY_VALUE` (the .p8
file's text), and `APPLE_TEAM_ID`.
https://developer.apple.com/documentation/devicecheck/accessing-and-modifying-per-device-data
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx
import jwt
import structlog

from simeon.config import settings
from simeon.kit.utils import utc_now

log = structlog.get_logger()

#: What Apple answers, with 200, for a device whose bits were never set.
_NO_BITS = "Failed to find bit state"


class DeviceCheckError(Exception):
    """Apple could not be asked, or did not know the device."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def configured() -> bool:
    return bool(
        settings.APPLE_DEVICECHECK_KEY_ID
        and settings.APPLE_DEVICECHECK_KEY_VALUE
        and settings.APPLE_TEAM_ID
    )


def _bearer() -> str:
    """The developer token Apple's DeviceCheck service takes: ES256, the
    key's id in the header, the team as issuer."""
    return jwt.encode(
        {"iss": settings.APPLE_TEAM_ID, "iat": int(utc_now().timestamp())},
        settings.APPLE_DEVICECHECK_KEY_VALUE,
        algorithm="ES256",
        headers={"kid": settings.APPLE_DEVICECHECK_KEY_ID},
    )


def _bases(development: bool) -> list[str]:
    production = settings.APPLE_DEVICECHECK_BASE
    sandbox = settings.APPLE_DEVICECHECK_DEVELOPMENT_BASE
    return [sandbox, production] if development else [production, sandbox]


async def _call(
    path: str, device_token: str, *, development: bool, extra: dict[str, Any]
) -> httpx.Response:
    """POST to the service the token most likely belongs to, then to the
    other when Apple answers 400 (a token it does not know there)."""
    body = {
        "device_token": device_token,
        "transaction_id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        **extra,
    }
    headers = {"Authorization": f"Bearer {_bearer()}"}
    last: httpx.Response | None = None
    async with httpx.AsyncClient(timeout=10) as client:
        for base in _bases(development):
            try:
                response = await client.post(
                    f"{base}/v1/{path}", json=body, headers=headers
                )
            except httpx.HTTPError as error:
                log.warning("device_check.unreachable", base=base, error=str(error))
                raise DeviceCheckError(
                    "Apple's DeviceCheck could not be reached."
                ) from error
            if response.status_code != 400:
                return response
            last = response
    assert last is not None
    log.info("device_check.unknown_token", body=last.text[:200])
    raise DeviceCheckError("Apple does not know this device token.")


async def free_month_used(device_token: str, *, development: bool = False) -> bool:
    """Whether Apple's bit 0 says this iPhone already had its free month."""
    response = await _call(
        "query_two_bits", device_token, development=development, extra={}
    )
    if response.status_code != 200:
        log.warning(
            "device_check.query_refused",
            status=response.status_code,
            body=response.text[:200],
        )
        raise DeviceCheckError("Apple's DeviceCheck refused the question.")
    text = response.text.strip()
    if not text or text.startswith(_NO_BITS):
        return False
    try:
        bits = response.json()
    except ValueError as error:
        raise DeviceCheckError(
            "Apple's DeviceCheck answered something unreadable."
        ) from error
    return bool(bits.get("bit0"))


async def mark_free_month_used(device_token: str, *, development: bool = False) -> None:
    """Set bit 0 on this iPhone (bit 1 stays clear, unused)."""
    response = await _call(
        "update_two_bits",
        device_token,
        development=development,
        extra={"bit0": True, "bit1": False},
    )
    if response.status_code != 200:
        log.warning(
            "device_check.update_refused",
            status=response.status_code,
            body=response.text[:200],
        )
        raise DeviceCheckError("Apple's DeviceCheck did not keep the mark.")


__all__ = [
    "DeviceCheckError",
    "configured",
    "free_month_used",
    "mark_free_month_used",
]
