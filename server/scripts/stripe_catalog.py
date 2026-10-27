"""Create or update Simeon's plans on Stripe: three products, six prices and
two meters, and the extra credits (one product, one one-time price), from
`simeon.plans.catalog`.

Idempotent. A product is found by `metadata.simeon_tier` (the credits' by
`metadata.simeon_kind`), a price by its `lookup_key`, a meter by its
`event_name`. A price whose amount changed is
archived and replaced, the lookup key moving to the new one; Stripe prices
are immutable. Run it against test mode first (a test secret key in
`SIMEON_STRIPE_SECRET_KEY`), then live.

    uv run python -m scripts.stripe_catalog list        # what the catalogue says
    uv run python -m scripts.stripe_catalog run --dry-run
    uv run python -m scripts.stripe_catalog run
"""

from __future__ import annotations

import logging.config
from typing import Any

import stripe
import structlog
import typer

from simeon.config import settings
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, get_definition
from simeon.plans import catalog

cli = typer.Typer()


def _drop_all(*args: Any, **kwargs: Any) -> Any:
    raise structlog.DropEvent


structlog.configure(processors=[_drop_all])
logging.config.dictConfig({"version": 1, "disable_existing_loggers": True})


#: Each plan's picture on Stripe's checkout page and in its emails (the app's
#: icon, served by the website). Without one, Checkout shows a grey square
#: beside "Simeon Standard" (the founder, 16 October 2026).
PRODUCT_IMAGE = "https://www.simeonlabs.com/img/simeon-icon.png"


def _dollars(cents: int) -> str:
    return f"${cents / 100:,.0f}" if cents % 100 == 0 else f"${cents / 100:,.2f}"


@cli.command()
def list() -> None:
    """Print the plans, prices and meters the server expects."""
    typer.echo("Products")
    for product in catalog.products():
        definition = get_definition(product.tier)
        typer.echo(
            f"  {product.name:<18} metadata.simeon_tier={product.tier.value:<9}"
            f" {definition.weekly_credits:>10,} credits/week"
            f"  trial {definition.trial_credits:,} credits, {catalog.TRIAL_DAYS} days"
        )
    typer.echo("Prices")
    for price in catalog.prices():
        typer.echo(
            f"  {price.lookup_key:<24} {_dollars(price.unit_amount):>8} / {price.interval}"
            f"   ({price.nickname})"
        )
    typer.echo("Extra credits")
    typer.echo(
        f"  {catalog.CREDITS_LOOKUP_KEY:<24} {_dollars(catalog.CREDITS_PACK_CENTS):>8}"
        f" once  {catalog.CREDITS_PACK:,} credits, up to"
        f" {catalog.CREDITS_MAX_PACKS} a checkout  ({catalog.CREDITS_PRODUCT_NAME})"
    )
    typer.echo("Meters")
    for meter in catalog.meters():
        typer.echo(
            f"  {meter.event_name:<24} {meter.display_name}  (sum of payload.{meter.value_key}, by stripe_customer_id)"
        )


def _find_product(tier: str) -> stripe.Product | None:
    found = stripe.Product.search(
        query=f"metadata['simeon_tier']:'{tier}' AND active:'true'"
    )
    return found.data[0] if found.data else None


def _find_credits_product() -> stripe.Product | None:
    found = stripe.Product.search(
        query=f"metadata['simeon_kind']:'{catalog.CREDITS_KIND}' AND active:'true'"
    )
    return found.data[0] if found.data else None


def _credits(dry_run: bool) -> None:
    """The extra credits: one product and its one-time price."""
    metadata = {
        "simeon_kind": catalog.CREDITS_KIND,
        "credits": str(catalog.CREDITS_PACK),
    }
    existing = _find_credits_product()
    product_id: str | None = None
    if existing is None:
        typer.echo(f"  product  {catalog.CREDITS_PRODUCT_NAME}: create")
        if not dry_run:
            product_id = stripe.Product.create(
                name=catalog.CREDITS_PRODUCT_NAME,
                description=catalog.CREDITS_PRODUCT_DESCRIPTION,
                metadata=metadata,
                images=[PRODUCT_IMAGE],
                statement_descriptor=settings.STRIPE_STATEMENT_DESCRIPTOR[:22],
            ).id
    else:
        product_id = existing.id
        changed = (
            existing.name != catalog.CREDITS_PRODUCT_NAME
            or (existing.description or "") != catalog.CREDITS_PRODUCT_DESCRIPTION
            or any(existing.metadata.get(k) != v for k, v in metadata.items())
        )
        typer.echo(
            f"  product  {catalog.CREDITS_PRODUCT_NAME}: "
            f"{'update' if changed else 'unchanged'} ({existing.id})"
        )
        if changed and not dry_run:
            stripe.Product.modify(
                existing.id,
                name=catalog.CREDITS_PRODUCT_NAME,
                description=catalog.CREDITS_PRODUCT_DESCRIPTION,
                metadata=metadata,
                images=[PRODUCT_IMAGE],
            )
    price = _find_price(catalog.CREDITS_LOOKUP_KEY)
    if price is not None and price.unit_amount == catalog.CREDITS_PACK_CENTS:
        typer.echo(f"  price    {catalog.CREDITS_LOOKUP_KEY}: unchanged ({price.id})")
        return
    typer.echo(
        f"  price    {catalog.CREDITS_LOOKUP_KEY}: "
        f"{'create' if price is None else f'replace {price.id}'}"
    )
    if dry_run or product_id is None:
        return
    stripe.Price.create(
        product=product_id,
        currency="usd",
        unit_amount=catalog.CREDITS_PACK_CENTS,
        lookup_key=catalog.CREDITS_LOOKUP_KEY,
        transfer_lookup_key=True,
        nickname=catalog.CREDITS_PRODUCT_NAME,
        tax_behavior="inclusive",
        metadata=metadata,
    )
    if price is not None:
        stripe.Price.modify(price.id, active=False)


