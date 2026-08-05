"""Dramatiq actor for sending the email side of a customer notification.

The bell row + SSE happen synchronously in the service; the email is
deferred because rendering + SES is the slow part."""

from __future__ import annotations

from uuid import UUID

import structlog

from polar.email.sender import DEFAULT_FROM_NAME, enqueue_email
from polar.models.customer import Customer
from polar.worker import AsyncSessionMaker, TaskPriority, actor

from .notification_types import get_from_name, render
from .repository import CustomerNotificationRepository

log = structlog.get_logger()


@actor(actor_name="customer_notification.send_email", priority=TaskPriority.LOW)
async def send_email(notification_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        repo = CustomerNotificationRepository.from_session(session)
        notif = await repo.get_by_id(notification_id)
        if notif is None:
            log.warning(
                "customer_notification.send_email.not_found",
                notification_id=notification_id,
            )
            return

        customer = await session.get(Customer, notif.customer_id)
        if customer is None or not customer.email:
            return

        # Stamp the recipient onto the payload so the renderer's
        # FooterCustomer block can show "this email was sent to ...".
        # We do this as a side-channel key (underscore prefix) instead
        # of a permanent payload column — it's only relevant at email
        # render time, not at bell display time.
        payload = dict(notif.payload or {})
        payload["_recipient_email"] = customer.email

        subject, body = render(notif.type, payload)

        # From-name override: for org-scoped notifications (community
        # events, activities) the customer expects mail from the
        # creator's brand, not "Spaire". Send address stays on the
        # platform domain — only the human display name changes.
        from_name = get_from_name(notif.type, payload) or DEFAULT_FROM_NAME

        enqueue_email(
            to_email_addr=customer.email,
            subject=subject,
            html_content=body,
            from_name=from_name,
        )
