import re
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID

import structlog

from polar.config import settings
from polar.entitlements.service import entitlements as entitlements_service
from polar.exceptions import PolarError
from polar.kit.utils import utc_now
from polar.models import Organization, OrganizationCustomDomain
from polar.models.organization_custom_domain import (
    OrganizationCustomDomainStatus,
    generate_verification_token,
)
from polar.postgres import AsyncReadSession, AsyncSession
from polar.worker import enqueue_job

from . import dns
from .repository import OrganizationCustomDomainRepository
from .schemas import CustomDomainDNSRecord

log: structlog.stdlib.BoundLogger = structlog.get_logger()

VERIFICATION_TXT_PREFIX = "_spaire-verify"

_LABEL_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
_TLD_RE = re.compile(r"^[a-z]{2,63}$")


class CustomDomainError(PolarError): ...


class InvalidDomain(CustomDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=422)


class DomainAlreadyInUse(CustomDomainError):
    def __init__(self, domain: str) -> None:
        super().__init__(
            f"The domain {domain} is already in use by another organization.",
            status_code=409,
        )


class NoDomainConfigured(CustomDomainError):
    def __init__(self) -> None:
        super().__init__(
            "No custom domain is configured for this organization.",
            status_code=404,
        )


@dataclass
class CustomDomainCheckResult:
    custom_domain: OrganizationCustomDomain
    cname_ok: bool
    txt_ok: bool


def _platform_hostnames() -> set[str]:
    """Hostnames (and their registrable parents) creators must not claim."""
    hostnames: set[str] = set()
    for url in (
        settings.FRONTEND_BASE_URL,
        settings.STOREFRONT_BASE_URL,
        settings.BASE_URL,
    ):
        if url:
            hostname = urlparse(url).hostname
            if hostname:
                hostnames.add(hostname.lower())
    for host in (
        settings.BACKOFFICE_HOST,
        settings.CHECKOUT_LINK_HOST,
        settings.CUSTOM_DOMAIN_CNAME_TARGET,
    ):
        if host:
            hostnames.add(host.split(":")[0].lower())
    return hostnames


def _platform_parent_domains() -> set[str]:
    # Registrable parent (last two labels) of every platform hostname —
    # good enough to fence off spairehq.com and its subdomains.
    parents: set[str] = set()
    for hostname in _platform_hostnames():
        labels = hostname.split(".")
        if len(labels) >= 2 and not hostname.replace(".", "").isdigit():
            parents.add(".".join(labels[-2:]))
    return parents


def normalize_and_validate_domain(raw: str) -> str:
    """Normalize a creator-entered domain and enforce v1 constraints:
    a well-formed hostname, a subdomain (not an apex), and not a platform
    domain. Raises InvalidDomain otherwise."""
    domain = raw.strip().lower().rstrip(".")
    if "://" in domain:
        domain = urlparse(domain).hostname or ""
    if not domain or any(c in domain for c in "/@:? \t"):
        raise InvalidDomain(
            "Enter a bare domain name like learn.yourdomain.com — without "
            "https://, paths or ports."
        )
    if len(domain) > 253:
        raise InvalidDomain("Domain name is too long.")

    labels = domain.split(".")
    if any(not _LABEL_RE.match(label) for label in labels):
        raise InvalidDomain(f"{domain} is not a valid domain name.")
    if not _TLD_RE.match(labels[-1]):
        raise InvalidDomain(f"{domain} is not a valid domain name.")
    if len(labels) < 3:
        raise InvalidDomain(
            "Apex domains are not supported yet — use a subdomain like "
            f"learn.{domain} instead."
        )

    parent = ".".join(labels[-2:])
    if domain in _platform_hostnames() or parent in _platform_parent_domains():
        raise InvalidDomain("This domain cannot be used as a custom domain.")

    return domain


