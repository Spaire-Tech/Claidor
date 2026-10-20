"""Plans bought in the iPhone app with Apple's in-app purchase (12 October 2026).

Apple sells the subscription, takes the payment, the free week, renewals,
plan changes, cancellations and refunds. The server keeps a copy per
subscription (`DesktopAppStoreSubscription`, one row per original
transaction id), written only from what Apple signed:

- **After a purchase or a restore** the iPhone app sends the signed
  transactions StoreKit gave it (`POST /desktop/api/billing/apple/transactions`,
  `simeon.desktop.app_store_endpoints`). Each purchase carries the Simeon
  account's id as its `appAccountToken`, so a purchase made while signed in
  as one account is never applied to another.
- **Afterwards** Apple's server notifications (version 2) say when the plan
  renews, changes, fails to charge, is cancelled, expires or is refunded
  (`POST /desktop/apple/notifications`).

Every signature is checked with Apple's own library against Apple's root
certificate (`apple_roots/`), for this app's bundle id, in production then
in the sandbox (TestFlight, App Review and Xcode builds buy in the sandbox).
What was signed earlier than what is already applied (a notification that
arrives late) is not applied over it.

The plans are the web's three, each monthly or yearly, as products named
`<APPLE_PRODUCT_PREFIX>.<tier>.<monthly|yearly>` in App Store Connect, in one
subscription group, with the free week as their introductory offer. The
credits each plan gives are the same as on the web (`simeon.entitlements.tiers`).
"""

from __future__ import annotations

import asyncio
import base64
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import structlog
from appstoreserverlibrary.models.AutoRenewStatus import AutoRenewStatus
from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.models.JWSRenewalInfoDecodedPayload import (
    JWSRenewalInfoDecodedPayload,
)
from appstoreserverlibrary.models.JWSTransactionDecodedPayload import (
    JWSTransactionDecodedPayload,
)
from appstoreserverlibrary.models.NotificationTypeV2 import NotificationTypeV2
from appstoreserverlibrary.models.OfferDiscountType import OfferDiscountType
from appstoreserverlibrary.models.OfferType import OfferType
from appstoreserverlibrary.models.ResponseBodyV2DecodedPayload import (
    ResponseBodyV2DecodedPayload,
)
from appstoreserverlibrary.signed_data_verifier import (
    SignedDataVerifier,
    VerificationException,
    VerificationStatus,
)

from simeon.config import settings
from simeon.desktop.words import say
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, TierKey, get_definition
from simeon.exceptions import PolarError
from simeon.kit.utils import utc_now
from simeon.models import DesktopAppStoreSubscription, DesktopTrialRedemption, User
from simeon.postgres import AsyncSession
from simeon.user.repository import UserRepository

from .catalog import BillingInterval
from .repository import AppStoreSubscriptionRepository, DesktopTrialRedemptionRepository

log: structlog.stdlib.BoundLogger = structlog.get_logger()

ROOTS = Path(__file__).parent / "apple_roots"

#: How a plan's interval reads in its product id.
INTERVAL_WORDS: dict[BillingInterval, str] = {"month": "monthly", "year": "yearly"}

#: Where an Apple plan is changed or cancelled, for every surface that cannot
#: do it: the sentence's key (`say`, `simeon/desktop/words/_account.py`).
MANAGE_ON_IPHONE = "billing.manage_on_iphone"


class AppStoreError(PolarError): ...


class AppStoreUnverified(AppStoreError):
    def __init__(self) -> None:
        super().__init__(say("app_store.unverified"), 400)


class AppStoreNotConfigured(AppStoreError):
    def __init__(self) -> None:
        super().__init__(say("app_store.not_configured"), 503)


class NotYourPurchase(AppStoreError):
    def __init__(self) -> None:
        super().__init__(say("app_store.not_your_purchase"), 409)


# --- products -----------------------------------------------------------------


def product_id(tier: TierKey, interval: BillingInterval) -> str:
    return f"{settings.APPLE_PRODUCT_PREFIX}.{tier.value}.{INTERVAL_WORDS[interval]}"


def parse_product_id(value: str | None) -> tuple[TierKey, BillingInterval] | None:
    """`com.simeonlabs.simeon.pro.yearly` → (pro, year); anything else → None."""
    prefix = f"{settings.APPLE_PRODUCT_PREFIX}."
    if not value or not value.startswith(prefix):
        return None
    parts = value[len(prefix) :].split(".")
    if len(parts) != 2:
        return None
    try:
        tier = TierKey(parts[0])
    except ValueError:
        return None
    if tier not in PAID_TIERS:
        return None
    for interval, word in INTERVAL_WORDS.items():
        if parts[1] == word:
            return tier, interval
    return None


