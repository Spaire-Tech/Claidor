"""Pushes to the person's iPhone (8 October 2026).

The founder: "i want the app ready. mobile ios... plus other stuff, like
notification etc." Until today an agent that finished a turn or needed
the person said so only on the Mac (`os-notification-manager.ts`); with
the Mac closed nobody heard. The agents run in the person's box, and the
host there now runs the Mac's own decision over the same agents list and
posts each notification here (`host/extensions/notifications/`). This
module takes it the rest of the way, through Expo's push service.

Three routes, all under `/desktop`:

- `POST /desktop/push-devices` `{expo_push_token, platform}`: the phone
  app, signed in like the Mac (`get_desktop_session`), registers itself.
  The native app (`ios/`) sends `{apns_token, apns_environment}` instead:
  Apple's own device token, kept as `apns:<hex>` (`apns-sandbox:<hex>`
  for a build run from Xcode) and sent to straight (`apns.py`).
  Calling it again changes nothing; a token another person registered
  moves to this one, because a phone gets the pushes of whoever is signed
  in on it now.
- `DELETE /desktop/push-devices` `{expo_push_token}`: the phone signs
  out. Soft deleted, like `NotificationRecipientService.delete`.
- `POST /desktop/push` `{agent_id, kind, title, body}`: the box's host,
  with the box's own credential (`get_desktop_or_box_session`). It calls
  blindly: a person with no phone gets `{"sent": 0}`. Otherwise the push
  is queued (`desktop.push.send`, `push_tasks.py`) and the answer is 202.

The devices are `notification_recipients` rows, the table the inherited
`/notifications/recipients` routes keep. Those routes ask for web scopes
(`notification_recipient/auth.py`) that a desktop token does not carry,
which is why the phone registers here instead.

A runaway loop must not buzz a phone all afternoon: one push per agent and
kind every `SAME_PUSH_SECONDS`, and `PUSHES_PER_MINUTE` a person in all.
Past that the push is dropped with `desktop.push.capped`.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from simeon.models import DesktopSession
from simeon.models.notification_recipient import NotificationRecipient
from simeon.notification_recipient.repository import NotificationRecipientRepository
from simeon.notification_recipient.schemas import NotificationRecipientPlatform
from simeon.notifications.tasks.push import is_expo_push_token
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.worker import enqueue_job

from . import apns
from .auth import get_desktop_or_box_session, get_desktop_session

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

PushKind = Literal["agent-done", "agent-needs-input"]

#: A banner shows about this much; Expo refuses a payload over 4 KB.
TITLE_MAX_CHARS = 120
BODY_MAX_CHARS = 400
#: The same agent's same news at most once in this many seconds...
SAME_PUSH_SECONDS = 30
#: ...and this many pushes a minute for a person, whatever their agents do.
PUSHES_PER_MINUTE = 20


def clip(text: str, limit: int) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else f"{flat[: limit - 1].rstrip()}…"


class PushDeviceBody(BaseModel):
    """One phone: the Expo app's push token, or the native app's APNs token."""

    model_config = ConfigDict(extra="ignore")
    expo_push_token: str | None = Field(default=None, max_length=255)
    apns_token: str | None = Field(default=None, max_length=200)
    #: `sandbox` for a build run from Xcode; TestFlight and the App Store are `production`.
    apns_environment: Literal["production", "sandbox"] = "production"

    @model_validator(mode="after")
    def _one_token(self) -> PushDeviceBody:
        expo = (self.expo_push_token or "").strip()
        device = (self.apns_token or "").strip().lower()
        if bool(expo) == bool(device):
            raise ValueError("Send one of expo_push_token or apns_token.")
        if expo and not is_expo_push_token(expo):
            raise ValueError(
                "expo_push_token must be an Expo push token, "
                "ExponentPushToken[…] or ExpoPushToken[…]."
            )
        if device and not apns.is_apns_device_token(device):
            raise ValueError("apns_token must be the device token in hexadecimal.")
        self.expo_push_token = expo or None
        self.apns_token = device or None
        return self

    @property
    def token(self) -> str:
        """What the row keeps: the Expo token as is, an APNs token with its prefix."""
        if self.apns_token is not None:
            return apns.stored_token(
                self.apns_token, sandbox=self.apns_environment == "sandbox"
            )
        assert self.expo_push_token is not None
        return self.expo_push_token


class PushDeviceRegisterBody(PushDeviceBody):
    platform: NotificationRecipientPlatform = NotificationRecipientPlatform.ios


class PushBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agent_id: str = Field(min_length=1, max_length=200)
    kind: PushKind
    title: str = Field(max_length=20_000)
    body: str = Field(max_length=20_000)


# --- the devices --------------------------------------------------------------


async def register_device(
    session: AsyncSession,
    user_id: UUID,
    token: str,
    platform: NotificationRecipientPlatform,
) -> NotificationRecipient:
    repository = NotificationRecipientRepository.from_session(session)
    mine: NotificationRecipient | None = None
    for row in await repository.list_by_expo_token(token):
        if row.user_id == user_id and mine is None:
            mine = row
            continue
        # Someone else signed in on this phone before, or a duplicate:
        # their pushes must not reach the person holding it now.
        await repository.soft_delete(row)
        log.info(
            "desktop.push.device_moved",
            device_id=str(row.id),
            from_user_id=str(row.user_id),
            user_id=str(user_id),
        )
    if mine is not None:
        if mine.platform != platform:
            await repository.update(mine, update_dict={"platform": platform})
        return mine
    return await repository.create(
        NotificationRecipient(
            user_id=user_id, platform=platform, expo_push_token=token
        ),
        flush=True,
    )


async def remove_device(session: AsyncSession, user_id: UUID, token: str) -> int:
    repository = NotificationRecipientRepository.from_session(session)
    rows = await repository.list_by_user(user_id, None, token)
    for row in rows:
        await repository.soft_delete(row)
    return len(rows)


@router.post("/push-devices", name="desktop:push_devices_register")
async def register_push_device(
    body: PushDeviceRegisterBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    device = await register_device(
        session, desktop_session.user_id, body.token, body.platform
    )
    log.info(
        "desktop.push.device_registered",
        user_id=str(desktop_session.user_id),
        device_id=str(device.id),
        platform=str(body.platform),
    )
    return JSONResponse(
        {
            "id": str(device.id),
            "platform": str(device.platform),
            "expo_push_token": device.expo_push_token,
        }
    )


@router.delete("/push-devices", name="desktop:push_devices_remove")
async def remove_push_device(
    body: PushDeviceBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    removed = await remove_device(session, desktop_session.user_id, body.token)
    log.info(
        "desktop.push.device_unregistered",
        user_id=str(desktop_session.user_id),
        removed=removed,
    )
    return JSONResponse({"removed": removed})


# --- the push -----------------------------------------------------------------


async def capped(
    redis: Redis, user_id: str, agent_id: str, kind: PushKind
) -> Literal["same_push", "per_minute"] | None:
    """Why this push is one too many, or None to send it."""
    same = f"desktop:push:same:{user_id}:{kind}:{agent_id}"
    if not await redis.set(same, "1", nx=True, ex=SAME_PUSH_SECONDS):
        return "same_push"
    minute = f"desktop:push:minute:{user_id}"
    count = await redis.incr(minute)
    if count == 1:
        await redis.expire(minute, 60)
    return "per_minute" if count > PUSHES_PER_MINUTE else None


@router.post("/push", name="desktop:push")
async def push(
    body: PushBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    user_id = str(desktop_session.user_id)
    repository = NotificationRecipientRepository.from_session(session)
    devices = await repository.list_by_user(desktop_session.user_id, None, None)
    if not devices:
        return JSONResponse({"sent": 0})

    reason = await capped(redis, user_id, body.agent_id, body.kind)
    if reason is not None:
        log.info(
            "desktop.push.capped",
            user_id=user_id,
            agent_id=body.agent_id,
            kind=body.kind,
            reason=reason,
        )
        return JSONResponse({"sent": 0, "capped": reason})

    enqueue_job(
        "desktop.push.send",
        user_id=user_id,
        agent_id=body.agent_id,
        kind=body.kind,
        title=clip(body.title, TITLE_MAX_CHARS) or "Simeon",
        body=clip(body.body, BODY_MAX_CHARS),
    )
    log.info(
        "desktop.push.queued",
        user_id=user_id,
        agent_id=body.agent_id,
        kind=body.kind,
        devices=len(devices),
    )
    return JSONResponse({"queued": len(devices)}, status_code=202)


__all__ = ["router"]
