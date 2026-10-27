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

`DesktopAppStoreSubscription` is a plan bought in the iPhone app with
Apple's in-app purchase (12 October 2026): Apple owns it, and the server
keeps a copy written from Apple's signed transactions, sent by the app after
a purchase and by Apple's server notifications (`simeon.plans.app_store`).
It has the same fields the allowance reads as `DesktopSubscription`, so
credits, the trial and access work alike whoever bills the plan.

`DesktopFreeTrial` is the free trial (12 October 2026, seven days since 27
October 2026): started by the iPhone app at a person's first sign-in, no card
and no checkout, with the trial's credits (`simeon.plans.free_month`). One per
person; it counts as the person's one trial everywhere.

`DesktopCreditPack` is extra credits bought on the web (27 October 2026):
used only once the week's credits are spent, on a paid plan, oldest first,
for twelve months (`simeon.plans.credits`).
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from simeon.kit.db.models import RecordModel

if TYPE_CHECKING:
    from .user import User

#: How long after the trial's end the first paid period may start and
#: still be the trial's own first charge: Stripe starts it at the trial's
#: end, to the second.
TRIAL_CONVERSION_SLACK = timedelta(days=1)


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
    #: A move to a smaller plan waiting for the renewal (27 October 2026,
    #: `PlansService.change_plan`): the plan it moves to and when. Stripe
    #: holds it as a subscription schedule; cleared once the move is made
    #: or the schedule is let go.
    scheduled_tier: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
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

    #: Who bills the plan; `app_store` rows are `DesktopAppStoreSubscription`.
    provider = "stripe"

    @property
    def billable(self) -> bool:
        """Whether Stripe still holds a live subscription for the person:
        trialing, paid, or being retried. A second checkout is refused
        while it is (`PlansService.create_checkout`); whether it gives an
        allowance is `billable_at`."""
        return self.status in ("trialing", "active", "past_due")

    @property
    def unpaid_after_trial(self) -> bool:
        """The trial ended and its first charge failed (14 October 2026).
        Stripe marks the subscription `past_due` and retries the card, but
        nothing was ever paid, so the plan does not start until a charge
        goes through. A renewal that fails after a paid period keeps the
        plan while Stripe retries."""
        return (
            self.status == "past_due"
            and self.trial_end is not None
            and self.current_period_start is not None
            and self.current_period_start <= self.trial_end + TRIAL_CONVERSION_SLACK
        )

    def billable_at(self, now: datetime) -> bool:
        """Whether the plan's allowance applies: trialing, paid, or a paid
        plan whose renewal is being retried. Stripe's status is kept
        current by its webhooks, so the moment does not matter here;
        Apple's rows need it."""
        return self.billable and not self.unpaid_after_trial

    @property
    def trialing(self) -> bool:
        return self.status == "trialing"


#: How long past a period's end an Apple plan still counts while its
#: renewal is on its way: Apple renews about a day before the end, and the
#: notification or the app's next sync can lag.
APP_STORE_RENEWAL_SLACK = timedelta(hours=12)


class DesktopAppStoreSubscription(RecordModel):
    """One auto-renewable subscription bought through Apple, by its
    original transaction id (the same through renewals and plan changes in
    the subscription group). A person can have more than one over time (a
    second Apple ID); the live one counts (`simeon.plans.effective`)."""

    __tablename__ = "desktop_app_store_subscriptions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    original_transaction_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    #: The latest transaction (a renewal or a plan change).
    transaction_id: Mapped[str] = mapped_column(String(64), nullable=False)
    product_id: Mapped[str] = mapped_column(String(128), nullable=False)
    #: `Production` or `Sandbox` (TestFlight, App Review and Xcode builds).
    environment: Mapped[str] = mapped_column(String(16), nullable=False)
    #: The allowance's words: `trialing`, `active`, `past_due` (Apple is
    #: retrying the charge), `canceled` (expired, refunded or revoked).
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    tier: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    #: `month` or `year`.
    billing_interval: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None
    )
    current_period_start: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: When the paid (or free) period ends: the transaction's expiry.
    current_period_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: The end of Apple's billing grace period, while it retries the charge.
    grace_period_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    trial_start: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    trial_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: Auto-renew turned off: the plan ends at `current_period_end`.
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: When Apple signed what was last applied; anything signed earlier
    #: (a notification that arrives late) is not applied over it.
    signed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    synced_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    #: The decoded transaction and renewal info as Apple signed them.
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    provider = "app_store"

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @property
    def unpaid_after_trial(self) -> bool:
        """Apple is retrying the first charge after the free week (14
        October 2026): `trial_end` is only set while the latest transaction
        is the free week's (`app_store.snapshot_of`), so a `past_due` row
        with it was never paid. The plan starts when Apple's retry goes
        through (a new transaction); Apple's grace period, if it is on,
        covers only renewals of a paid plan here."""
        return self.status == "past_due" and self.trial_end is not None

    def billable_at(self, now: datetime) -> bool:
        """Trialing, paid, or in Apple's grace period after a paid period,
        and not past the period's end by more than the renewal slack: a
        renewal that never came (a missed notification, an app never
        opened) ends the plan by itself."""
        if self.status not in ("trialing", "active", "past_due"):
            return False
        if self.unpaid_after_trial:
            return False
        ends = max(
            (
                moment
                for moment in (self.current_period_end, self.grace_period_end)
                if moment
            ),
            default=None,
        )
        return ends is None or now < ends + APP_STORE_RENEWAL_SLACK

    @property
    def billable(self) -> bool:
        return self.billable_at(datetime.now(UTC))

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


class DesktopFreeTrial(RecordModel):
    """The free trial: seven days (thirty until 27 October 2026) and the
    trial's credits, started from the iPhone app with no card (12 October 2026). One row per person, ever.
    The row outlives a deleted account (whose user row stays, anonymised:
    `soft_delete_user`) and carries a hash of the e-mail, not the e-mail,
    so deleting the account and signing up again with the same address
    does not start a second one; Apple's DeviceCheck stops a second one on
    the same iPhone (`simeon.plans.free_month`)."""

    __tablename__ = "desktop_free_trials"

    user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="set null"),
        nullable=True,
        unique=True,
        index=True,
    )
    #: SHA-256 of the lower-cased e-mail (`free_month.email_hash`).
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Whether Apple's DeviceCheck said the iPhone had no free month yet
    #: and now marks it; False only for an e-mail on the test list.
    device_checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def live_at(self, now: datetime) -> bool:
        return self.starts_at <= now < self.ends_at


class DesktopCreditPack(RecordModel):
    """Extra credits bought on the web, one row per paid checkout (27
    October 2026). Used only after the week's credits run out, and only on
    a paid plan; the pack that expires first is drawn first
    (`simeon.plans.credits`)."""

    __tablename__ = "desktop_credit_packs"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: What was bought, and what is left of it.
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Twelve months after the purchase.
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    #: The checkout that paid for it: one pack per checkout, whichever of
    #: the webhook and the return page gets there first.
    stripe_checkout_session_id: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True
    )
    #: The payment, to find the pack again when it is refunded.
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True, default=None
    )
    refunded_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    def live_at(self, now: datetime) -> bool:
        return self.remaining > 0 and self.refunded_at is None and now < self.expires_at
