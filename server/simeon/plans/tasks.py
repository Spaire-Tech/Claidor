"""The webhooks that keep the subscription copy true, and the reporter
that sends usage to Stripe's meters every five minutes."""

from __future__ import annotations

import uuid
from typing import cast

import stripe as stripe_lib
import structlog
from apscheduler.triggers.cron import CronTrigger

from simeon.external_event.service import external_event as external_event_service
from simeon.worker import AsyncSessionMaker, TaskPriority, actor

from .service import plans as plans_service
from .stripe_billing import stripe_billing

log: structlog.stdlib.BoundLogger = structlog.get_logger()


async def _apply_subscription_event(event_id: uuid.UUID) -> None:
    async with AsyncSessionMaker() as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            subscription = cast(stripe_lib.Subscription, event.stripe_data.data.object)
            await plans_service.apply_stripe_subscription(session, subscription)


@actor(
    actor_name="stripe.webhook.customer.subscription.created",
    priority=TaskPriority.HIGH,
)
async def customer_subscription_created(event_id: uuid.UUID) -> None:
    await _apply_subscription_event(event_id)


@actor(
    actor_name="stripe.webhook.customer.subscription.updated",
    priority=TaskPriority.HIGH,
)
async def customer_subscription_updated(event_id: uuid.UUID) -> None:
    await _apply_subscription_event(event_id)


@actor(
    actor_name="stripe.webhook.customer.subscription.deleted",
    priority=TaskPriority.HIGH,
)
async def customer_subscription_deleted(event_id: uuid.UUID) -> None:
    await _apply_subscription_event(event_id)


@actor(
    actor_name="stripe.webhook.checkout.session.completed",
    priority=TaskPriority.HIGH,
)
async def checkout_session_completed(event_id: uuid.UUID) -> None:
    """The checkout finished. Its subscription usually arrives through
    `customer.subscription.created` too; copying it in here as well
    means the person's plan is known even if that event is late."""
    async with AsyncSessionMaker() as session:
        async with external_event_service.handle_stripe(session, event_id) as event:
            checkout = cast(stripe_lib.checkout.Session, event.stripe_data.data.object)
            subscription_id = checkout.get("subscription")
            if isinstance(subscription_id, str) and subscription_id:
                subscription = await stripe_billing.retrieve_subscription(
                    subscription_id
                )
                await plans_service.apply_stripe_subscription(session, subscription)
            elif subscription_id is not None and hasattr(subscription_id, "get"):
                await plans_service.apply_stripe_subscription(session, subscription_id)


@actor(
    actor_name="plans.report_usage",
    cron_trigger=CronTrigger(minute="*/5"),
    priority=TaskPriority.LOW,
    max_retries=0,
)
async def plans_report_usage() -> None:
    async with AsyncSessionMaker() as session:
        counts = await plans_service.report_usage(session)
    log.info("plans.report_usage.done", **counts)