def _find_price(lookup_key: str) -> stripe.Price | None:
    found = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1)
    return found.data[0] if found.data else None


def _find_meter(event_name: str) -> stripe.billing.Meter | None:
    for meter in stripe.billing.Meter.list(
        status="active", limit=100
    ).auto_paging_iter():
        if meter.event_name == event_name:
            return meter
    return None


@cli.command()
def run(dry_run: bool = typer.Option(False, "--dry-run")) -> None:
    """Create or update the products, prices and meters on Stripe."""
    if not settings.STRIPE_SECRET_KEY:
        typer.echo("SIMEON_STRIPE_SECRET_KEY is not set.", err=True)
        raise typer.Exit(1)
    stripe.api_key = settings.STRIPE_SECRET_KEY
    mode = "test" if settings.STRIPE_SECRET_KEY.startswith("sk_test_") else "LIVE"
    typer.echo(f"Stripe {mode} mode{' (dry run)' if dry_run else ''}")

    product_ids: dict[str, str] = {}
    for spec in catalog.products():
        definition = get_definition(spec.tier)
        existing = _find_product(spec.tier.value)
        metadata = {
            **spec.metadata,
            "weekly_credits": str(definition.weekly_credits),
            "trial_credits": str(definition.trial_credits),
            "trial_days": str(catalog.TRIAL_DAYS),
        }
        if existing is None:
            typer.echo(f"  product  {spec.name}: create")
            if not dry_run:
                created = stripe.Product.create(
                    name=spec.name,
                    description=spec.description,
                    metadata=metadata,
                    images=[PRODUCT_IMAGE],
                    statement_descriptor=settings.STRIPE_STATEMENT_DESCRIPTOR[:22],
                )
                product_ids[spec.tier.value] = created.id
            continue
        product_ids[spec.tier.value] = existing.id
        changed = (
            existing.name != spec.name
            or (existing.description or "") != spec.description
            or any(existing.metadata.get(k) != v for k, v in metadata.items())
            or list(existing.get("images") or []) != [PRODUCT_IMAGE]
        )
        typer.echo(
            f"  product  {spec.name}: {'update' if changed else 'unchanged'} ({existing.id})"
        )
        if changed and not dry_run:
            stripe.Product.modify(
                existing.id,
                name=spec.name,
                description=spec.description,
                metadata=metadata,
                images=[PRODUCT_IMAGE],
            )

    for price_spec in catalog.prices():
        product_id = product_ids.get(price_spec.tier.value)
        existing_price = _find_price(price_spec.lookup_key)
        if (
            existing_price is not None
            and existing_price.unit_amount == price_spec.unit_amount
        ):
            typer.echo(
                f"  price    {price_spec.lookup_key}: unchanged ({existing_price.id})"
            )
            continue
        action = (
            "create"
            if existing_price is None
            else f"replace {existing_price.id} ({existing_price.unit_amount} → {price_spec.unit_amount})"
        )
        typer.echo(f"  price    {price_spec.lookup_key}: {action}")
        if dry_run or product_id is None:
            continue
        stripe.Price.create(
            product=product_id,
            currency="usd",
            unit_amount=price_spec.unit_amount,
            recurring={"interval": price_spec.interval},
            lookup_key=price_spec.lookup_key,
            transfer_lookup_key=True,
            nickname=price_spec.nickname,
            tax_behavior="inclusive",
            metadata={
                "simeon_tier": price_spec.tier.value,
                "billing_interval": price_spec.interval,
            },
        )
        if existing_price is not None:
            stripe.Price.modify(existing_price.id, active=False)

    _credits(dry_run)

    for meter_spec in catalog.meters():
        existing_meter = _find_meter(meter_spec.event_name)
        if existing_meter is not None:
            typer.echo(
                f"  meter    {meter_spec.event_name}: unchanged ({existing_meter.id})"
            )
            continue
        typer.echo(f"  meter    {meter_spec.event_name}: create")
        if not dry_run:
            stripe.billing.Meter.create(
                display_name=meter_spec.display_name,
                event_name=meter_spec.event_name,
                default_aggregation={"formula": "sum"},
                customer_mapping={
                    "event_payload_key": "stripe_customer_id",
                    "type": "by_id",
                },
                value_settings={"event_payload_key": meter_spec.value_key},
            )

    typer.echo("Done." if not dry_run else "Dry run: nothing written.")
    typer.echo(
        "Next: in Stripe, Settings → Billing → Customer portal: allow cancelling "
        "at the end of the period and updating the card; turn switching plans "
        "off (Simeon changes plans itself: upgrades today, downgrades at "
        f"renewal). Plan names: {', '.join(TIER_NAMES[t] for t in PAID_TIERS)}."
    )


if __name__ == "__main__":
    cli()
