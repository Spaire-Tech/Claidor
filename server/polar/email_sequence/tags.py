"""Subscriber tag helpers used by the flow engine.

Wrapped in their own module so the flow engine and the tag-added trigger
(landing later) can share one set of CRUD primitives. All writes are
idempotent: adding an existing tag is a no-op, removing a missing tag
is a no-op.

Tag normalisation: tags are case-insensitive and whitespace-trimmed,
canonicalised to lowercase before any read or write. Previously
"VIP" and "vip" wrote two separate rows while audience filters
lowercased their input — branches that should have matched silently
didn't, and orgs accumulated phantom tag cardinality.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select

from polar.kit.utils import utc_now
from polar.models.email_subscriber_tag import EmailSubscriberTag
from polar.postgres import AsyncSession


def normalize_tag(tag: str | None) -> str:
    """Single canonicalisation used by every tag read/write.

    Lowercase + strip. Returns the empty string for falsy input, so
    callers can treat ``not normalize_tag(...)`` as "skip".
    """
    return (tag or "").strip().lower()


async def add_tag(
    session: AsyncSession, subscriber_id: UUID, tag: str
) -> None:
    tag = normalize_tag(tag)
    if not tag:
        return
    existing = await session.execute(
        select(EmailSubscriberTag).where(
            EmailSubscriberTag.subscriber_id == subscriber_id,
            EmailSubscriberTag.tag == tag,
            EmailSubscriberTag.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none() is not None:
        return
    session.add(
        EmailSubscriberTag(
            subscriber_id=subscriber_id,
            tag=tag,
            added_at=utc_now(),
        )
    )
    await session.flush()


async def remove_tag(
    session: AsyncSession, subscriber_id: UUID, tag: str
) -> None:
    tag = normalize_tag(tag)
    if not tag:
        return
    statement = select(EmailSubscriberTag).where(
        EmailSubscriberTag.subscriber_id == subscriber_id,
        EmailSubscriberTag.tag == tag,
        EmailSubscriberTag.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    row = result.scalar_one_or_none()
    if row is None:
        return
    row.deleted_at = utc_now()
    await session.flush()


async def has_tag(
    session: AsyncSession, subscriber_id: UUID, tag: str
) -> bool:
    tag = normalize_tag(tag)
    if not tag:
        return False
    statement = select(EmailSubscriberTag.id).where(
        EmailSubscriberTag.subscriber_id == subscriber_id,
        EmailSubscriberTag.tag == tag,
        EmailSubscriberTag.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    return result.first() is not None


async def list_tags(
    session: AsyncSession, subscriber_id: UUID
) -> list[str]:
    statement = (
        select(EmailSubscriberTag.tag)
        .where(
            EmailSubscriberTag.subscriber_id == subscriber_id,
            EmailSubscriberTag.deleted_at.is_(None),
        )
        .order_by(EmailSubscriberTag.tag.asc())
    )
    result = await session.execute(statement)
    return [row[0] for row in result.all()]


async def has_any_tag(
    session: AsyncSession, subscriber_id: UUID, tags: Sequence[str]
) -> bool:
    if not tags:
        return False
    normalized = [normalize_tag(t) for t in tags if normalize_tag(t)]
    if not normalized:
        return False
    statement = select(EmailSubscriberTag.id).where(
        EmailSubscriberTag.subscriber_id == subscriber_id,
        EmailSubscriberTag.tag.in_(normalized),
        EmailSubscriberTag.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    return result.first() is not None
