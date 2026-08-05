"""Customer notification service.

`send_to_customer` is the one entry point — it inserts a customer_notifications
row, publishes an SSE event on the customer's channel (for the bell badge to
update live), and enqueues an email if the customer's prefs allow it AND the
notification type is in the email allowlist."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

import structlog

from polar.email.sender import enqueue_email
from polar.eventstream.service import publish as publish_event
from polar.logging import Logger
from polar.models.customer import Customer
from polar.models.customer_notification import CustomerNotification
from polar.postgres import AsyncSession
from polar.worker import enqueue_job

from .notification_types import EMAIL_TYPES, render
from .repository import (
    CustomerNotificationPreferencesRepository,
    CustomerNotificationRepository,
)

log: Logger = structlog.get_logger()


class CustomerNotificationService:
    async def send_to_customer(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
        notification_type: str,
        payload: dict,
    ) -> CustomerNotification | None:
        """Insert a notification row + publish SSE + queue email.

        Returns the inserted row (or None when the customer has muted
        the bell channel and there's nothing to insert). Email is
        enqueued via dramatiq so the request thread isn't blocked on
        render."""
        prefs_repo = CustomerNotificationPreferencesRepository.from_session(
            session
        )
        # Load prefs once; cheap and avoids two roundtrips.
        prefs = await prefs_repo.get_for_customer(customer_id)
        bell_on = True if prefs is None else prefs.bell_enabled
        email_on = True if prefs is None else prefs.email_enabled

        log.info(
            "customer_notification.send_to_customer",
            customer_id=str(customer_id),
            type=notification_type,
            bell_on=bell_on,
            email_on=email_on,
            in_email_types=notification_type in EMAIL_TYPES,
        )

        notif: CustomerNotification | None = None
        if bell_on:
            repo = CustomerNotificationRepository.from_session(session)
            notif = CustomerNotification(
                customer_id=customer_id,
                type=notification_type,
                payload=payload,
            )
            await repo.create(notif, flush=True)
            log.info(
                "customer_notification.bell_row_created",
                customer_id=str(customer_id),
                type=notification_type,
                notification_id=str(notif.id),
            )

            # Live bell badge — fire and forget. The receiver simply
            # increments its unread count, then refetches the list when
            # the dropdown is opened.
            try:
                await publish_event(
                    key="customer_notification.created",
                    payload={
                        "notification_id": str(notif.id),
                        "type": notification_type,
                    },
                    customer_id=customer_id,
                )
            except Exception:
                # SSE is best-effort; don't break the write path.
                pass

        # Email channel — gated by per-customer prefs + the type allowlist.
        # When the bell row was created we can route via the existing
        # send-email actor (which loads body/recipient off the row). With
        # the bell muted we send directly so a "emails on, bell off"
        # customer still gets the email.
        if notification_type in EMAIL_TYPES and email_on:
            if notif is not None:
                enqueue_job(
                    "customer_notification.send_email",
                    notification_id=notif.id,
                )
                log.info(
                    "customer_notification.email_enqueued_via_row",
                    customer_id=str(customer_id),
                    type=notification_type,
                    notification_id=str(notif.id),
                )
            else:
                from polar.customer.repository import CustomerRepository
                from polar.email.sender import enqueue_email

                customer = await CustomerRepository.from_session(
                    session
                ).get_by_id(customer_id)
                if customer is not None and customer.email:
                    subject, body = render(notification_type, payload)
                    enqueue_email(
                        to_email_addr=customer.email,
                        subject=subject,
                        html_content=body,
                    )
                    log.info(
                        "customer_notification.email_enqueued_direct",
                        customer_id=str(customer_id),
                        type=notification_type,
                        to=customer.email,
                    )
                else:
                    log.warning(
                        "customer_notification.email_skipped",
                        customer_id=str(customer_id),
                        type=notification_type,
                        reason="customer_missing_or_no_email",
                    )
        elif notification_type in EMAIL_TYPES and not email_on:
            log.info(
                "customer_notification.email_skipped",
                customer_id=str(customer_id),
                type=notification_type,
                reason="customer_email_prefs_off",
            )

        return notif

    async def send_to_customers(
        self,
        session: AsyncSession,
        *,
        customer_ids: Sequence[UUID],
        notification_type: str,
        payload: dict,
    ) -> None:
        for cid in customer_ids:
            await self.send_to_customer(
                session,
                customer_id=cid,
                notification_type=notification_type,
                payload=payload,
            )

    async def list_for_customer(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
        limit: int = 50,
    ) -> list[CustomerNotification]:
        repo = CustomerNotificationRepository.from_session(session)
        return list(await repo.list_for_customer(customer_id, limit=limit))

    async def unread_count(
        self, session: AsyncSession, *, customer_id: UUID
    ) -> int:
        repo = CustomerNotificationRepository.from_session(session)
        return await repo.unread_count(customer_id)

    async def mark_read(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
        notification_id: UUID,
    ) -> None:
        repo = CustomerNotificationRepository.from_session(session)
        await repo.mark_read(customer_id, notification_id)

    async def mark_all_read(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
    ) -> None:
        repo = CustomerNotificationRepository.from_session(session)
        await repo.mark_all_read(customer_id)


customer_notifications = CustomerNotificationService()

# Re-export so tasks can import without reaching into notification_types directly
_render = render

# Quiet ruff: Customer is type-only in this file but is referenced in callers.
_ = Customer
# enqueue_email is re-exported for the dramatiq actor in tasks.py
__all__ = [
    "CustomerNotificationService",
    "customer_notifications",
    "enqueue_email",
]
