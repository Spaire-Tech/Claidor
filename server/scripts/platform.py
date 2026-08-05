import asyncio
import logging.config
from functools import wraps
from typing import Any

import structlog
import typer
from sqlalchemy import select

from polar.config import settings
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Organization
from polar.platform.service import (
    PlatformError,
    platform as platform_service,
)
from polar.postgres import create_async_engine

cli = typer.Typer()


def drop_all(*args: Any, **kwargs: Any) -> Any:
    raise structlog.DropEvent


structlog.configure(processors=[drop_all])
logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": True,
    }
)


def typer_async(f):  # type: ignore
    @wraps(f)
    def wrapper(*args, **kwargs):  # type: ignore
        return asyncio.run(f(*args, **kwargs))

    return wrapper


@cli.command(help="Verify the configured platform organization exists.")
@typer_async
async def verify() -> None:
    if not platform_service.is_configured():
        typer.echo(
            "SPAIRE_PLATFORM_ORG_ID is not set.\n"
            "\n"
            "To configure:\n"
            "  1. Run `python -m scripts.platform list` to find candidate orgs.\n"
            "  2. Set SPAIRE_PLATFORM_ORG_ID=<uuid> in your environment.\n"
            "  3. Re-run this command to confirm.\n"
        )
        raise typer.Exit(code=1)

    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        try:
            organization = await platform_service.get(session)
        except PlatformError as e:
            typer.echo(f"❌ {e.message}", err=True)
            raise typer.Exit(code=1) from e

        typer.echo(
            "✓ Platform organization configured:\n"
            f"  id:   {organization.id}\n"
            f"  slug: {organization.slug}\n"
            f"  name: {organization.name}\n"
        )


@cli.command(
    help=(
        "List candidate organizations whose slug starts with the given prefix "
        "(default: 'spaire')."
    )
)
@typer_async
async def list(slug_prefix: str = "spaire") -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        result = await session.execute(
            select(Organization)
            .where(Organization.slug.startswith(slug_prefix))
            .where(Organization.deleted_at.is_(None))
            .order_by(Organization.created_at)
        )
        orgs = result.scalars().all()

        if not orgs:
            typer.echo(
                f"No organizations matching slug prefix '{slug_prefix}'.\n"
                "Create one through normal signup, then re-run this command."
            )
            return

        configured_id = settings.PLATFORM_ORG_ID
        typer.echo(f"Organizations matching slug prefix '{slug_prefix}':\n")
        for org in orgs:
            marker = "  ← currently configured" if org.id == configured_id else ""
            typer.echo(f"  {org.id}  slug={org.slug}  name={org.name}{marker}")

        if configured_id is None:
            typer.echo(
                "\nTo configure one of these as the platform org, set:\n"
                "  SPAIRE_PLATFORM_ORG_ID=<id>\n"
            )


if __name__ == "__main__":
    cli()
