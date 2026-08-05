import uuid
from datetime import timedelta

import structlog
from sqlalchemy import or_, select

from polar.exceptions import PolarTaskError
from polar.integrations.vercel import domains as vercel_domains
from polar.kit.utils import utc_now
from polar.models import OrganizationCustomDomain
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus
from polar.worker import (
    AsyncSessionMaker,
    CronTrigger,
    TaskPriority,
    actor,
    enqueue_job,
)

from . import dns
from .service import organization_custom_domain as custom_domain_service

log: structlog.stdlib.BoundLogger = structlog.get_logger()

# Active/failed domains are re-checked this often; pending ones every run.
RECHECK_INTERVAL = timedelta(hours=24)


class OrganizationCustomDomainTaskError(PolarTaskError): ...


@actor(
    actor_name="organization_custom_domain.reconcile",
    cron_trigger=CronTrigger(minute=35),
    priority=TaskPriority.LOW,
    max_retries=0,
)
async def custom_domain_reconcile() -> None:
    """Hourly sweep: verify every pending domain (creators install DNS
    records without coming back to click verify), and re-verify
    active/failed domains whose last check is older than the re-check
    interval (catching records that were later removed, or restored)."""
    recheck_before = utc_now() - RECHECK_INTERVAL
    async with AsyncSessionMaker() as session:
        statement = select(OrganizationCustomDomain.id).where(
            OrganizationCustomDomain.deleted_at.is_(None),
            or_(
                OrganizationCustomDomain.status
                == OrganizationCustomDomainStatus.pending,
                OrganizationCustomDomain.last_checked_at.is_(None),
                OrganizationCustomDomain.last_checked_at < recheck_before,
            ),
        )
        result = await session.stream_scalars(statement)
        count = 0
        async for custom_domain_id in result:
            enqueue_job(
                "organization_custom_domain.verify",
                custom_domain_id=custom_domain_id,
            )
            count += 1
        log.info("organization_custom_domain.reconcile.scheduled", count=count)


@actor(
    actor_name="organization_custom_domain.verify",
    priority=TaskPriority.LOW,
)
async def custom_domain_verify(custom_domain_id: uuid.UUID) -> None:
    async with AsyncSessionMaker() as session:
        custom_domain = await session.get(OrganizationCustomDomain, custom_domain_id)
        if custom_domain is None:
            # Removed between fan-out and execution. No work to do.
            return
        try:
            result = await custom_domain_service.verify(session, custom_domain)
        except dns.DNSResolutionError as e:
            # Resolver hiccup — inconclusive, leave state untouched and let
            # the next reconcile run retry.
            log.warning(
                "organization_custom_domain.verify.dns_error",
                custom_domain_id=str(custom_domain_id),
                domain=custom_domain.domain,
                error=str(e),
            )
            return
        log.info(
            "organization_custom_domain.verify.checked",
            custom_domain_id=str(custom_domain_id),
            domain=custom_domain.domain,
            status=custom_domain.status,
            cname_ok=result.cname_ok,
            txt_ok=result.txt_ok,
        )


@actor(
    actor_name="organization_custom_domain.provision",
    priority=TaskPriority.LOW,
)
async def custom_domain_provision(domain: str) -> None:
    """Attach an activated domain to the hosting provider (Vercel) so TLS
    certificate issuance starts. No-op when Vercel isn't configured (local
    dev / other hosting). API errors raise so dramatiq retries."""
    if not vercel_domains.is_configured():
        log.info("organization_custom_domain.provision.not_configured", domain=domain)
        return
    await vercel_domains.add_domain(domain)


@actor(
    actor_name="organization_custom_domain.deprovision",
    priority=TaskPriority.LOW,
)
async def custom_domain_deprovision(domain: str) -> None:
    """Detach a removed/replaced domain from the hosting provider."""
    if not vercel_domains.is_configured():
        log.info("organization_custom_domain.deprovision.not_configured", domain=domain)
        return
    await vercel_domains.remove_domain(domain)
