"""What Stripe says about a person's plan, copied here by webhook.

Stripe Billing owns the products, the prices, the 7-day trial, the
subscription and the invoices (`docs/services-billing.md`). The server
keeps one row per person with the subscription's status and dates, written
by the `customer.subscription.*` and `checkout.session.completed` webhooks
and read before every metered call (`simeon.desktop.allowance`), so no
request ever waits on Stripe.

`DesktopTrialRedemption` is the one-trial-per-card rule: Stripe Checkout
cannot refuse a card by its fingerprint before the subscription exists, so
the fingerprint is recorded when a trial starts, and a second trial on the
same card is ended at once (`simeon.plans.service`).
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from simeon.kit.db.models import RecordModel

if TYPE_CHECKING:
    from .user import User


class DesktopSubscription(RecordModel):
    __tablename__ = "desktop_subscriptions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
        unique=True,
        index=True,
    )
    stripe_customer_id: Mapped[str] = mapped_column(
        String(128), nullable=False, index=True
    )
    stripe_subscription_id: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True
    )
    #: Stripe's own word: `trialing`, `active`, `past_due`, `canceled`,
    #: `unpaid`, `incomplete`, `incomplete_expired`, `paused`.
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    #: `standard`, `pro` or `max`, read off the price's lookup key
    #: (`simeon.plans.catalog`); None when the price is not one of ours.
    tier: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    price_lookup_key: Mapped[str | None] = mapped_column(
        String(128), nullable=True, default=None
    )
    #: `month` or `year`.
    billing_interval: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None
    )
    current_period_start: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    trial_start: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    trial_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: When the trial's card was checked against earlier trials; None
    #: until the first `trialing` snapshot has been through the check.
    trial_checked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: When Stripe's subscription object was last copied in.
    synced_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    #: The subscription as Stripe sent it, for the next question nobody
    #: thought of.
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @property
    def billable(self) -> bool:
        """Whether the plan's allowance applies: trialing, paid, or paid
        and being retried."""
        return self.status in ("trialing", "active", "past_due")

    @property
    def trialing(self) -> bool:
        return self.status == "trialing"


class DesktopTrialRedemption(RecordModel):
    __tablename__ = "desktop_trial_redemptions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    #: Stripe's fingerprint of the card the trial started on; the same
    #: card number gives the same fingerprint across customers.
    payment_method_fingerprint: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True, default=None
    )
    stripe_subscription_id: Mapped[str] = mapped_column(String(128), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
