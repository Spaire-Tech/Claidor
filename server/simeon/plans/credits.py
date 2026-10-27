"""Extra credits (27 October 2026): packs bought on the web, for when the
week's credits run out.

As Claude's usage credits, and with the founder's picks: bought ahead, on
the web only, by a person on a paid plan (not during a trial). A pack is
`catalog.CREDITS_PACK` credits for `catalog.CREDITS_PACK_CENTS`, valid for
twelve months. The week's credits are always used first; a call that goes
past them draws the rest from the packs, the one that expires first first
(`DesktopService.record_usage`), and the call's row says how much
(`DesktopUsage.extra_credits`), so the week counts only its own part.

A pack is granted once per paid checkout, by whichever gets there first:
Stripe's `checkout.session.completed` webhook (or
`checkout.session.async_payment_succeeded` for a payment that clears later),
or the billing page asking as the checkout sends the person back
(`sync_checkout`). A refund (`charge.refunded`) takes back what is left of
the refunded share.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog

from simeon.config import settings
from simeon.desktop.words import say
from simeon.exceptions import PolarError
from simeon.kit.utils import utc_now
from simeon.models import DesktopCreditPack, User
from simeon.postgres import AsyncSession
from simeon.user.repository import UserRepository

from . import catalog
from .repository import DesktopCreditPackRepository
from .stripe_billing import stripe_billing

log: structlog.stdlib.BoundLogger = structlog.get_logger()

#: How long a pack lasts.
VALID_FOR = timedelta(days=365)


class CreditsError(PolarError): ...


class CreditsNeedAPlan(CreditsError):
    """Extra credits top up a paid plan's week; a trial or no plan has none."""

    def __init__(self) -> None:
        super().__init__(say("billing.credits_need_a_plan"), 409)


class CreditsNotConfigured(CreditsError):
    def __init__(self) -> None:
        super().__init__(say("billing.not_configured"), 503)


class CreditsCheckoutNotYours(CreditsError):
    def __init__(self) -> None:
        super().__init__(say("billing.checkout_not_yours"), 403)


async def balance(
    session: AsyncSession, user_id: UUID, *, now: datetime | None = None
) -> int:
    """The extra credits a person has left, in packs not yet expired."""
    return await DesktopCreditPackRepository.from_session(session).balance(
        user_id, now or utc_now()
    )


async def live_packs(
    session: AsyncSession, user_id: UUID, *, now: datetime | None = None
) -> list[DesktopCreditPack]:
    return list(
        await DesktopCreditPackRepository.from_session(session).list_live(
            user_id, now or utc_now()
        )
    )


async def draw(
    session: AsyncSession, user_id: UUID, credits: int, *, now: datetime | None = None
) -> int:
    """Take up to `credits` from the person's packs, the first to expire
    first. Returns what was taken; less when the packs hold less."""
    if credits <= 0:
        return 0
    packs = await DesktopCreditPackRepository.from_session(session).list_live(
        user_id, now or utc_now(), for_update=True
    )
    taken = 0
    for pack in packs:
        if taken >= credits:
            break
        share = min(pack.remaining, credits - taken)
        pack.remaining -= share
        taken += share
        session.add(pack)
    return taken


