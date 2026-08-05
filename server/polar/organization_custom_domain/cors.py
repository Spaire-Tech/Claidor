"""Dynamic CORS allow-list for active custom storefront domains.

The web client sends `credentials: 'include'` on every request, and
browsers reject credentialed responses whose Access-Control-Allow-Origin
is `*` — so an origin like https://learn.creator.com must be matched by a
credentialed CORS config, not the wildcard fallback.

The CORS matcher runs synchronously on every request, so it can't query
the database. Instead we keep an in-process set of ACTIVE domains that a
background task refreshes every REFRESH_INTERVAL_SECONDS (started from
the app lifespan). Activation already waits on DNS propagation, so the
refresh delay is imperceptible; deactivated domains lose CORS within the
same interval.
"""

import asyncio
from urllib.parse import urlparse

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from polar.models import OrganizationCustomDomain
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus

log: structlog.stdlib.BoundLogger = structlog.get_logger()

REFRESH_INTERVAL_SECONDS = 60.0

_active_domains: frozenset[str] = frozenset()
_refresher_task: asyncio.Task[None] | None = None


def is_active_custom_domain_origin(origin: str) -> bool:
    """Sync matcher for CORSMatcherMiddleware: is this origin an active
    custom storefront domain served over HTTPS?"""
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    if parsed.scheme != "https" or parsed.hostname is None:
        return False
    return parsed.hostname.lower() in _active_domains


async def refresh_active_domains(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:
    """Reload the active-domain set from the database. Failures keep the
    previous set (never wipe a working allow-list on a transient error)."""
    global _active_domains
    try:
        async with sessionmaker() as session:
            result = await session.execute(
                select(OrganizationCustomDomain.domain).where(
                    OrganizationCustomDomain.status
                    == OrganizationCustomDomainStatus.active,
                    OrganizationCustomDomain.deleted_at.is_(None),
                )
            )
            domains = frozenset(domain.lower() for domain in result.scalars())
    except Exception as e:
        log.warning("organization_custom_domain.cors.refresh_failed", error=str(e))
        return
    if domains != _active_domains:
        log.info(
            "organization_custom_domain.cors.refreshed",
            count=len(domains),
        )
    _active_domains = domains


def start_refresher(sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    global _refresher_task

    async def _loop() -> None:
        while True:
            await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
            await refresh_active_domains(sessionmaker)

    _refresher_task = asyncio.create_task(_loop())


async def stop_refresher() -> None:
    global _refresher_task
    if _refresher_task is not None:
        _refresher_task.cancel()
        try:
            await _refresher_task
        except asyncio.CancelledError:
            pass
        _refresher_task = None
