"""Pushes straight to Apple, for the native iPhone app (8 October 2026).

The Expo app registers an Expo push token and its pushes go through
Expo (`push_tasks.py`). The native app (`ios/`) registers the device token
Apple gave it instead, stored in the same `notification_recipients` row as
`apns:<hex>` (a TestFlight or App Store build) or `apns-sandbox:<hex>` (a
build run from Xcode, which Apple serves from its sandbox). This module
sends to those over APNs' HTTP/2 API with a provider token: a JWT signed
with the account's APNs key (ES256), made once and reused for 50 minutes,
as Apple asks (a new one at most every 20 minutes, none older than an hour).

Settings: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` (the .p8 file's
contents), `APNS_TOPIC` (the app's bundle id). With any of the first
three empty nothing is sent and `desktop.push.apns_not_configured` says so.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

from simeon.config import settings

APNS_PREFIX = "apns:"
APNS_SANDBOX_PREFIX = "apns-sandbox:"
APNS_HOST = "https://api.push.apple.com"
APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com"
#: A device token is 32 bytes today; Apple says not to rely on the length.
APNS_TOKEN = re.compile(r"^[0-9a-f]{32,200}$")
#: How long a provider token is reused.
PROVIDER_TOKEN_SECONDS = 50 * 60
#: Apple's answers that mean this phone will never take a push again.
GONE_REASONS = frozenset({"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"})


def stored_token(device_token: str, *, sandbox: bool) -> str:
    """How a device token is kept in `notification_recipients.expo_push_token`."""
    return f"{APNS_SANDBOX_PREFIX if sandbox else APNS_PREFIX}{device_token.lower()}"


def is_apns_device_token(value: str) -> bool:
    return APNS_TOKEN.match(value.lower()) is not None


def is_apns_token(stored: str) -> bool:
    return parse(stored) is not None


def parse(stored: str) -> tuple[str, bool] | None:
    """The device token and whether it is the sandbox's, or None for an Expo token."""
    for prefix, sandbox in ((APNS_SANDBOX_PREFIX, True), (APNS_PREFIX, False)):
        if stored.startswith(prefix):
            token = stored[len(prefix) :]
            return (token, sandbox) if is_apns_device_token(token) else None
    return None


def configured() -> bool:
    return bool(settings.APNS_KEY_ID and settings.APNS_TEAM_ID and settings.APNS_KEY)


_provider: tuple[str, float, str] | None = None


def provider_token(now: float | None = None) -> str:
    """The signed JWT APNs takes as `authorization: bearer`, reused for 50 minutes."""
    global _provider
    at = time.time() if now is None else now
    key_material = settings.APNS_KEY.replace("\\n", "\n").strip()
    identity = f"{settings.APNS_KEY_ID}:{settings.APNS_TEAM_ID}:{hash(key_material)}"
    if (
        _provider is not None
        and _provider[2] == identity
        and at - _provider[1] < PROVIDER_TOKEN_SECONDS
    ):
        return _provider[0]
    token = jwt.encode(
        {"iss": settings.APNS_TEAM_ID, "iat": int(at)},
        key_material,
        algorithm="ES256",
        headers={"kid": settings.APNS_KEY_ID},
    )
    _provider = (token, at, identity)
    return token


def payload(*, title: str, body: str, agent_id: str, kind: str) -> dict[str, Any]:
    """What the phone receives: the alert, the sound, and what the app reads to open the agent."""
    return {
        "aps": {
            "alert": {"title": title, "body": body},
            "sound": "default",
            "badge": 1,
        },
        "agentId": agent_id,
        "kind": kind,
    }


@dataclass(frozen=True)
class Answer:
    status: int
    reason: str | None

    @property
    def sent(self) -> bool:
        return self.status == 200

    @property
    def gone(self) -> bool:
        return self.status == 410 or (self.reason in GONE_REASONS)


async def send(
    client: httpx.AsyncClient,
    stored: str,
    message: dict[str, Any],
    *,
    urgent: bool,
    collapse_id: str | None = None,
) -> Answer:
    parsed = parse(stored)
    if parsed is None:
        return Answer(status=400, reason="BadDeviceToken")
    device, sandbox = parsed
    headers = {
        "authorization": f"bearer {provider_token()}",
        "apns-topic": settings.APNS_TOPIC,
        "apns-push-type": "alert",
        # Needing the person wakes the phone at once; a finished turn may wait for a good moment.
        "apns-priority": "10" if urgent else "5",
        "apns-expiration": str(int(time.time()) + 24 * 60 * 60),
    }
    if collapse_id is not None:
        headers["apns-collapse-id"] = collapse_id[:64]
    host = APNS_SANDBOX_HOST if sandbox else APNS_HOST
    response = await client.post(
        f"{host}/3/device/{device}", json=message, headers=headers
    )
    reason: str | None = None
    if response.status_code != 200:
        try:
            reason = str(response.json().get("reason") or "") or None
        except ValueError:
            reason = None
    return Answer(status=response.status_code, reason=reason)


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(http2=True, timeout=15)
