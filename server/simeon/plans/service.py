"""Plans on Stripe Billing: Checkout to start one, the Customer Portal to
change or end one, webhooks to know which one a person has, and meter
events to tell Stripe what they used (`docs/services-billing.md`).

Stripe owns the subscription. The server keeps one copy per person
(`DesktopSubscription`), written only from Stripe's own objects: a
webhook's, or the one fetched after a checkout comes back. The desktop
allowance reads that copy (`simeon.desktop.allowance`).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import structlog

from simeon.config import settings
from simeon.entitlements.tiers import TierKey
from simeon.exceptions import PolarError
from simeon.kit.utils import utc_now
from simeon.models import DesktopSubscription, DesktopTrialRedemption, User
from simeon.postgres import AsyncSession
from simeon.user.repository import UserRepository

from . import catalog
from .repository import (
    DesktopSubscriptionRepository,
    DesktopTrialRedemptionRepository,
    UsageReportRepository,
)
from .stripe_billing import epoch_to_datetime, first_item, period_of, stripe_billing

log: structlog.stdlib.BoundLogger = structlog.get_logger()
logging.getLogger(__name__)

#: The checkout's own placeholder; Stripe fills it in on the way back.
CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}"
BILLING_PATH = "/billing"


class PlansError(PolarError): ...


class BillingNotConfigured(PlansError):
    def __init__(self) -> None:
        super().__init__("Billing is not configured on this server.", 503)


class AlreadySubscribed(PlansError):
    def __init__(self) -> None:
        super().__init__(
            "You already have a plan. Change or cancel it from the billing page.",
            409,
        )


class NoSubscription(PlansError):
    def __init__(self) -> None:
        super().__init__("You have no plan to manage yet.", 404)


class UnknownPrice(PlansError):
    def __init__(self, lookup_key: str) -> None:
        super().__init__(
            f"Stripe has no price '{lookup_key}'. Run scripts/stripe_catalog.py.",
            503,
        )


class BadReturnUrl(PlansError):
    def __init__(self) -> None:
        super().__init__("That return address is not one of ours.", 400)


class CheckoutNotYours(PlansError):
    def __init__(self) -> None:
        super().__init__("That checkout belongs to another account.", 403)


def _str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "get"):
        got = value.get("id")
        return got if isinstance(got, str) else None
    return getattr(value, "id", None)


def allowed_return_url(url: str | None) -> str | None:
    """Only the web app, the API's own sign-in page, or a path on the
    web app may be where a checkout or the portal sends the person
    back. Anything else is dropped."""
    if not url:
        return None
    if url.startswith("/") and not url.startswith("//"):
        return settings.generate_frontend_url(url)
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    origins = {
        urlparse(settings.FRONTEND_BASE_URL).netloc,
        urlparse(settings.generate_external_url("/")).netloc,
    }
    if parsed.scheme not in ("http", "https") or parsed.netloc not in origins:
        return None
    return url


def snapshot_of(subscription: Any) -> dict[str, Any]:
    """The columns of `DesktopSubscription` read off a Stripe subscription."""
    item = first_item(subscription)
    price = (item or {}).get("price") or {}
    lookup_key = price.get("lookup_key") if hasattr(price, "get") else None
    parsed = catalog.parse_lookup_key(lookup_key)
    recurring = price.get("recurring") if hasattr(price, "get") else None
    interval = (recurring or {}).get("interval") if recurring else None
    start, end = period_of(subscription)
    return {
        "stripe_subscription_id": subscription["id"],
        "stripe_customer_id": _str(subscription.get("customer")) or "",
        "status": str(subscription.get("status") or "incomplete"),
        "tier": parsed[0].value if parsed else None,
        "price_lookup_key": lookup_key,
        "billing_interval": parsed[1] if parsed else interval,
        "current_period_start": start,
        "current_period_end": end,
        "trial_start": epoch_to_datetime(subscription.get("trial_start")),
        "trial_end": epoch_to_datetime(subscription.get("trial_end")),
        "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
        "canceled_at": epoch_to_datetime(subscription.get("canceled_at")),
    }


def _raw(subscription: Any) -> dict[str, Any]:
    try:
        return dict(subscription.to_dict_recursive())
    except AttributeError:
        return dict(subscription)


class PlansService:
    # --- reading ------------------------------------------------------------

    async def subscription_of(
        self, session: AsyncSession, user: User
    ) -> DesktopSubscription | None:
        return await DesktopSubscriptionRepository.from_session(session).get_by_user(
            user.id
        )

    # --- starting a plan ----------------------------------------------------

    async def customer_id_for(self, session: AsyncSession, user: User) -> str:
        """The person's Stripe customer, made on first use. Kept on the
        user row (`stripe_customer_id`), where the inherited code already
        had a place for it."""
        if user.stripe_customer_id:
            return user.stripe_customer_id
        existing = await self.subscription_of(session, user)
        if existing is not None:
            user.stripe_customer_id = existing.stripe_customer_id
            session.add(user)
            return existing.stripe_customer_id
        customer = await stripe_billing.create_customer(
            email=user.email,
            name=str((user.meta or {}).get("name") or "") or None,
            metadata={"simeon_user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        session.add(user)
        return customer.id

    async def create_checkout(
        self,
        session: AsyncSession,
        user: User,
        *,
        tier: TierKey,
        interval: catalog.BillingInterval = "month",
        success_url: str | None = None,
        cancel_url: str | None = None,
    ) -> str:
        """A Stripe Checkout URL that starts the plan: card required, a
        7-day trial for a first plan, the charge at once for anyone who
        had one. Returns the URL to send the browser to."""
        if not settings.STRIPE_SECRET_KEY:
            raise BillingNotConfigured()
        existing = await self.subscription_of(session, user)
        if existing is not None and existing.billable:
            raise AlreadySubscribed()

        plan_price = catalog.price_for(tier, interval)
        price = await stripe_billing.price_by_lookup_key(plan_price.lookup_key)
        if price is None:
            raise UnknownPrice(plan_price.lookup_key)
        customer_id = await self.customer_id_for(session, user)

        redemptions = DesktopTrialRedemptionRepository.from_session(session)
        had_trial = await redemptions.get_for_user(user.id) is not None or (
            await redemptions.get_for_email(user.email, other_than_user=user.id)
            is not None
        )

        success = allowed_return_url(success_url) or settings.generate_frontend_url(
            f"{BILLING_PATH}?upgraded=1"
        )
        joiner = "&" if "?" in success else "?"
        success = f"{success}{joiner}checkout_session_id={CHECKOUT_SESSION_PLACEHOLDER}"
        cancel = allowed_return_url(cancel_url) or settings.generate_frontend_url(
            BILLING_PATH
        )

        subscription_data: dict[str, Any] = {
            "metadata": {"simeon_user_id": str(user.id), "simeon_tier": tier.value},
        }
        if not had_trial:
            subscription_data["trial_period_days"] = catalog.TRIAL_DAYS
            subscription_data["trial_settings"] = {
                "end_behavior": {"missing_payment_method": "cancel"}
            }

        checkout = await stripe_billing.create_checkout_session(
            mode="subscription",
            customer=customer_id,
            client_reference_id=str(user.id),
            line_items=[{"price": price.id, "quantity": 1}],
            subscription_data=subscription_data,
            # The card is taken even for the free week; it is charged on
            # day eight.
            payment_method_collection="always",
            allow_promotion_codes=True,
            success_url=success,
            cancel_url=cancel,
            metadata={"simeon_user_id": str(user.id)},
        )
        log.info(
            "plans.checkout.created",
            user_id=str(user.id),
            tier=tier.value,
            interval=interval,
            trial=not had_trial,
            checkout_session_id=checkout.id,
        )
        return str(checkout.url)

    async def create_portal(
        self,
        session: AsyncSession,
        user: User,
        *,
        return_url: str | None = None,
        flow: str | None = None,
        tier: TierKey | None = None,
    ) -> str:
        """Stripe's Customer Portal: cards, invoices, a plan change or a
        cancellation. `flow` opens the portal on one of those;
        `update_confirm` with a `tier` opens straight on the confirmation
        of that one plan, skipping the portal's own picker (the person
        already chose on the billing page)."""
        if not settings.STRIPE_SECRET_KEY:
            raise BillingNotConfigured()
        subscription = await self.subscription_of(session, user)
        customer_id = user.stripe_customer_id or (
            subscription.stripe_customer_id if subscription else None
        )
        if customer_id is None:
            raise NoSubscription()
        params: dict[str, Any] = {
            "customer": customer_id,
            "return_url": allowed_return_url(return_url)
            or settings.generate_frontend_url(BILLING_PATH),
        }
        if flow and subscription is not None:
            if flow == "cancel":
                params["flow_data"] = {
                    "type": "subscription_cancel",
                    "subscription_cancel": {
                        "subscription": subscription.stripe_subscription_id
                    },
                }
            elif flow == "update":
                params["flow_data"] = {
                    "type": "subscription_update",
                    "subscription_update": {
                        "subscription": subscription.stripe_subscription_id
                    },
                }
            elif flow == "update_confirm" and tier is not None:
                params["flow_data"] = {
                    "type": "subscription_update_confirm",
                    "subscription_update_confirm": {
                        "subscription": subscription.stripe_subscription_id,
                        "items": [await self._plan_change_item(subscription, tier)],
                    },
                }
            elif flow == "payment_method":
                params["flow_data"] = {"type": "payment_method_update"}
        portal = await stripe_billing.create_portal_session(**params)
        return str(portal.url)

    async def _plan_change_item(
        self, subscription: DesktopSubscription, tier: TierKey
    ) -> dict[str, Any]:
        """The subscription's one item, moved to `tier`'s price at the
        same interval: what the portal's confirm flow takes."""
        item = first_item(subscription.raw or {})
        if item is None or not isinstance(item.get("id"), str):
            fresh = await stripe_billing.retrieve_subscription(
                subscription.stripe_subscription_id
            )
            item = first_item(fresh)
        if item is None or not isinstance(item.get("id"), str):
            raise NoSubscription()
        interval: catalog.BillingInterval = (
            "year" if subscription.billing_interval == "year" else "month"
        )
        plan_price = catalog.price_for(tier, interval)
        price = await stripe_billing.price_by_lookup_key(plan_price.lookup_key)
        if price is None:
            raise UnknownPrice(plan_price.lookup_key)
        return {"id": item["id"], "price": price.id, "quantity": 1}

    # --- knowing what the person has ----------------------------------------

    async def sync_checkout_session(
        self, session: AsyncSession, user: User, checkout_session_id: str
    ) -> DesktopSubscription | None:
        """The checkout came back before the webhook did: read the
        subscription it made and copy it in now."""
        if not settings.STRIPE_SECRET_KEY:
            raise BillingNotConfigured()
        checkout = await stripe_billing.retrieve_checkout_session(checkout_session_id)
        if str(checkout.get("client_reference_id") or "") != str(user.id):
            raise CheckoutNotYours()
        subscription = checkout.get("subscription")
        if subscription is None:
            return None
        if isinstance(subscription, str):
            subscription = await stripe_billing.retrieve_subscription(subscription)
        return await self.apply_stripe_subscription(session, subscription)

    async def apply_stripe_subscription(
        self, session: AsyncSession, subscription: Any
    ) -> DesktopSubscription | None:
        """Copy a Stripe subscription in, finding the person by the
        subscription's own metadata, by an earlier copy, or by the
        customer on the user row. Then, the first time it is trialing,
        the one-trial-per-card check."""
        snapshot = snapshot_of(subscription)
        repository = DesktopSubscriptionRepository.from_session(session)
        row = await repository.get_by_stripe_subscription_id(
            snapshot["stripe_subscription_id"]
        )
        user = await self._user_of(session, subscription, row)
        if user is None:
            log.warning(
                "plans.subscription.nobody",
                stripe_subscription_id=snapshot["stripe_subscription_id"],
                stripe_customer_id=snapshot["stripe_customer_id"],
            )
            return None

        if row is None:
            row = await repository.get_by_user(user.id)
        now = utc_now()
        if row is None:
            row = DesktopSubscription(
                user_id=user.id,
                synced_at=now,
                raw=_raw(subscription),
                **snapshot,
            )
            session.add(row)
        else:
            if (
                row.stripe_subscription_id != snapshot["stripe_subscription_id"]
                and row.billable
                and snapshot["status"] not in ("trialing", "active", "past_due")
            ):
                # A dead subscription must not overwrite a live one: the
                # person re-subscribed and the old one's final event came
                # late.
                return row
            for key, value in snapshot.items():
                setattr(row, key, value)
            row.synced_at = now
            row.raw = _raw(subscription)
            session.add(row)
        if not user.stripe_customer_id and snapshot["stripe_customer_id"]:
            user.stripe_customer_id = snapshot["stripe_customer_id"]
            session.add(user)
        await session.flush()

        if row.trialing and row.trial_checked_at is None:
            await self._check_trial_card(session, user, row, subscription)
        log.info(
            "plans.subscription.synced",
            user_id=str(user.id),
            status=row.status,
            tier=row.tier,
            stripe_subscription_id=row.stripe_subscription_id,
        )
        return row

    async def _user_of(
        self,
        session: AsyncSession,
        subscription: Any,
        row: DesktopSubscription | None,
    ) -> User | None:
        users = UserRepository.from_session(session)
        metadata = subscription.get("metadata") or {}
        user_id = metadata.get("simeon_user_id") if hasattr(metadata, "get") else None
        if isinstance(user_id, str):
            try:
                found = await users.get_by_id(UUID(user_id))
            except ValueError:
                found = None
            if found is not None:
                return found
        if row is not None:
            found = await users.get_by_id(row.user_id)
            if found is not None:
                return found
        customer_id = _str(subscription.get("customer"))
        if customer_id:
            found = await users.get_by_stripe_customer_id(customer_id)
            if found is not None:
                return found
            earlier = await DesktopSubscriptionRepository.from_session(
                session
            ).get_by_stripe_customer_id(customer_id)
            if earlier is not None:
                return await users.get_by_id(earlier.user_id)
        return None

    async def _check_trial_card(
        self,
        session: AsyncSession,
        user: User,
        row: DesktopSubscription,
        subscription: Any,
    ) -> None:
        """One trial per card and per e-mail. A second trial on a card
        that already had one is ended now, so the card is charged at
        once, which is what Checkout would have done for a known
        customer."""
        fingerprint = await self._fingerprint_of(subscription)
        redemptions = DesktopTrialRedemptionRepository.from_session(session)
        clash: DesktopTrialRedemption | None = None
        if fingerprint:
            clash = await redemptions.get_for_card(fingerprint, other_than_user=user.id)
        if clash is None:
            clash = await redemptions.get_for_email(user.email, other_than_user=user.id)
        row.trial_checked_at = utc_now()
        if clash is not None:
            log.warning(
                "plans.trial.repeated",
                user_id=str(user.id),
                earlier_user_id=str(clash.user_id),
                stripe_subscription_id=row.stripe_subscription_id,
            )
            updated = await stripe_billing.modify_subscription(
                row.stripe_subscription_id, trial_end="now"
            )
            for key, value in snapshot_of(updated).items():
                setattr(row, key, value)
            row.raw = _raw(updated)
            session.add(row)
            return
        mine = await redemptions.get_for_user(user.id)
        if mine is None:
            session.add(
                DesktopTrialRedemption(
                    user_id=user.id,
                    email=user.email,
                    payment_method_fingerprint=fingerprint,
                    stripe_subscription_id=row.stripe_subscription_id,
                )
            )
        session.add(row)

    async def _fingerprint_of(self, subscription: Any) -> str | None:
        method = subscription.get("default_payment_method")
        if isinstance(method, str):
            try:
                method = await stripe_billing.retrieve_payment_method(method)
            except Exception as error:
                log.warning("plans.trial.card_unreadable", error=str(error))
                return None
        if method is None or not hasattr(method, "get"):
            return None
        card = method.get("card")
        fingerprint = (
            card.get("fingerprint")
            if card is not None and hasattr(card, "get")
            else None
        )
        return fingerprint if isinstance(fingerprint, str) else None

    # --- ending a trial from the app ----------------------------------------

    async def cancel_trial(self, session: AsyncSession, user: User) -> bool:
        """The app's Cancel trial button: the subscription ends when the
        trial does, with no charge. False when there is no trial."""
        row = await self.subscription_of(session, user)
        if row is None or not row.trialing:
            return False
        if row.cancel_at_period_end:
            return True
        updated = await stripe_billing.modify_subscription(
            row.stripe_subscription_id, cancel_at_period_end=True
        )
        for key, value in snapshot_of(updated).items():
            setattr(row, key, value)
        row.synced_at = utc_now()
        row.raw = _raw(updated)
        session.add(row)
        log.info("plans.trial.cancelled", user_id=str(user.id))
        return True

    # --- usage to Stripe's meters -------------------------------------------

    async def report_usage(
        self, session: AsyncSession, *, now: datetime | None = None
    ) -> dict[str, int]:
        """Send what people used since the last run to Stripe's meters:
        credits from `desktop_usage`, cloud-computer seconds from the
        boxes' running time. Rows are stamped once Stripe has the event,
        so a failed call is retried on the next run and a succeeded one
        is never sent twice (the event identifier makes a retry of a
        half-finished run idempotent on Stripe's side too)."""
        moment = now or utc_now()
        counts = {"credit_events": 0, "box_events": 0, "skipped": 0}
        if not settings.STRIPE_SECRET_KEY:
            return counts
        usage = UsageReportRepository(session)
        subscriptions = DesktopSubscriptionRepository.from_session(session)

        totals = await usage.unreported_credits_by_user(until=moment)
        customers = await subscriptions.customer_ids_by_user([u for u, _ in totals])
        batch = moment.strftime("%Y%m%dT%H%M%S")
        for user_id, credits in totals:
            customer_id = customers.get(user_id)
            if customer_id is None:
                counts["skipped"] += 1
                continue
            try:
                await stripe_billing.create_meter_event(
                    event_name=settings.STRIPE_CREDITS_METER_EVENT,
                    customer_id=customer_id,
                    value=credits,
                    identifier=f"credits:{user_id}:{batch}",
                    timestamp=moment,
                )
            except Exception as error:
                log.warning(
                    "plans.usage.credits_not_sent",
                    user_id=str(user_id),
                    error=str(error),
                )
                continue
            await usage.mark_credits_reported(user_id, until=moment, at=moment)
            counts["credit_events"] += 1

        boxes = await usage.boxes_with_unmetered_time()
        box_customers = await subscriptions.customer_ids_by_user(
            [box.user_id for box in boxes]
        )
        for box in boxes:
            since = box.usage_metered_at or box.last_ensured_at or box.created_at
            until = moment if box.state == "running" else (box.hibernated_at or moment)
            seconds = int((until - since).total_seconds())
            if seconds <= 0:
                box.usage_metered_at = until
                session.add(box)
                continue
            customer_id = box_customers.get(box.user_id)
            if customer_id is None:
                counts["skipped"] += 1
                continue
            try:
                await stripe_billing.create_meter_event(
                    event_name=settings.STRIPE_BOX_SECONDS_METER_EVENT,
                    customer_id=customer_id,
                    value=seconds,
                    identifier=f"box:{box.id}:{batch}",
                    timestamp=moment,
                )
            except Exception as error:
                log.warning(
                    "plans.usage.box_not_sent", box_id=str(box.id), error=str(error)
                )
                continue
            box.usage_metered_at = until
            session.add(box)
            counts["box_events"] += 1
        return counts


plans = PlansService()

__all__ = [
    "AlreadySubscribed",
    "BadReturnUrl",
    "BillingNotConfigured",
    "CheckoutNotYours",
    "NoSubscription",
    "PlansError",
    "PlansService",
    "UnknownPrice",
    "allowed_return_url",
    "plans",
    "snapshot_of",
]
