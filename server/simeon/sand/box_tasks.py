"""The cloud box's sleep and wake (28 September 2026).

The upstream app's pods hibernated when idle and woke when asked for; the client
half is in the tree and unchanged (the host's `/health` reports `isBusy`
and `lastBusyAtMs`, the window draws `SAND_BOX_RUN_STATE_HIBERNATED` as
"sleeping", every reconnect is an EnsureSandBox that starts it again, and
the box drains every notify topic when its stream connects). This is the
server half the upstream app ran: `box_service.hibernate_idle` every minute, and a
wake whenever the server queues something for a person's box
(`notify.publish`: a routine's fire, a listener event, a shared room).
"""

from __future__ import annotations

from uuid import UUID

import structlog

from simeon.worker import (
    AsyncSessionMaker,
    CronTrigger,
    RedisMiddleware,
    TaskPriority,
    actor,
    enqueue_job,
)

from .box_hosts import BoxHostError
from .box_service import broker

log = structlog.get_logger()

#: A wake refused because the host is full is tried again every minute
#: for an hour; after that the box drains at its next start.
WAKE_RETRY_DELAY_MS = 60_000
WAKE_MAX_ATTEMPTS = 60


@actor(
    actor_name="sand.box.hibernate_idle",
    cron_trigger=CronTrigger(minute="*"),
    priority=TaskPriority.LOW,
    max_retries=0,
)
async def sand_box_hibernate_idle() -> None:
    redis = RedisMiddleware.get()
    async with AsyncSessionMaker() as session:
        slept = await broker.hibernate_idle(session, redis)
    if slept:
        log.info("sand.box.sleeper", slept=[str(box_id) for box_id in slept])


@actor(actor_name="sand.box.wake", priority=TaskPriority.HIGH, max_retries=0)
async def sand_box_wake(user_id: str, attempt: int = 1) -> None:
    async with AsyncSessionMaker() as session:
        try:
            outcome = await broker.wake(session, UUID(user_id))
        except BoxHostError as error:
            log.warning("sand.box.wake.failed", user=user_id, error=str(error))
            return
    if outcome == "deferred":
        log.info("sand.box.wake.deferred", user=user_id, attempt=attempt)
        if attempt < WAKE_MAX_ATTEMPTS:
            enqueue_job(
                "sand.box.wake",
                user_id=user_id,
                attempt=attempt + 1,
                delay=WAKE_RETRY_DELAY_MS,
            )