async def create_checkout(
    session: AsyncSession,
    user: User,
    *,
    packs: int = 1,
    success_url: str,
    cancel_url: str,
) -> str:
    """A Stripe Checkout URL for `packs` packs, paid once. The person
    can change the number on Stripe's page, up to `CREDITS_MAX_PACKS`."""
    # Imported here: the allowance reads this module (`exhausted`).
    from simeon.desktop.allowance import resolve_allowance

    from .service import UnknownPrice, plans

    if not settings.STRIPE_SECRET_KEY:
        raise CreditsNotConfigured()
    allowance = await resolve_allowance(session, user)
    if not allowance.paid:
        raise CreditsNeedAPlan()
    price = await stripe_billing.price_by_lookup_key(catalog.CREDITS_LOOKUP_KEY)
    if price is None:
        raise UnknownPrice(catalog.CREDITS_LOOKUP_KEY)
    customer_id = await plans.customer_id_for(session, user)
    quantity = max(1, min(packs, catalog.CREDITS_MAX_PACKS))
    metadata = {
        "simeon_user_id": str(user.id),
        "simeon_kind": catalog.CREDITS_KIND,
        "simeon_pack_credits": str(catalog.CREDITS_PACK),
    }
    checkout = await stripe_billing.create_checkout_session(
        mode="payment",
        customer=customer_id,
        client_reference_id=str(user.id),
        line_items=[
            {
                "price": price.id,
                "quantity": quantity,
                "adjustable_quantity": {
                    "enabled": True,
                    "minimum": 1,
                    "maximum": catalog.CREDITS_MAX_PACKS,
                },
            }
        ],
        metadata=metadata,
        payment_intent_data={"metadata": metadata},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    log.info(
        "plans.credits.checkout",
        user_id=str(user.id),
        packs=quantity,
        checkout_session_id=checkout.id,
    )
    return str(checkout.url)


def _packs_in(checkout: Any) -> int:
    items = checkout.get("line_items")
    data = items.get("data") if items is not None and hasattr(items, "get") else None
    if data:
        return sum(int(item.get("quantity") or 0) for item in data)
    return 0


def _is_credits(checkout: Any) -> bool:
    metadata = checkout.get("metadata") or {}
    return (
        checkout.get("mode") == "payment"
        and hasattr(metadata, "get")
        and metadata.get("simeon_kind") == catalog.CREDITS_KIND
    )


async def grant(
    session: AsyncSession, checkout: Any, *, now: datetime | None = None
) -> DesktopCreditPack | None:
    """The pack a paid credits checkout bought, made once. None for a
    checkout that is not for credits, not paid yet, or for nobody known."""
    if not _is_credits(checkout) or checkout.get("payment_status") != "paid":
        return None
    repository = DesktopCreditPackRepository.from_session(session)
    existing = await repository.get_by_checkout_session(checkout["id"])
    if existing is not None:
        return existing
    if checkout.get("line_items") is None:
        checkout = await stripe_billing.retrieve_paid_checkout(checkout["id"])
    try:
        user_id = UUID(str(checkout.get("client_reference_id") or ""))
    except ValueError:
        user_id = None
    user = (
        await UserRepository.from_session(session).get_by_id(user_id)
        if user_id is not None
        else None
    )
    if user is None:
        log.warning("plans.credits.nobody", checkout_session_id=checkout["id"])
        return None
    metadata = checkout.get("metadata") or {}
    per_pack = int(metadata.get("simeon_pack_credits") or catalog.CREDITS_PACK)
    packs = _packs_in(checkout) or 1
    moment = now or utc_now()
    payment_intent = checkout.get("payment_intent")
    pack = DesktopCreditPack(
        user_id=user.id,
        credits=per_pack * packs,
        remaining=per_pack * packs,
        expires_at=moment + VALID_FOR,
        amount_cents=int(checkout.get("amount_total") or 0),
        currency=str(checkout.get("currency") or "usd"),
        stripe_checkout_session_id=checkout["id"],
        stripe_payment_intent_id=payment_intent
        if isinstance(payment_intent, str)
        else (payment_intent or {}).get("id"),
    )
    await repository.create(pack, flush=True)
    log.info(
        "plans.credits.granted",
        user_id=str(user.id),
        credits=pack.credits,
        checkout_session_id=checkout["id"],
    )
    return pack


async def sync_checkout(
    session: AsyncSession, user: User, checkout_session_id: str
) -> DesktopCreditPack | None:
    """The checkout came back before the webhook did: grant the pack now."""
    if not settings.STRIPE_SECRET_KEY:
        raise CreditsNotConfigured()
    checkout = await stripe_billing.retrieve_paid_checkout(checkout_session_id)
    if str(checkout.get("client_reference_id") or "") != str(user.id):
        raise CreditsCheckoutNotYours()
    return await grant(session, checkout)


async def refund(session: AsyncSession, charge: Any) -> int:
    """A refunded payment takes back the refunded share of what is left:
    all of it for a full refund. Returns the credits taken back."""
    payment_intent = charge.get("payment_intent")
    payment_intent_id = (
        payment_intent
        if isinstance(payment_intent, str)
        else (payment_intent or {}).get("id")
    )
    if not payment_intent_id:
        return 0
    packs = await DesktopCreditPackRepository.from_session(
        session
    ).list_by_payment_intent(payment_intent_id)
    amount = int(charge.get("amount") or 0)
    refunded = int(charge.get("amount_refunded") or 0)
    if not packs or amount <= 0 or refunded <= 0:
        return 0
    taken = 0
    for pack in packs:
        keep = pack.credits - (pack.credits * min(refunded, amount)) // amount
        if pack.remaining > keep:
            taken += pack.remaining - keep
            pack.remaining = keep
        if refunded >= amount:
            pack.refunded_at = pack.refunded_at or utc_now()
        session.add(pack)
    log.info(
        "plans.credits.refunded",
        payment_intent=payment_intent_id,
        credits_taken=taken,
        full=refunded >= amount,
    )
    return taken


__all__ = [
    "VALID_FOR",
    "CreditsCheckoutNotYours",
    "CreditsError",
    "CreditsNeedAPlan",
    "CreditsNotConfigured",
    "balance",
    "create_checkout",
    "draw",
    "grant",
    "live_packs",
    "refund",
    "sync_checkout",
]
