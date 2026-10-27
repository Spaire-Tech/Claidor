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
    provider: Literal["stripe", "app_store"] | None = Field(
        default=None,
        description=(
            "Who bills the plan: `stripe` (the web), `app_store` (bought in "
            "the iPhone app: changed and cancelled there), or none."
        ),
    )
    scheduled_tier: TierKey | None = Field(
        default=None,
        description="A smaller plan the subscription moves to at `scheduled_at`.",
    )
    scheduled_at: datetime | None = None
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
    flow: Literal["cancel", "update", "update_confirm", "payment_method"] | None = None
    tier: TierKey | None = Field(
        default=None,
        description="With `update_confirm`: the plan to move to, confirmed on Stripe.",
    )


class PortalCreated(Schema):
    portal_url: str


class CheckoutSync(Schema):
    checkout_session_id: str


class PlanChangeCreate(Schema):
    tier: TierKey
    proration_date: int | None = Field(
        default=None,
        description=(
            "The preview's `proration_date`: an upgrade confirmed within the "
            "hour is charged exactly what the preview showed."
        ),
    )


class PlanChange(Schema):
    """What a plan change does (`simeon.plans.service.PlanChange`)."""

    kind: Literal["upgrade", "downgrade", "trial", "keep", "start_now"]
    current: TierKey
    tier: TierKey
    billing_interval: BillingInterval
    amount_due: int = Field(description="Charged today, in cents.")
    credit: int = Field(description="The old plan's unused time taken off, in cents.")
    price: int = Field(description="The new plan's price each interval, in cents.")
    currency: str
    starts_at: datetime
    proration_date: int | None = None
    scheduled_tier: TierKey | None = None


class CreditPack(Schema):
    credits: int
    remaining: int
    expires_at: datetime


class CreditsSummary(Schema):
    """Extra credits: what the person has, and what a pack is."""

    balance: int
    packs: list[CreditPack]
    pack_credits: int
    pack_price_cents: int
    max_packs: int
    can_buy: bool = Field(description="On a paid plan, billed by Stripe or Apple.")


class CreditsCheckoutCreate(Schema):
    packs: int = Field(default=1, ge=1, le=10)
    success_url: str | None = None
    cancel_url: str | None = None