class OrganizationCustomDomainService:
    async def get_for_organization(
        self, session: AsyncReadSession, organization_id: UUID
    ) -> OrganizationCustomDomain | None:
        repository = OrganizationCustomDomainRepository.from_session(session)
        return await repository.get_by_organization_id(organization_id)

    async def set_domain(
        self,
        session: AsyncSession,
        organization: Organization,
        raw_domain: str,
    ) -> OrganizationCustomDomain:
        """Set or replace the organization's custom domain. Resets
        verification state and enqueues an immediate DNS check so domains
        with pre-installed records activate without waiting for the cron."""
        await entitlements_service.require_feature(
            session, organization.id, "custom_storefront_domain"
        )

        domain = normalize_and_validate_domain(raw_domain)

        repository = OrganizationCustomDomainRepository.from_session(session)

        existing_by_domain = await repository.get_by_domain(domain)
        if (
            existing_by_domain is not None
            and existing_by_domain.organization_id != organization.id
        ):
            raise DomainAlreadyInUse(domain)

        custom_domain = await repository.get_by_organization_id(organization.id)
        if custom_domain is not None:
            if custom_domain.domain == domain:
                return custom_domain
            # Replacing the domain: detach the old one from the TLS/hosting
            # provider so it stops serving the storefront.
            enqueue_job(
                "organization_custom_domain.deprovision",
                domain=custom_domain.domain,
            )
            custom_domain.domain = domain
            custom_domain.status = OrganizationCustomDomainStatus.pending
            custom_domain.verification_token = generate_verification_token()
            custom_domain.verified_at = None
            custom_domain.last_checked_at = None
            custom_domain.failure_count = 0
            # URL builders fall back to the platform host until the new
            # domain verifies.
            organization.custom_domain = None
            await repository.update(custom_domain, flush=True)
        else:
            custom_domain = await repository.create(
                OrganizationCustomDomain(
                    organization_id=organization.id,
                    domain=domain,
                ),
                flush=True,
            )

        enqueue_job(
            "organization_custom_domain.verify",
            custom_domain_id=custom_domain.id,
        )
        log.info(
            "organization_custom_domain.set",
            organization_id=str(organization.id),
            domain=domain,
        )
        return custom_domain

    async def remove(self, session: AsyncSession, organization_id: UUID) -> None:
        repository = OrganizationCustomDomainRepository.from_session(session)
        custom_domain = await repository.get_by_organization_id(organization_id)
        if custom_domain is None:
            raise NoDomainConfigured()
        enqueue_job(
            "organization_custom_domain.deprovision",
            domain=custom_domain.domain,
        )
        organization = await session.get(Organization, organization_id)
        if organization is not None:
            organization.custom_domain = None
        await repository.hard_delete(custom_domain)
        log.info(
            "organization_custom_domain.removed",
            organization_id=str(organization_id),
            domain=custom_domain.domain,
        )

    async def verify(
        self,
        session: AsyncSession,
        custom_domain: OrganizationCustomDomain,
    ) -> CustomDomainCheckResult:
        """Check the domain's DNS records and update the lifecycle state.

        Raises dns.DNSResolutionError when the lookup itself can't complete
        — the state is left untouched (inconclusive, not failed).
        """
        txt_values = await dns.resolve(
            f"{VERIFICATION_TXT_PREFIX}.{custom_domain.domain}", "TXT"
        )
        txt_ok = custom_domain.verification_token in txt_values

        cname_values = await dns.resolve(custom_domain.domain, "CNAME")
        cname_ok = settings.CUSTOM_DOMAIN_CNAME_TARGET in cname_values

        custom_domain.last_checked_at = utc_now()

        organization = await session.get(Organization, custom_domain.organization_id)

        previous_status = custom_domain.status
        if txt_ok and cname_ok:
            custom_domain.status = OrganizationCustomDomainStatus.active
            custom_domain.failure_count = 0
            if custom_domain.verified_at is None:
                custom_domain.verified_at = utc_now()
            # Keep the denormalized column in sync so URL builders pick the
            # domain up (also self-heals if it ever drifts).
            if organization is not None:
                organization.custom_domain = custom_domain.domain
            if previous_status != OrganizationCustomDomainStatus.active:
                # Attach the domain to the TLS/hosting provider (Vercel)
                # so certificate issuance starts right away.
                enqueue_job(
                    "organization_custom_domain.provision",
                    domain=custom_domain.domain,
                )
                log.info(
                    "organization_custom_domain.activated",
                    organization_id=str(custom_domain.organization_id),
                    domain=custom_domain.domain,
                )
        elif previous_status != OrganizationCustomDomainStatus.pending:
            # Was active (or already failed): count consecutive misses and
            # demote once past the threshold, so a transient DNS wobble
            # doesn't take a live storefront down.
            custom_domain.failure_count += 1
            if custom_domain.failure_count >= settings.CUSTOM_DOMAIN_FAILURE_THRESHOLD:
                if custom_domain.status != OrganizationCustomDomainStatus.failed:
                    log.warning(
                        "organization_custom_domain.demoted",
                        organization_id=str(custom_domain.organization_id),
                        domain=custom_domain.domain,
                        failure_count=custom_domain.failure_count,
                    )
                custom_domain.status = OrganizationCustomDomainStatus.failed
                # Fall back to platform-host URLs while the domain is down.
                if (
                    organization is not None
                    and organization.custom_domain == custom_domain.domain
                ):
                    organization.custom_domain = None

        return CustomDomainCheckResult(
            custom_domain=custom_domain, cname_ok=cname_ok, txt_ok=txt_ok
        )

    def get_dns_records(
        self, custom_domain: OrganizationCustomDomain
    ) -> list[CustomDomainDNSRecord]:
        return [
            CustomDomainDNSRecord(
                type="CNAME",
                name=custom_domain.domain,
                value=settings.CUSTOM_DOMAIN_CNAME_TARGET,
            ),
            CustomDomainDNSRecord(
                type="TXT",
                name=f"{VERIFICATION_TXT_PREFIX}.{custom_domain.domain}",
                value=custom_domain.verification_token,
            ),
        ]


organization_custom_domain = OrganizationCustomDomainService()
