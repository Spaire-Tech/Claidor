"""Move an organization slug from one org to another (one-off, guarded).

Org slugs are globally unique, so to give a slug that's already taken to
another org you must release it from the current holder in the same breath.
This script does that atomically: it renames the org currently holding
``--slug`` to a free slug, then assigns ``--slug`` (and a matching
customer_invoice_prefix) to the target org — in a single transaction.

Read-only by default: it prints an inspection of BOTH orgs (name, status,
counts of customers / orders / products) plus the exact plan, and changes
nothing. Re-run with ``--apply`` to commit.

Built for: moving "spaire" off a leftover test org onto the platform org so
invoices, card-statement descriptors, and billing-email From-addresses read
"spaire" instead of the old slug.

Usage:
    python -m scripts.swap_org_slug run \
        --release-org <uuid currently holding the slug> \
        --claim-org   <uuid that should get the slug> \
        [--slug spaire] [--release-slug spaire-test-xxxx] [--apply]
"""

import asyncio
import logging.config
from functools import wraps
from typing import Any
from uuid import UUID

import structlog
import typer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Customer, Order, Organization, Product
from polar.postgres import create_async_engine

cli = typer.Typer()

_INVOICE_PREFIX_MAX = 32


def _drop_all(*args: Any, **kwargs: Any) -> Any:
    raise structlog.DropEvent


structlog.configure(processors=[_drop_all])
logging.config.dictConfig({"version": 1, "disable_existing_loggers": True})


def typer_async(f):  # type: ignore
    @wraps(f)
    def wrapper(*args, **kwargs):  # type: ignore
        return asyncio.run(f(*args, **kwargs))

    return wrapper


class SwapError(Exception):
    """A precondition for the swap failed — abort before any write."""


async def _load_org(session: AsyncSession, org_id: UUID) -> Organization | None:
    """Load an org by id, INCLUDING soft-deleted rows (a held slug counts
    no matter the org's state)."""
    result = await session.execute(
        select(Organization).where(Organization.id == org_id)
    )
    return result.scalar_one_or_none()


async def _slug_holder(
    session: AsyncSession, slug: str, *, exclude_id: UUID
) -> Organization | None:
    """Return the org (if any) holding `slug` other than `exclude_id`,
    including soft-deleted orgs — the DB unique constraint spans them too."""
    result = await session.execute(
        select(Organization).where(
            func.lower(Organization.slug) == slug.lower(),
            Organization.id != exclude_id,
        )
    )
    return result.scalar_one_or_none()


async def _inspect(session: AsyncSession, org: Organization) -> dict[str, Any]:
    customers = await session.scalar(
        select(func.count()).select_from(Customer).where(
            Customer.organization_id == org.id
        )
    )
    # Order has no organization_id; an org's orders are those whose customer
    # belongs to the org (the canonical join — see OrderRepository).
    orders = await session.scalar(
        select(func.count())
        .select_from(Order)
        .join(Customer, Order.customer_id == Customer.id)
        .where(Customer.organization_id == org.id)
    )
    products = await session.scalar(
        select(func.count()).select_from(Product).where(
            Product.organization_id == org.id
        )
    )
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "status": getattr(org.status, "value", org.status),
        "deleted_at": org.deleted_at,
        "created_at": org.created_at,
        "invoice_prefix": org.customer_invoice_prefix,
        "customers": customers or 0,
        "orders": orders or 0,
        "products": products or 0,
    }


def _default_release_slug(slug: str, release_org: Organization) -> str:
    return f"{slug}-test-{str(release_org.id)[:8]}"


