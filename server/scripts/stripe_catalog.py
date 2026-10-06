"""Create or update Simeon's plans on Stripe: three products, six prices and
two meters, from `simeon.plans.catalog`.

Idempotent. A product is found by `metadata.simeon_tier`, a price by its
`lookup_key`, a meter by its `event_name`. A price whose amount changed is
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
                    statement_descriptor=settings.STRIPE_STATEMENT_DESCRIPTOR[:22],
                )
                product_ids[spec.tier.value] = created.id
            continue
        product_ids[spec.tier.value] = existing.id
        changed = (
            existing.name != spec.name
            or (existing.description or "") != spec.description
            or any(existing.metadata.get(k) != v for k, v in metadata.items())
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
        "Next: in Stripe, Settings → Billing → Customer portal: allow cancelling, "
        "switching between the six prices, and updating the card. "
        f"Plan names: {', '.join(TIER_NAMES[t] for t in PAID_TIERS)}."
    )


if __name__ == "__main__":
    cli()
