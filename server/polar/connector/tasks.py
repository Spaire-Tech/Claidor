"""Watching: the deal room re-reads itself so nobody has to remember to.

A deal's documents live in SharePoint and move without warning. The sync
already does everything right when it runs — content-tag change
detection, a new version never an overwrite, the same unconditional
re-check an upload triggers. What it lacked was anybody running it: a
deal connected on Monday and not opened until Thursday was three days of
silent drift.

So a cron actor walks every connected folder on a cadence and enqueues
one sync job each. Per folder, not one big job: a folder whose tenant is
throttling must not hold up the nine that are fine, and a folder whose
connection has died fails alone, visibly, in its own `error` column —
which the Connections screen already shows.

**Each sync runs as the connection's owner.** The token is delegated —
one person's — so the watch reads exactly what that person can open,
which is the same promise the connector makes everywhere else. When
they leave and the token dies, the folder shows its error and the watch
keeps failing it quietly rather than escalating: a dead connection is a
state the screen carries, not an emergency the worker invents.

The « tell me » half deliberately does not live here. What changed since
a person last looked is *derived* — from artifact and finding timestamps
against their last visit — for the same reason the decision log is
derived from corrections: a stored notification can disagree with the
records; a computed one cannot.
"""

from uuid import UUID

import structlog
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from polar.models import Connection, ConnectionStatus
from polar.models.connector import ConnectedFolder
from polar.worker import AsyncSessionMaker, TaskPriority, actor, enqueue_job

from .service import ConnectorError, connector

log = structlog.get_logger()


@actor(
    actor_name="connector.watch",
    cron_trigger=CronTrigger.from_crontab("*/15 * * * *"),
    priority=TaskPriority.LOW,
)
async def watch() -> None:
    """Every quarter hour, one sync job per healthy connected folder."""
    async with AsyncSessionMaker() as session:
        statement = (
            select(ConnectedFolder.id)
            .join(Connection, Connection.id == ConnectedFolder.connection_id)
            .where(
                ConnectedFolder.deleted_at.is_(None),
                Connection.deleted_at.is_(None),
                Connection.status == ConnectionStatus.active,
            )
        )
        folder_ids = list((await session.execute(statement)).scalars().all())

    for folder_id in folder_ids:
        enqueue_job("connector.sync_folder", folder_id)
    if folder_ids:
        log.info("connector.watch.enqueued", folders=len(folder_ids))


@actor(actor_name="connector.sync_folder", priority=TaskPriority.LOW)
async def sync_folder(folder_id: UUID) -> None:
    """One folder's sync, as its connection's owner.

    A refused sync is not an exception to raise: `service.sync` has
    already written the reason to the folder's own `error` column, which
    is where the Connections screen reads it. Raising would retry a
    failure that will fail identically until a person reconnects.
    """
    async with AsyncSessionMaker() as session:
        folder = await session.get(ConnectedFolder, folder_id)
        if folder is None or folder.deleted_at is not None:
            return
        connection = await session.get(Connection, folder.connection_id)
        if connection is None or connection.status is not ConnectionStatus.active:
            return
        try:
            result = await connector.sync(
                session, folder=folder, user_id=connection.user_id
            )
        except ConnectorError as problem:
            log.info(
                "connector.watch.sync_failed",
                folder=str(folder_id),
                error=str(problem)[:160],
            )
            return
        log.info(
            "connector.watch.synced",
            folder=str(folder_id),
            read=result.get("read"),
            unchanged=result.get("unchanged"),
        )
