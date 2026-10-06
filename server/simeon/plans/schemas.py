from datetime import datetime
from typing import Literal

from pydantic import Field

from simeon.entitlements.schemas import Entitlements
from simeon.entitlements.tiers import TierKey
from simeon.kit.schemas import Schema

BillingInterval = Literal["month", "year"]


class Plan(Schema):
    tier: TierKey
    name: str = Field(description="Display name, e.g. 'Simeon Standard'.")
    description: str
    monthly_price_cents: int
    annual_price_cents: int
    weekly_credits: int
    trial_credits: int
    trial_days: int
    monthly_lookup_key: str
    annual_lookup_key: str


class PlanList(Schema):
    items: list[Plan]


class CurrentSubscription(Schema):
    """What the web app shows about the person's plan, from the
    webhook-written copy of Stripe's subscription."""

    tier: TierKey = Field(
        description="`standard`, `pro`, `max`, or `inactive` with no plan."
    )
    status: str = Field(
        description="Stripe's status, or `none` when there is no subscription."
    )
    billing_interval: BillingInterval | None
    current_period_end: datetime | None
    trial_end: datetime | None
    cancel_at_period_end: bool
    stripe_customer_id: str | None
    entitlements: Entitlements


class CheckoutCreate(Schema):
    tier: TierKey
    billing_interval: BillingInterval = "month"
    success_url: str | None = Field(
        default=None,
        description=(
            "Where the checkout sends the person once the card is saved: a "
            "path on the web app, or the API's sign-in page. Default: the "
            "billing page."
        ),
    )
    cancel_url: str | None = None


class CheckoutCreated(Schema):
    checkout_url: str


class PortalCreate(Schema):
    return_url: str | None = None
    flow: Literal["cancel", "update", "payment_method"] | None = None


class PortalCreated(Schema):
    portal_url: str


class CheckoutSync(Schema):
    checkout_session_id: str
