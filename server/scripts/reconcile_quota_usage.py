"""Reconcile quota-usage events with the actual content in the database.

Quota usage (the Settings usage bars AND limit enforcement) is computed
from `spaire.storage.bytes` / `spaire.video.uploaded` events, which only
started being emitted when the quota producers shipped. Content uploaded
BEFORE that counts as zero: the dashboard under-reports and limits are
under-enforced by exactly the pre-existing volume.

This script computes, per organization, the TRUE usage from the source
tables (sum of uploaded file sizes; sum of ready video durations) and
emits one corrective delta event closing the gap between truth and what
the events currently sum to. It is safe to re-run: once reconciled, the
gap is zero and no event is written. Content uploaded after the
producers shipped is already covered by its own events, so the
correction never double-counts.

`video_views_monthly` is intentionally NOT reconciled: it is a monthly
counter and there is no historical per-view record to rebuild it from.

Usage:
    python -m scripts.reconcile_quota_usage run            # all orgs
    python -m scripts.reconcile_quota_usage run --org acme # one org
    python -m scripts.reconcile_quota_usage run --dry-run  # report only
"""

import asyncio
import logging.config
from functools import wraps
from typing import Any
from uuid import UUID

import structlog
import typer
from sqlalchemy import func, select

from polar.file.service import STORAGE_EXEMPT_SERVICES
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Course, CourseLesson, CourseModule, File, Organization
from polar.postgres import create_async_engine
from polar.quotas.definitions import QuotaKey, get_definition
from polar.quotas.producers import emit_storage_delta, emit_video_uploaded
from polar.quotas.repository import quota_event_repository

cli = typer.Typer()


def drop_all(*args: Any, **kwargs: Any) -> Any:
    raise structlog.DropEvent


structlog.configure(processors=[drop_all])
logging.config.dictConfig({"version": 1, "disable_existing_loggers": True})


def typer_async(f):  # type: ignore
    @wraps(f)
    def wrapper(*args, **kwargs):  # type: ignore
        return asyncio.run(f(*args, **kwargs))

    return wrapper


async def _true_storage_bytes(session: Any, organization_id: UUID) -> int:
    statement = select(func.coalesce(func.sum(File.size), 0)).where(
        File.organization_id == organization_id,
        File.deleted_at.is_(None),
        File.is_uploaded.is_(True),
        File.service.not_in(list(STORAGE_EXEMPT_SERVICES)),
    )
    result = await session.execute(statement)
    return int(result.scalar_one())


async def _true_video_seconds(session: Any, organization_id: UUID) -> int:
    statement = (
        select(func.coalesce(func.sum(CourseLesson.duration_seconds), 0))
        .join(CourseModule, CourseLesson.module_id == CourseModule.id)
        .join(Course, CourseModule.course_id == Course.id)
        .where(
            Course.organization_id == organization_id,
            Course.deleted_at.is_(None),
            CourseModule.deleted_at.is_(None),
            CourseLesson.deleted_at.is_(None),
            CourseLesson.mux_status == "ready",
        )
    )
    result = await session.execute(statement)
    return int(result.scalar_one())


@cli.command(help="Reconcile quota events with actual stored content.")
@typer_async
async def run(
    org: str | None = typer.Option(
        None, "--org", help="Limit to one creator org (slug or UUID)."
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Report gaps without writing events."
    ),
) -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        statement = select(Organization).where(Organization.deleted_at.is_(None))
        if org is not None:
            if "-" in org and len(org) >= 32:
                statement = statement.where(Organization.id == org)
            else:
                statement = statement.where(Organization.slug == org)
        result = await session.execute(statement)
        organizations = list(result.scalars().all())
        if org is not None and not organizations:
            typer.echo(f"❌ No organization found for '{org}'.", err=True)
            raise typer.Exit(code=1)

        repository = quota_event_repository(session)
        storage_def = get_definition(QuotaKey.storage_gb)
        video_def = get_definition(QuotaKey.video_hours_hosted)

        corrected = 0
        for organization in organizations:
            recorded_storage = await repository.get_quota_usage_storage_units(
                organization_id=organization.id, definition=storage_def
            )
            true_storage = await _true_storage_bytes(session, organization.id)
            storage_gap = true_storage - recorded_storage

            recorded_video = await repository.get_quota_usage_storage_units(
                organization_id=organization.id, definition=video_def
            )
            true_video = await _true_video_seconds(session, organization.id)
            video_gap = true_video - recorded_video

            if storage_gap == 0 and video_gap == 0:
                continue

            corrected += 1
            typer.echo(
                f"{organization.slug}: "
                f"storage {recorded_storage}B recorded vs {true_storage}B "
                f"actual (delta {storage_gap:+}B); "
                f"video {recorded_video}s recorded vs {true_video}s actual "
                f"(delta {video_gap:+}s)"
            )
            if dry_run:
                continue

            if storage_gap != 0:
                emit_storage_delta(
                    session,
                    organization_id=organization.id,
                    bytes_delta=storage_gap,
                )
            if video_gap != 0:
                emit_video_uploaded(
                    session,
                    organization_id=organization.id,
                    duration_seconds=video_gap,
                )

        if dry_run:
            typer.echo(f"(dry-run) {corrected} org(s) need correction.")
            return

        await session.commit()
        typer.echo(f"✓ Reconciled quota usage for {corrected} org(s).")


if __name__ == "__main__":
    cli()
