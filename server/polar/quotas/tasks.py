"""Background actors for quota notifications.

Daily cron task scans every organization, computes each gated quota's
usage percentage, and emails the org admin when a quota crosses 80%
or 100%. Each (org, quota, threshold, period) is notified at most
once; lifetime-scope thresholds re-arm when usage drops back below.
"""

import uuid

import structlog
from sqlalchemy import select

from polar.models import Organization
from polar.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor, enqueue_job

from .notifications import check_organization, check_organization_by_id

log: structlog.stdlib.BoundLogger = structlog.get_logger()


@actor(
    actor_name="quotas.notify_thresholds",
    cron_trigger=CronTrigger(hour=9, minute=0),
    priority=TaskPriority.LOW,
    max_retries=0,
)
async def notify_thresholds() -> None:
    """Iterate every organization and enqueue per-org check tasks.

    Fan-out keeps each worker job small and isolates failures per org —
    a single misbehaving organization can't fail the entire pass.
    """
    async with AsyncSessionMaker() as session:
        statement = select(Organization.id).where(
            Organization.deleted_at.is_(None),
            Organization.blocked_at.is_(None),
        )
        result = await session.stream_scalars(statement)
        count = 0
        async for organization_id in result:
            enqueue_job(
                "quotas.notify_thresholds_for_organization",
                organization_id=organization_id,
            )
            count += 1
        log.info("quotas.notify_thresholds.scheduled", count=count)


@actor(
    actor_name="quotas.notify_thresholds_for_organization",
    priority=TaskPriority.LOW,
)
async def notify_thresholds_for_organization(
    organization_id: uuid.UUID,
) -> None:
    async with AsyncSessionMaker() as session:
        result = await check_organization_by_id(session, organization_id)
        if result is None:
            log.info(
                "quotas.notify_thresholds.org_missing",
                organization_id=str(organization_id),
            )
            return
        log.info(
            "quotas.notify_thresholds.org_done",
            organization_id=str(organization_id),
            **result,
        )
