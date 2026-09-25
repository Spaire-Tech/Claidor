"""The cron half of the fire queue (25 September 2026).

Measured in `sand-automation-cloud-sync.ts` `shouldScheduleLocally`:
once the `AutomationsService` answers, the box stops firing a cron-only
routine itself (`triggerListeners(...).length === 0` → not local) and
waits for the server's fire, the way Grok Bot waited for Cursor's. So
serving the RPCs without this actor would silence every cron routine.
The box still fires locally a routine the server does not list as
enabled (a Slack DM listener, one whose create failed), so nothing is
fired twice.

Every minute, the way `subscription.cycle` and the others are declared:
one fire per due routine, never a second pending one, then its next
slot; a box that was off for a day gets one run, not twenty-four.
"""

from __future__ import annotations

import structlog

from polar.worker import (
    AsyncSessionMaker,
    CronTrigger,
    RedisMiddleware,
    TaskPriority,
    actor,
)

from .listeners_service import listeners

log = structlog.get_logger()


@actor(
    actor_name="sand.listeners.fire_due_crons",
    cron_trigger=CronTrigger(minute="*"),
    priority=TaskPriority.LOW,
    max_retries=0,
)
async def sand_listeners_fire_due_crons() -> None:
    redis = RedisMiddleware.get()
    async with AsyncSessionMaker() as session:
        await listeners.fire_due_crons(session, redis)