def products() -> list[dict[str, Any]]:
    """What the app asks StoreKit for, in the order it shows them."""
    out: list[dict[str, Any]] = []
    for tier in PAID_TIERS:
        definition = get_definition(tier)
        for interval in INTERVAL_WORDS:
            out.append(
                {
                    "productId": product_id(tier, interval),
                    "tier": tier.value,
                    "interval": interval,
                    "name": TIER_NAMES[tier],
                    "weeklyCredits": definition.weekly_credits,
                    "trialCredits": definition.trial_credits,
                }
            )
    return out


# --- signatures ---------------------------------------------------------------


def _root_certificates() -> list[bytes]:
    return [path.read_bytes() for path in sorted(ROOTS.glob("*.cer"))]


def _verifiers() -> list[SignedDataVerifier]:
    """Production first (when the app's Apple ID is set, which Apple
    requires there), then the sandbox."""
    roots = _root_certificates()
    out: list[SignedDataVerifier] = []
    if settings.APPLE_APP_ID is not None:
        out.append(
            SignedDataVerifier(
                roots,
                settings.APPLE_ONLINE_CHECKS,
                Environment.PRODUCTION,
                settings.APPLE_BUNDLE_ID,
                settings.APPLE_APP_ID,
            )
        )
    out.append(
        SignedDataVerifier(
            roots,
            settings.APPLE_ONLINE_CHECKS,
            Environment.SANDBOX,
            settings.APPLE_BUNDLE_ID,
        )
    )
    return out


def _decode_with(method: str, signed: str) -> Any:
    """Apple's checks run in a thread: the online one is a network call."""
    failures: list[VerificationStatus] = []
    for verifier in _verifiers():
        try:
            return getattr(verifier, method)(signed)
        except VerificationException as error:
            failures.append(error.status)
    log.warning(
        "plans.app_store.unverified",
        kind=method,
        failures=[failure.name for failure in failures],
        production_configured=settings.APPLE_APP_ID is not None,
    )
    if (
        settings.APPLE_APP_ID is None
        and VerificationStatus.INVALID_ENVIRONMENT in failures
    ):
        # Signed for production, which needs the app's Apple ID to check.
        raise AppStoreNotConfigured()
    raise AppStoreUnverified()


async def decode_transaction(signed: str) -> JWSTransactionDecodedPayload:
    return await asyncio.to_thread(
        _decode_with, "verify_and_decode_signed_transaction", signed
    )


async def decode_renewal(signed: str) -> JWSRenewalInfoDecodedPayload:
    return await asyncio.to_thread(
        _decode_with, "verify_and_decode_renewal_info", signed
    )


async def decode_notification(signed: str) -> ResponseBodyV2DecodedPayload:
    return await asyncio.to_thread(
        _decode_with, "verify_and_decode_notification", signed
    )


