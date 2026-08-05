"""Subscriber custom-field helpers used by the flow engine.

A `set_field` upserts (subscriber_id, key) → value, soft-deleting any
prior row so the unique index stays clean. `get_field` / `list_fields`
read for audience evaluation and analytics. The `update-field` action in
the flow engine is the only writer today; audience/branch readers will
land alongside the editor exposing a `custom_field` rule.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from polar.kit.utils import utc_now
from polar.models.email_subscriber_custom_field import EmailSubscriberCustomField
from polar.postgres import AsyncSession

_KEY_LIMIT = 80
_VALUE_LIMIT = 512


def _normalise_key(key: str) -> str:
    return (key or "").strip()[:_KEY_LIMIT]


def _normalise_value(value: str | None) -> str | None:
    if value is None:
        return None
    return str(value)[:_VALUE_LIMIT]


async def set_field(
    session: AsyncSession,
    subscriber_id: UUID,
    key: str,
    value: str | None,
) -> EmailSubscriberCustomField | None:
    """Upsert (subscriber_id, key) → value.

    Existing rows are soft-deleted before the new row is inserted so the
    unique constraint on (subscriber_id, key, deleted_at) holds. Returns
    the new row, or None when `key` was empty (no-op).
    """
    key = _normalise_key(key)
    if not key:
        return None
    value = _normalise_value(value)

    statement = select(EmailSubscriberCustomField).where(
        EmailSubscriberCustomField.subscriber_id == subscriber_id,
        EmailSubscriberCustomField.key == key,
        EmailSubscriberCustomField.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    existing = result.scalar_one_or_none()
    now = utc_now()
    if existing is not None:
        existing.deleted_at = now
    row = EmailSubscriberCustomField(
        subscriber_id=subscriber_id,
        key=key,
        value=value,
        set_at=now,
    )
    session.add(row)
    await session.flush()
    return row


async def get_field(
    session: AsyncSession, subscriber_id: UUID, key: str
) -> str | None:
    key = _normalise_key(key)
    if not key:
        return None
    statement = select(EmailSubscriberCustomField.value).where(
        EmailSubscriberCustomField.subscriber_id == subscriber_id,
        EmailSubscriberCustomField.key == key,
        EmailSubscriberCustomField.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    row = result.first()
    return row[0] if row is not None else None


async def list_fields(
    session: AsyncSession, subscriber_id: UUID
) -> dict[str, str | None]:
    statement = (
        select(
            EmailSubscriberCustomField.key,
            EmailSubscriberCustomField.value,
        )
        .where(
            EmailSubscriberCustomField.subscriber_id == subscriber_id,
            EmailSubscriberCustomField.deleted_at.is_(None),
        )
        .order_by(EmailSubscriberCustomField.key.asc())
    )
    result = await session.execute(statement)
    return {row[0]: row[1] for row in result.all()}


async def delete_field(
    session: AsyncSession, subscriber_id: UUID, key: str
) -> None:
    key = _normalise_key(key)
    if not key:
        return
    statement = select(EmailSubscriberCustomField).where(
        EmailSubscriberCustomField.subscriber_id == subscriber_id,
        EmailSubscriberCustomField.key == key,
        EmailSubscriberCustomField.deleted_at.is_(None),
    )
    result = await session.execute(statement)
    row = result.scalar_one_or_none()
    if row is None:
        return
    row.deleted_at = utc_now()
    await session.flush()
