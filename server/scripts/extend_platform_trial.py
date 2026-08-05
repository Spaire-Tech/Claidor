"""Extend the trial on a creator org's Spaire subscription.

Operator override for support cases where a creator needs more time on
their Pro/Studio/Scale trial than the seeded 14-day period. Bumps
`trial_end` (and `current_period_end`, which mirrors it for trialing
subs) forward by a configurable number of days.

Idempotent in the sense that re-running with the same `--days` value
keeps adding days; pass `--set` instead to overwrite the trial_end
to a specific date.

Usage:
    # Add 7 more days to org slug "acme"'s active trial:
    python -m scripts.extend_platform_trial run --org acme --days 7

    # Set trial_end to a specific ISO date:
    python -m scripts.extend_platform_trial run --org acme --until 2026-06-01

    # Dry-run prints intended changes without committing.
    python -m scripts.extend_platform_trial run --org acme --days 7 --dry-run
"""

import asyncio
import logging.config
from datetime import UTC, datetime, timedelta
from functools import wraps
from typing import Any

import structlog
import typer
from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.kit.utils import utc_now
from polar.models import Organization
from polar.models.subscription import SubscriptionStatus
from polar.platform.repository import (
    platform_customer_repository,
    platform_subscription_repository,
)
from polar.platform.service import PlatformError
from polar.platform.service import platform as platform_service
from polar.platform.trial_notifications import (
    encode_sent_markers,
    parse_sent_markers,
)
from polar.postgres import create_async_engine

cli = typer.Typer()


def drop_all(*args: Any, **kwargs: Any) -> Any:
    raise structlog.DropEvent


structlog.configure(processors=[drop_all])
logging.config.dictConfig({"version": 1, "disable_existing_loggers": True})


def typer_async(f):  # type: ignore
    @wraps(f)
    def wrapper(*args, **kwargs):  # type: ignore
        return asyncio.run(f(*args, **kwargs))

    return wrapper


@cli.command(help="Extend a creator org's Spaire trial.")
@typer_async
async def run(
    org: str = typer.Option(..., "--org", help="Creator org slug or UUID."),
    days: int | None = typer.Option(
        None, "--days", help="Add this many days to the current trial_end."
    ),
    until: str | None = typer.Option(
        None,
        "--until",
        help="Set trial_end to this ISO datetime (e.g. 2026-06-01).",
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Show intended change without writing."
    ),
) -> None:
    if (days is None) == (until is None):
        typer.echo("❌ Pass exactly one of --days or --until.", err=True)
        raise typer.Exit(code=2)

    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        try:
            platform_org = await platform_service.get(session)
        except PlatformError as exc:
            typer.echo(f"❌ {exc.message}", err=True)
            raise typer.Exit(code=1) from exc

        # Resolve creator org by slug or UUID.
        statement = select(Organization).where(Organization.deleted_at.is_(None))
        if "-" in org and len(org) >= 32:
            statement = statement.where(Organization.id == org)
        else:
            statement = statement.where(Organization.slug == org)
        result = await session.execute(statement)
        creator = result.scalar_one_or_none()
        if creator is None:
            typer.echo(f"❌ No creator organization found for '{org}'.", err=True)
            raise typer.Exit(code=1)

        customer_repo = platform_customer_repository(session)
        customer = await customer_repo.get_for_creator_org(platform_org.id, creator.id)
        if customer is None:
            typer.echo(
                f"❌ '{creator.slug}' has no platform-org Customer record.",
                err=True,
            )
            raise typer.Exit(code=1)

        subscription_repo = platform_subscription_repository(session)
        subscription = await subscription_repo.get_active_for_customer(customer.id)
        if subscription is None:
            typer.echo(
                f"❌ '{creator.slug}' has no active platform-org subscription.",
                err=True,
            )
            raise typer.Exit(code=1)

        if subscription.status != SubscriptionStatus.trialing:
            typer.echo(
                f"❌ Subscription {subscription.id} is in status "
                f"'{subscription.status.value}', not trialing. Trial "
                "extension only applies to trialing subs — for active "
                "paid subs use Stripe-side credits.",
                err=True,
            )
            raise typer.Exit(code=1)

        old_trial_end = subscription.trial_end
        if until is not None:
            try:
                new_trial_end = datetime.fromisoformat(until)
            except ValueError as exc:
                typer.echo(f"❌ Invalid --until value: {exc}", err=True)
                raise typer.Exit(code=2) from exc
            # A bare date ("2026-06-01") parses naive; the column and the
            # comparison below are tz-aware. Interpret naive input as UTC
            # instead of crashing with a naive/aware TypeError.
            if new_trial_end.tzinfo is None:
                new_trial_end = new_trial_end.replace(tzinfo=UTC)
        else:
            assert days is not None
            anchor = old_trial_end or utc_now()
            new_trial_end = anchor + timedelta(days=days)

        if old_trial_end is not None and new_trial_end <= old_trial_end:
            typer.echo(
                f"❌ New trial_end ({new_trial_end.isoformat()}) is not "
                f"after current trial_end ({old_trial_end.isoformat()}). "
                "Refusing to shrink a trial.",
                err=True,
            )
            raise typer.Exit(code=2)

        typer.echo(
            f"Org:                {creator.slug} ({creator.id})\n"
            f"Subscription:       {subscription.id}\n"
            f"Tier:               {(subscription.product.user_metadata or {}).get('tier')}\n"
            f"Old trial_end:      {old_trial_end.isoformat() if old_trial_end else '—'}\n"
            f"New trial_end:      {new_trial_end.isoformat()}\n"
        )

        if dry_run:
            typer.echo("(dry-run — no changes committed)")
            return

        subscription.trial_end = new_trial_end
        subscription.current_period_end = new_trial_end
        # A subscription stranded by a lost cycle dispatch keeps
        # scheduler_locked_at set and would never be picked up again even
        # with a fresh trial_end — extending is also the rescue path, so
        # clear the lock.
        subscription.scheduler_locked_at = None
        # Reset reminder markers for thresholds the extended window will
        # reach AGAIN (marker < days_remaining), keeping only those already
        # legitimately sent for the current window (marker >= days_remaining)
        # — e.g. extending to 10 days out clears 7/2/0 so all three fire
        # fresh; extending to 5 days out keeps a sent T-7 but re-arms T-2
        # and T-0. (The previous filter was inverted and silenced every
        # reminder in the extended window.)
        metadata = dict(subscription.user_metadata or {})
        sent = parse_sent_markers(metadata.get("trial_reminders_sent"))
        if sent:
            days_remaining = (new_trial_end - utc_now()).days
            metadata["trial_reminders_sent"] = encode_sent_markers(
                [m for m in sent if m >= days_remaining]
            )
            subscription.user_metadata = metadata

        await session.commit()
        typer.echo("✓ Trial extended.")


if __name__ == "__main__":
    cli()
