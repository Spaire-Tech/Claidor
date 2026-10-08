"""The push itself (8 October 2026): `POST /desktop/push` (`push.py`)
queues it, this sends it to each of the person's phones through Expo.

One request to Expo for all of a person's phones, through the client the
inherited notifications already use (`notifications/tasks/push.py`). A
phone Expo says is gone (`DeviceNotRegistered`: the app was deleted, or
notifications were turned off for it) is removed, so it is not asked
again. Nothing is retried: a push that arrives minutes late is worse
than none, and a retry after a half-answered request would buzz twice.
"""

from __future__ import annotations

import asyncio
from uuid import UUID

import structlog
from exponent_server_sdk import DeviceNotRegisteredError, PushTicketError

from simeon.notification_recipient.repository import NotificationRecipientRepository
from simeon.notifications.tasks.push import (
    ExpoPushMessage,
    is_expo_push_token,
    publish_push_messages,
)
from simeon.worker import AsyncSessionMaker, TaskPriority, actor

log = structlog.get_logger()

#: Expo keeps trying a phone that is off for this long, then drops the push.
PUSH_TTL_SECONDS = 60 * 60 * 24


@actor(actor_name="desktop.push.send", priority=TaskPriority.HIGH, max_retries=0)
async def desktop_push_send(
    user_id: str, agent_id: str, kind: str, title: str, body: str
) -> None:
    async with AsyncSessionMaker() as session:
        repository = NotificationRecipientRepository.from_session(session)
        devices = [
            device
            for device in await repository.list_by_user(UUID(user_id), None, None)
            if is_expo_push_token(device.expo_push_token)
        ]
        if not devices:
            log.info("desktop.push.no_devices", user_id=user_id, agent_id=agent_id)
            return

        messages = [
            ExpoPushMessage(
                to=device.expo_push_token,
                title=title,
                body=body,
                data={"agentId": agent_id, "kind": kind},
                sound="default",
                badge=1,
                # Needing the person is worth waking the phone for; a
                # finished turn takes Expo's default (immediate on iOS).
                priority="high" if kind == "agent-needs-input" else "default",
                ttl=PUSH_TTL_SECONDS,
                channel_id="default",
            )
            for device in devices
        ]
        try:
            tickets = await asyncio.to_thread(publish_push_messages, messages)
        except Exception as error:
            log.warning(
                "desktop.push.failed",
                user_id=user_id,
                agent_id=agent_id,
                kind=kind,
                error=f"{type(error).__name__}: {error}",
            )
            return

        by_token = {device.expo_push_token: device for device in devices}
        sent = 0
        for ticket in tickets:
            device = by_token.get(ticket.push_message.to)
            try:
                ticket.validate_response()
            except DeviceNotRegisteredError:
                if device is not None:
                    await repository.soft_delete(device)
                    log.info(
                        "desktop.push.device_removed",
                        user_id=user_id,
                        device_id=str(device.id),
                    )
                continue
            except PushTicketError:
                log.warning(
                    "desktop.push.refused",
                    user_id=user_id,
                    device_id=str(device.id) if device is not None else None,
                    message=ticket.message,
                    details=ticket.details,
                )
                continue
            sent += 1

        log.info(
            "desktop.push.sent",
            user_id=user_id,
            agent_id=agent_id,
            kind=kind,
            sent=sent,
            devices=len(devices),
        )
