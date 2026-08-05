"""HTTP routes for customer-portal notifications.

Mounted at /v1/customer-portal/notifications.

  GET  /                — list latest 50, oldest first dropped
  POST /{id}/read       — mark one read
  POST /read-all        — mark all unread as read
  GET  /unread-count    — bell badge
  GET  /preferences     — current email_enabled
  PATCH /preferences    — toggle email_enabled
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import UUID4

from polar.customer_portal.auth import CustomerPortalUnionRead
from polar.customer_portal.utils import get_customer_id
from polar.kit.schemas import Schema, TimestampedSchema
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .repository import CustomerNotificationPreferencesRepository
from .service import customer_notifications

router = APIRouter(
    prefix="/customer-portal/notifications",
    tags=["customer_portal_notifications", APITag.public],
)


NotificationID = Annotated[UUID4, ...]


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------


class CustomerNotificationRead(TimestampedSchema):
    id: UUID4
    type: str
    payload: dict
    read_at: datetime | None = None


class UnreadCountRead(Schema):
    unread: int


class CustomerNotificationPreferencesRead(Schema):
    email_enabled: bool
    bell_enabled: bool = True


class CustomerNotificationPreferencesUpdate(Schema):
    """Both fields optional — PATCH semantics; pass only what you want
    to change."""

    email_enabled: bool | None = None
    bell_enabled: bool | None = None


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[CustomerNotificationRead],
    summary="List Customer Notifications",
)
async def list_notifications(
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CustomerNotificationRead]:
    customer_id = get_customer_id(auth_subject)
    rows = await customer_notifications.list_for_customer(
        session, customer_id=customer_id
    )
    return [
        CustomerNotificationRead.model_validate(r, from_attributes=True)
        for r in rows
    ]


@router.get(
    "/unread-count",
    response_model=UnreadCountRead,
    summary="Unread Notification Count",
)
async def unread_count(
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> UnreadCountRead:
    customer_id = get_customer_id(auth_subject)
    n = await customer_notifications.unread_count(session, customer_id=customer_id)
    return UnreadCountRead(unread=n)


@router.post(
    "/{notification_id}/read",
    status_code=204,
    summary="Mark Notification Read",
)
async def mark_read(
    notification_id: NotificationID,
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    await customer_notifications.mark_read(
        session, customer_id=customer_id, notification_id=notification_id
    )


@router.post(
    "/read-all",
    status_code=204,
    summary="Mark All Notifications Read",
)
async def mark_all_read(
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    await customer_notifications.mark_all_read(session, customer_id=customer_id)


@router.get(
    "/preferences",
    response_model=CustomerNotificationPreferencesRead,
    summary="Get Notification Preferences",
)
async def get_preferences(
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> CustomerNotificationPreferencesRead:
    customer_id = get_customer_id(auth_subject)
    repo = CustomerNotificationPreferencesRepository.from_session(session)
    prefs = await repo.get_for_customer(customer_id)
    return CustomerNotificationPreferencesRead(
        email_enabled=True if prefs is None else prefs.email_enabled,
        bell_enabled=True if prefs is None else prefs.bell_enabled,
    )


@router.patch(
    "/preferences",
    response_model=CustomerNotificationPreferencesRead,
    summary="Update Notification Preferences",
)
async def update_preferences(
    payload: CustomerNotificationPreferencesUpdate,
    auth_subject: CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> CustomerNotificationPreferencesRead:
    customer_id = get_customer_id(auth_subject)
    repo = CustomerNotificationPreferencesRepository.from_session(session)
    prefs = await repo.upsert(
        customer_id,
        email_enabled=payload.email_enabled,
        bell_enabled=payload.bell_enabled,
    )
    return CustomerNotificationPreferencesRead(
        email_enabled=prefs.email_enabled,
        bell_enabled=prefs.bell_enabled,
    )


# Silence helper
_ = (UUID, HTTPException)
