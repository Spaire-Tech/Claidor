"""Grant a user full access to an organization.

Adds a `user_organizations` row linking the user to the org, which is
the same membership the dashboard uses for "this user can manage this
org." Idempotent — re-running for an existing membership is a no-op.

Primary use: granting Spaire staff full access to the Spaire platform
org so they can manage Pro/Studio/Scale subscriptions from inside the
dashboard.

Usage:
    # Grant by email + slug (most common):
    python -m scripts.grant_user_org_access run \\
        --email robin@spaire.com --org spaire

    # Or by IDs if you have them:
    python -m scripts.grant_user_org_access run \\
        --user 0c7f... --org 5d8a...

    # Dry-run prints intended change without writing.
    python -m scripts.grant_user_org_access run \\
        --email robin@spaire.com --org spaire --dry-run
"""

import asyncio
import logging.config
from functools import wraps
from typing import Any

import structlog
import typer
from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Organization, User
from polar.models.user_organization import UserOrganization
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


def _looks_like_uuid(value: str) -> bool:
    return "-" in value and len(value) >= 32


@cli.command(help="Grant a user full access to an organization.")
@typer_async
async def run(
    email: str | None = typer.Option(
        None, "--email", help="User email (case-insensitive)."
    ),
    user: str | None = typer.Option(
        None, "--user", help="User UUID (alternative to --email)."
    ),
    org: str = typer.Option(
        ..., "--org", help="Organization slug or UUID."
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Show intended change without writing."
    ),
) -> None:
    if (email is None) == (user is None):
        typer.echo("❌ Pass exactly one of --email or --user.", err=True)
        raise typer.Exit(code=2)

    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        user_stmt = select(User).where(User.deleted_at.is_(None))
        if user is not None:
            user_stmt = user_stmt.where(User.id == user)
        else:
            assert email is not None
            user_stmt = user_stmt.where(User.email.ilike(email))
        target_user = (await session.execute(user_stmt)).scalar_one_or_none()
        if target_user is None:
            label = email if email is not None else user
            typer.echo(f"❌ No user found matching '{label}'.", err=True)
            raise typer.Exit(code=1)

        org_stmt = select(Organization).where(Organization.deleted_at.is_(None))
        if _looks_like_uuid(org):
            org_stmt = org_stmt.where(Organization.id == org)
        else:
            org_stmt = org_stmt.where(Organization.slug == org)
        target_org = (await session.execute(org_stmt)).scalar_one_or_none()
        if target_org is None:
            typer.echo(f"❌ No organization found matching '{org}'.", err=True)
            raise typer.Exit(code=1)

        existing_stmt = select(UserOrganization).where(
            UserOrganization.user_id == target_user.id,
            UserOrganization.organization_id == target_org.id,
        )
        existing = (await session.execute(existing_stmt)).scalar_one_or_none()
        if existing is not None:
            typer.echo(
                f"✓ {target_user.email} already has access to "
                f"'{target_org.slug}' (since {existing.created_at.isoformat()})."
            )
            return

        if dry_run:
            typer.echo(
                f"[dry-run] Would grant {target_user.email} "
                f"access to '{target_org.slug}' (org id {target_org.id})."
            )
            return

        membership = UserOrganization(
            user_id=target_user.id,
            organization_id=target_org.id,
        )
        session.add(membership)
        await session.commit()

        typer.echo(
            f"✓ Granted {target_user.email} access to '{target_org.slug}'."
        )


if __name__ == "__main__":
    cli()
