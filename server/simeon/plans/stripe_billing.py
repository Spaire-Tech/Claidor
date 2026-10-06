"""The handful of Stripe Billing calls the plans make, in one place, so a
test replaces one object (`simeon.plans.service.stripe_billing`).

Every call is the library's async form on the account key in settings.
The subscription's period dates live on its items since Stripe's 2025
API versions and on the subscription itself before; `period_of` reads
both.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import stripe as stripe_lib

from simeon.config import settings

stripe_lib.api_key = settings.STRIPE_SECRET_KEY


def epoch_to_datetime(value: Any) -> datetime | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


def first_item(subscription: Any) -> dict[str, Any] | None:
    items = subscription.get("items") if hasattr(subscription, "get") else None
    data = items.get("data") if items is not None and hasattr(items, "get") else None
    if not data:
        return None
    item = data[0]
    return dict(item) if not isinstance(item, dict) else item


def period_of(subscription: Any) -> tuple[datetime | None, datetime | None]:
    """`current_period_start` and `_end`, from the subscription (API
    versions before 2025) or its first item (after)."""
    start = epoch_to_datetime(subscription.get("current_period_start"))
    end = epoch_to_datetime(subscription.get("current_period_end"))
    if start is None or end is None:
        item = first_item(subscription)
        if item is not None:
            start = start or epoch_to_datetime(item.get("current_period_start"))
            end = end or epoch_to_datetime(item.get("current_period_end"))
    return start, end


class StripeBilling:
    async def create_customer(
        self, *, email: str, name: str | None, metadata: dict[str, str]
    ) -> stripe_lib.Customer:
        return await stripe_lib.Customer.create_async(
            email=email, name=name or email, metadata=metadata
        )

    async def price_by_lookup_key(self, lookup_key: str) -> stripe_lib.Price | None:
        found = await stripe_lib.Price.list_async(lookup_keys=[lookup_key], active=True)
        return found.data[0] if found.data else None

    async def create_checkout_session(
        self, **params: Any
    ) -> stripe_lib.checkout.Session:
        return await stripe_lib.checkout.Session.create_async(**params)

    async def retrieve_checkout_session(
        self, session_id: str
    ) -> stripe_lib.checkout.Session:
        return await stripe_lib.checkout.Session.retrieve_async(
            session_id, expand=["subscription", "subscription.default_payment_method"]
        )

    async def create_portal_session(
        self, **params: Any
    ) -> stripe_lib.billing_portal.Session:
        return await stripe_lib.billing_portal.Session.create_async(**params)

    async def retrieve_subscription(
        self, subscription_id: str
    ) -> stripe_lib.Subscription:
        return await stripe_lib.Subscription.retrieve_async(
            subscription_id, expand=["default_payment_method"]
        )

    async def modify_subscription(
        self, subscription_id: str, **params: Any
    ) -> stripe_lib.Subscription:
        return await stripe_lib.Subscription.modify_async(subscription_id, **params)

    async def retrieve_payment_method(
        self, payment_method_id: str
    ) -> stripe_lib.PaymentMethod:
        return await stripe_lib.PaymentMethod.retrieve_async(payment_method_id)

    async def create_meter_event(
        self,
        *,
        event_name: str,
        customer_id: str,
        value: int,
        identifier: str,
        timestamp: datetime | None = None,
    ) -> stripe_lib.billing.MeterEvent:
        params: dict[str, Any] = {
            "event_name": event_name,
            "payload": {"stripe_customer_id": customer_id, "value": str(value)},
            "identifier": identifier,
        }
        if timestamp is not None:
            params["timestamp"] = int(timestamp.timestamp())
        return await stripe_lib.billing.MeterEvent.create_async(**params)


stripe_billing = StripeBilling()

__all__ = [
    "StripeBilling",
    "epoch_to_datetime",
    "first_item",
    "period_of",
    "stripe_billing",
]