def payload_of(signed: str) -> dict[str, Any]:
    """The JSON Apple signed, for the row's record. Only read after the
    signature was checked."""
    try:
        body = signed.split(".")[1]
        decoded = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        value = json.loads(decoded)
    except (IndexError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


# --- a transaction as a plan --------------------------------------------------


def _moment(milliseconds: int | None) -> datetime | None:
    return datetime.fromtimestamp(milliseconds / 1000, UTC) if milliseconds else None


def _environment(transaction: JWSTransactionDecodedPayload) -> str:
    raw = getattr(transaction, "rawEnvironment", None)
    if isinstance(raw, str) and raw:
        return raw[:16]
    return transaction.environment.value if transaction.environment else "Unknown"


def snapshot_of(
    transaction: JWSTransactionDecodedPayload,
    renewal: JWSRenewalInfoDecodedPayload | None,
    *,
    now: datetime,
) -> dict[str, Any]:
    """The row's fields from Apple's latest transaction and renewal info.

    - Refunded or revoked: `canceled`.
    - Before its expiry: `trialing` in the free week (the introductory
      offer), else `active`.
    - Past it, while Apple retries the charge in its grace period:
      `past_due`, which still counts after a paid period; after the free
      week nothing was paid yet, and it does not
      (`DesktopAppStoreSubscription.unpaid_after_trial`).
    - Otherwise `canceled`.
    """
    parsed = parse_product_id(transaction.productId)
    start = _moment(transaction.purchaseDate)
    end = _moment(transaction.expiresDate)
    revoked = _moment(transaction.revocationDate)
    grace = _moment(renewal.gracePeriodExpiresDate) if renewal is not None else None
    retrying = bool(renewal is not None and renewal.isInBillingRetryPeriod)
    free_week = transaction.offerType == OfferType.INTRODUCTORY_OFFER and (
        transaction.offerDiscountType in (None, OfferDiscountType.FREE_TRIAL)
    )
    if revoked is not None:
        status = "canceled"
    elif end is not None and now < end:
        status = "trialing" if free_week else "active"
    elif retrying and grace is not None and now < grace:
        status = "past_due"
    else:
        status = "canceled"
    return {
        "transaction_id": str(transaction.transactionId),
        "product_id": str(transaction.productId),
        "environment": _environment(transaction),
        "status": status,
        "tier": parsed[0].value if parsed else None,
        "billing_interval": parsed[1] if parsed else None,
        "current_period_start": start,
        "current_period_end": end,
        "grace_period_end": grace if retrying else None,
        "trial_start": start if free_week else None,
        "trial_end": end if free_week else None,
        "cancel_at_period_end": bool(
            renewal is not None and renewal.autoRenewStatus == AutoRenewStatus.OFF
        ),
        "canceled_at": revoked or (end if status == "canceled" else None),
    }


def _token_of(
    transaction: JWSTransactionDecodedPayload,
    renewal: JWSRenewalInfoDecodedPayload | None,
) -> UUID | None:
    for value in (
        transaction.appAccountToken,
        renewal.appAccountToken if renewal is not None else None,
    ):
        if value:
            try:
                return UUID(str(value))
            except ValueError:
                continue
    return None


# --- applying it --------------------------------------------------------------


async def apply(
    session: AsyncSession,
    transaction: JWSTransactionDecodedPayload,
    renewal: JWSRenewalInfoDecodedPayload | None,
    *,
    signed_at: datetime,
    raw: dict[str, Any],
    user: User | None = None,
    now: datetime | None = None,
) -> DesktopAppStoreSubscription | None:
    """Copy one subscription in. `user` is the signed-in person when the
    app sent it, None for Apple's notification. A purchase tagged with
    another account, or a subscription another account already holds, is
    refused for the app (`NotYourPurchase`) and left alone for Apple."""
    moment = now or utc_now()
    original = str(transaction.originalTransactionId or "")
    if not original or parse_product_id(transaction.productId) is None:
        log.info(
            "plans.app_store.not_ours",
            product_id=transaction.productId,
            original_transaction_id=original or None,
        )
        return None
    repository = AppStoreSubscriptionRepository.from_session(session)
    row = await repository.get_by_original_transaction_id(original)
    token = _token_of(transaction, renewal)

    owner: User | None
    if user is not None:
        others = {
            other
            for other in (token, row.user_id if row is not None else None)
            if other is not None and other != user.id
        }
        if others and not await _all_deleted(session, others):
            log.warning(
                "plans.app_store.not_yours",
                user_id=str(user.id),
                original_transaction_id=original,
            )
            raise NotYourPurchase()
        if others:
            # The account that bought it was deleted (12 October 2026: the
            # founder deleted theirs, signed in again with the same Apple ID
            # and was refused their own subscription): it moves here. Apple
            # keeps the old account's token on every renewal, so the row is
            # what says whose it is from now on.
            log.info(
                "plans.app_store.moved_from_deleted",
                user_id=str(user.id),
                from_user_ids=sorted(str(other) for other in others),
                original_transaction_id=original,
            )
            if row is not None:
                row.user_id = user.id
        owner = user
    else:
        users = UserRepository.from_session(session)
        owner_id = row.user_id if row is not None else token
        owner = await users.get_by_id(owner_id) if owner_id is not None else None
        if owner is None:
            log.warning(
                "plans.app_store.nobody",
                original_transaction_id=original,
                product_id=transaction.productId,
            )
            return None

    if row is not None and signed_at < row.signed_at:
        log.info(
            "plans.app_store.stale",
            user_id=str(owner.id),
            original_transaction_id=original,
        )
        return row

    snapshot = snapshot_of(transaction, renewal, now=moment)
    if row is None:
        row = DesktopAppStoreSubscription(
            user_id=owner.id,
            original_transaction_id=original,
            signed_at=signed_at,
            synced_at=moment,
            raw=raw,
            **snapshot,
        )
    else:
        for key, value in snapshot.items():
            setattr(row, key, value)
        row.signed_at = signed_at
        row.synced_at = moment
        row.raw = raw
    session.add(row)
    await session.flush()

    if row.trialing:
        await _record_trial(session, owner, row)
    log.info(
        "plans.app_store.synced",
        user_id=str(owner.id),
        status=row.status,
        tier=row.tier,
        environment=row.environment,
        original_transaction_id=original,
    )
    return row


async def _all_deleted(session: AsyncSession, user_ids: set[UUID]) -> bool:
    """Every one of these accounts was deleted (a soft deletion keeps the
    row). An account that is not on this server is not: its purchase stays
    refused."""
    users = UserRepository.from_session(session)
    for user_id in user_ids:
        other = await users.get_by_id(user_id, include_deleted=True)
        if other is None or other.deleted_at is None:
            return False
    return True


async def _record_trial(
    session: AsyncSession, user: User, row: DesktopAppStoreSubscription
) -> None:
    """Apple's free week counts as the person's one trial: a plan bought
    on the web afterwards starts paid, as for a second card."""
    redemptions = DesktopTrialRedemptionRepository.from_session(session)
    if await redemptions.get_for_user(user.id) is not None:
        return
    session.add(
        DesktopTrialRedemption(
            user_id=user.id,
            email=user.email,
            payment_method_fingerprint=None,
            stripe_subscription_id=f"apple:{row.original_transaction_id}",
            note="Apple's free week",
        )
    )


async def sync_from_app(
    session: AsyncSession,
    user: User,
    signed_transactions: list[str],
    signed_renewals: list[str],
) -> list[DesktopAppStoreSubscription]:
    """What the app sends after a purchase, a restore, or at launch: each
    transaction with its renewal info when StoreKit had it."""
    renewals: dict[str, tuple[JWSRenewalInfoDecodedPayload, str]] = {}
    for signed in signed_renewals:
        decoded = await decode_renewal(signed)
        if decoded.originalTransactionId:
            renewals[str(decoded.originalTransactionId)] = (decoded, signed)
    rows: list[DesktopAppStoreSubscription] = []
    for signed in signed_transactions:
        transaction = await decode_transaction(signed)
        renewal_and_signed = renewals.get(str(transaction.originalTransactionId))
        renewal = renewal_and_signed[0] if renewal_and_signed else None
        signed_moments = [
            _moment(transaction.signedDate),
            _moment(renewal.signedDate) if renewal is not None else None,
        ]
        signed_at = max(
            (moment for moment in signed_moments if moment), default=utc_now()
        )
        row = await apply(
            session,
            transaction,
            renewal,
            signed_at=signed_at,
            raw={
                "transaction": payload_of(signed),
                "renewal": payload_of(renewal_and_signed[1])
                if renewal_and_signed
                else None,
                "source": "app",
            },
            user=user,
        )
        if row is not None:
            rows.append(row)
    return rows


async def handle_notification(session: AsyncSession, signed_payload: str) -> str:
    """One of Apple's server notifications. Answers what was done with it,
    for the log: `test`, `ignored` or `applied`."""
    notification = await decode_notification(signed_payload)
    kind = notification.notificationType
    raw_kind = getattr(notification, "rawNotificationType", None) or (
        kind.value if kind else None
    )
    if kind == NotificationTypeV2.TEST:
        log.info("plans.app_store.notification", type="TEST")
        return "test"
    data = notification.data
    if data is None or not data.signedTransactionInfo:
        log.info("plans.app_store.notification", type=raw_kind, applied=False)
        return "ignored"
    transaction = await decode_transaction(data.signedTransactionInfo)
    renewal = (
        await decode_renewal(data.signedRenewalInfo) if data.signedRenewalInfo else None
    )
    row = await apply(
        session,
        transaction,
        renewal,
        signed_at=_moment(notification.signedDate) or utc_now(),
        raw={
            "transaction": payload_of(data.signedTransactionInfo),
            "renewal": payload_of(data.signedRenewalInfo)
            if data.signedRenewalInfo
            else None,
            "source": f"notification:{raw_kind}",
        },
    )
    log.info(
        "plans.app_store.notification",
        type=raw_kind,
        subtype=getattr(notification, "rawSubtype", None),
        applied=row is not None,
    )
    return "applied" if row is not None else "ignored"


__all__ = [
    "MANAGE_ON_IPHONE",
    "AppStoreError",
    "AppStoreNotConfigured",
    "AppStoreUnverified",
    "NotYourPurchase",
    "apply",
    "decode_notification",
    "decode_renewal",
    "decode_transaction",
    "handle_notification",
    "parse_product_id",
    "product_id",
    "products",
    "snapshot_of",
    "sync_from_app",
]
