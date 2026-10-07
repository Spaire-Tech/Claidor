"""The plans as Stripe sells them: products, prices and meters, by name.

Stripe owns the objects; this module owns their names, so the server can
find them without ids in settings. A price is found by its `lookup_key`
(`simeon_standard_month`), a product by `metadata.simeon_tier`, a meter by
its `event_name`. `scripts/stripe_catalog.py` creates and updates them
from this file; the credits each plan includes stay in
`simeon.entitlements.tiers`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from simeon.config import settings
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, TierKey, get_definition

BillingInterval = Literal["month", "year"]

#: Every plan's trial: seven days, card on file, charged on day eight.
TRIAL_DAYS = 7

#: Yearly is 20% off twelve months, in whole dollars: $192, $576, $1,920.
YEARLY_DISCOUNT = 0.8

LOOKUP_KEY_PREFIX = "simeon"

#: What each product says on Stripe's checkout page and invoices.
PRODUCT_DESCRIPTIONS: dict[TierKey, str] = {
    TierKey.standard: (
        "For a light week of work. 3,750,000 credits a week, about thirty tasks. "
        "Every agent and every feature, a cloud computer for each agent, "
        "routines that run while your Mac is closed."
    ),
    TierKey.pro: (
        "For agents working every day. 12,500,000 credits a week, three times "
        "Standard, with room for routines that run every day."
    ),
    TierKey.max: (
        "For a team of agents that never stops. 40,000,000 credits a week, "
        "eleven times Standard: agents on routines all week long."
    ),
}


def lookup_key(tier: TierKey, interval: BillingInterval) -> str:
    return f"{LOOKUP_KEY_PREFIX}_{tier.value}_{interval}"


def parse_lookup_key(key: str | None) -> tuple[TierKey, BillingInterval] | None:
    """`simeon_pro_year` → (pro, year); anything else → None."""
    if not key:
        return None
    parts = key.split("_")
    if len(parts) != 3 or parts[0] != LOOKUP_KEY_PREFIX:
        return None
    try:
        tier = TierKey(parts[1])
    except ValueError:
        return None
    if tier not in PAID_TIERS or parts[2] not in ("month", "year"):
        return None
    interval: BillingInterval = "month" if parts[2] == "month" else "year"
    return tier, interval


def yearly_cents(monthly_cents: int) -> int:
    return int(round(monthly_cents * 12 * YEARLY_DISCOUNT / 100.0)) * 100


@dataclass(frozen=True)
class PlanPrice:
    tier: TierKey
    interval: BillingInterval
    lookup_key: str
    unit_amount: int  # cents

    @property
    def nickname(self) -> str:
        return f"Simeon {TIER_NAMES[self.tier]}, {'monthly' if self.interval == 'month' else 'yearly'}"


@dataclass(frozen=True)
class PlanProduct:
    tier: TierKey
    name: str
    description: str

    @property
    def metadata(self) -> dict[str, str]:
        return {"simeon_tier": self.tier.value}


@dataclass(frozen=True)
class MeterSpec:
    event_name: str
    display_name: str
    #: The key in the event payload that carries the number.
    value_key: str = "value"


def products() -> list[PlanProduct]:
    return [
        PlanProduct(
            tier=tier,
            name=f"Simeon {TIER_NAMES[tier]}",
            description=PRODUCT_DESCRIPTIONS[tier],
        )
        for tier in PAID_TIERS
    ]


def prices() -> list[PlanPrice]:
    out: list[PlanPrice] = []
    for tier in PAID_TIERS:
        monthly = get_definition(tier).monthly_price_cents
        out.append(PlanPrice(tier, "month", lookup_key(tier, "month"), monthly))
        out.append(
            PlanPrice(tier, "year", lookup_key(tier, "year"), yearly_cents(monthly))
        )
    return out


def price_for(tier: TierKey, interval: BillingInterval) -> PlanPrice:
    for price in prices():
        if price.tier == tier and price.interval == interval:
            return price
    raise KeyError(f"{tier.value}/{interval}")


def meters() -> list[MeterSpec]:
    return [
        MeterSpec(
            event_name=settings.STRIPE_CREDITS_METER_EVENT,
            display_name="Simeon credits",
        ),
        MeterSpec(
            event_name=settings.STRIPE_BOX_SECONDS_METER_EVENT,
            display_name="Simeon cloud computer seconds",
        ),
    ]


__all__ = [
    "TRIAL_DAYS",
    "BillingInterval",
    "MeterSpec",
    "PlanPrice",
    "PlanProduct",
    "lookup_key",
    "meters",
    "parse_lookup_key",
    "price_for",
    "prices",
    "products",
    "yearly_cents",
]