async def perform_swap(
    session: AsyncSession,
    *,
    release_org: Organization,
    claim_org: Organization,
    slug: str,
    release_slug: str,
) -> None:
    """Atomically move `slug` from release_org to claim_org.

    Validates preconditions, then renames release_org OFF the slug (flushing
    so the unique name is freed) BEFORE assigning it to claim_org. Caller
    owns the commit. Raises SwapError on any precondition failure.
    """
    if release_org.id == claim_org.id:
        raise SwapError("release-org and claim-org are the same organization.")
    if release_org.slug.lower() != slug.lower():
        raise SwapError(
            f"release-org slug is '{release_org.slug}', not '{slug}'. "
            "Nothing to release — re-check the org id."
        )
    if claim_org.slug.lower() == slug.lower():
        raise SwapError(f"claim-org already has slug '{slug}'. Nothing to do.")

    # The slug must be held only by release_org (incl. soft-deleted orgs).
    other_holder = await _slug_holder(session, slug, exclude_id=release_org.id)
    if other_holder is not None:
        raise SwapError(
            f"slug '{slug}' is also held by org {other_holder.id} "
            f"(slug={other_holder.slug}, deleted_at={other_holder.deleted_at}). "
            "Resolve that first."
        )
    # The release slug must be globally free (incl. soft-deleted orgs).
    release_conflict = await _slug_holder(
        session, release_slug, exclude_id=release_org.id
    )
    if release_conflict is not None:
        raise SwapError(
            f"the release slug '{release_slug}' is already taken by org "
            f"{release_conflict.id}. Pass a different --release-slug."
        )

    # Order matters: free the name first, flush, THEN claim it. The unique
    # constraint is immediate, so doing both in one flush could violate it.
    release_org.slug = release_slug
    release_org.customer_invoice_prefix = release_slug.upper()[:_INVOICE_PREFIX_MAX]
    await session.flush()

    claim_org.slug = slug
    claim_org.customer_invoice_prefix = slug.upper()[:_INVOICE_PREFIX_MAX]
    await session.flush()


def _print_inspection(label: str, info: dict[str, Any]) -> None:
    typer.echo(
        f"{label}:\n"
        f"  id           {info['id']}\n"
        f"  name         {info['name']}\n"
        f"  slug         {info['slug']}\n"
        f"  status       {info['status']}\n"
        f"  deleted_at   {info['deleted_at']}\n"
        f"  created_at   {info['created_at']}\n"
        f"  inv. prefix  {info['invoice_prefix']}\n"
        f"  customers    {info['customers']}\n"
        f"  orders       {info['orders']}\n"
        f"  products     {info['products']}\n"
    )


async def _run(
    session: AsyncSession,
    *,
    release_org: str,
    claim_org: str,
    slug: str,
    release_slug: str | None,
    apply: bool,
) -> None:
    """The whole flow against a given session: load both orgs, inspect them,
    print the plan, perform the swap, then commit (``--apply``) or roll back.

    Split out from the Typer command so it can be driven directly in a test
    with the real test session — i.e. the actual ``_inspect`` SQL and the
    actual ``perform_swap`` mutation run against a real database, not a proxy.
    """
    release = await _load_org(session, UUID(release_org))
    claim = await _load_org(session, UUID(claim_org))
    if release is None:
        typer.echo(f"❌ release-org {release_org} not found.", err=True)
        raise typer.Exit(code=1)
    if claim is None:
        typer.echo(f"❌ claim-org {claim_org} not found.", err=True)
        raise typer.Exit(code=1)

    target_release_slug = release_slug or _default_release_slug(slug, release)

    _print_inspection("RELEASE org (will be renamed)", await _inspect(session, release))
    _print_inspection("CLAIM org (will receive the slug)", await _inspect(session, claim))

    typer.echo(
        "Plan:\n"
        f"  '{release.slug}'  ->  '{target_release_slug}'   (release org {release.id})\n"
        f"  '{claim.slug}'  ->  '{slug}'   (claim org {claim.id})\n"
        f"  invoice prefix  ->  '{slug.upper()[:_INVOICE_PREFIX_MAX]}'  on claim org\n"
    )

    try:
        await perform_swap(
            session,
            release_org=release,
            claim_org=claim,
            slug=slug,
            release_slug=target_release_slug,
        )
    except SwapError as e:
        typer.echo(f"❌ {e}", err=True)
        raise typer.Exit(code=1) from e

    if apply:
        await session.commit()
        typer.echo("✓ Done — slug moved.")
    else:
        await session.rollback()
        typer.echo("(dry-run — validated, nothing committed. Re-run with --apply.)")


@cli.command(help="Move a slug from one org to another (dry-run unless --apply).")
@typer_async
async def run(
    release_org: str = typer.Option(
        ..., "--release-org", help="UUID of the org currently holding the slug."
    ),
    claim_org: str = typer.Option(
        ..., "--claim-org", help="UUID of the org that should get the slug."
    ),
    slug: str = typer.Option("spaire", "--slug", help="The slug to move."),
    release_slug: str | None = typer.Option(
        None,
        "--release-slug",
        help="New slug for the org being renamed. Default: <slug>-test-<id8>.",
    ),
    apply: bool = typer.Option(
        False, "--apply", help="Commit the change (default is a dry-run)."
    ),
) -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        await _run(
            session,
            release_org=release_org,
            claim_org=claim_org,
            slug=slug,
            release_slug=release_slug,
            apply=apply,
        )


if __name__ == "__main__":
    cli()
