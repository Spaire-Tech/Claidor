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
    SQLAlchemyMiddleware,
    TaskPriority,
    actor,
    enqueue_job,
)

from .box_hosts import BoxHostError
from .box_service import BoxBrokerRefused, BoxEnsureInProgress, broker

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
        slept = await broker.hibernate_idle(session, redis, update=_update_idle)
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


def _update_idle(user_id: UUID) -> None:
    enqueue_job("sand.box.update_idle", user_id=str(user_id))


@actor(actor_name="sand.box.update_idle", priority=TaskPriority.LOW, max_retries=0)
async def sand_box_update_idle(user_id: str) -> None:
    """An out-of-date box the sleeper found idle, with no app on it,
    replaced on its files (`broker.update_idle`). A refusal leaves it as it
    was; the sleeper sends it again after `UPDATE_RETRY_SECONDS`."""
    try:
        async with AsyncSessionMaker() as session:
            outcome = await broker.update_idle(
                session,
                UUID(user_id),
                committed=SQLAlchemyMiddleware.get_async_session,
            )
    except (BoxHostError, BoxBrokerRefused, BoxEnsureInProgress, TimeoutError) as error:
        log.warning("sand.box.update_idle.failed", user=user_id, error=str(error))
        return
    log.info("sand.box.update_idle.done", user=user_id, outcome=outcome)
