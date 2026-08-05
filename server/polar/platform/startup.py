"""Startup verification for Spaire-on-Spaire billing.

When SPAIRE_PLATFORM_ORG_ID is set, the API requires the three tier
products (starter, studio, scale) and the four overage meters to exist on
the platform org. Without them:

  - organization.created actor can't start the new org on a Starter trial
    (TierProductMissing), leaving them with no platform subscription.
  - EntitlementsService resolves those orgs to "inactive" (no access), so
    legitimate new signups would be blocked until ops notices.

This module surfaces that failure mode at boot time. Run
`uv run task seed_platform_products` before starting the API on any
environment where PLATFORM_ORG_ID is set.

Single-tenant / development setups (PLATFORM_ORG_ID unset) skip the
check.
"""

import structlog

from polar.entitlements.tiers import TierKey
from polar.kit.db.postgres import AsyncSession
from polar.platform.repository import platform_product_repository
from polar.platform.service import (
    PlatformError,
)
from polar.platform.service import (
    platform as platform_service,
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()


class PlatformStartupError(Exception):
    """Raised at API startup when the platform-org configuration is
    incomplete. The traceback message lists the missing prerequisites
    so the operator knows exactly what to run."""


_REQUIRED_TIERS = (TierKey.starter, TierKey.studio, TierKey.scale)

# Every shipped tier carries a 14-day trial configuration on its Product row.
_TRIAL_REQUIRED_TIERS = (TierKey.starter, TierKey.studio, TierKey.scale)


async def verify_platform_setup(session: AsyncSession) -> None:
    """Block boot if PLATFORM_ORG_ID is set but the seed hasn't been
    run. No-op when PLATFORM_ORG_ID is unset (development / single-
    tenant).
    """
    if not platform_service.is_configured():
        log.info("platform.startup.not_configured")
        return

    try:
        platform_org = await platform_service.get(session)
    except PlatformError as exc:
        raise PlatformStartupError(
            f"SPAIRE_PLATFORM_ORG_ID is set but the organization does not "
            f"exist. {exc.message}"
        ) from exc

    product_repo = platform_product_repository(session)
    missing_tiers: list[str] = []
    missing_trial_tiers: list[str] = []
    missing_annual_tiers: list[str] = []

    for tier in _REQUIRED_TIERS:
        monthly = await product_repo.get_by_tier_and_interval(
            platform_org.id, tier.value, "month"
        )
        if monthly is None:
            missing_tiers.append(f"{tier.value} (monthly)")
            continue
        if tier in _TRIAL_REQUIRED_TIERS:
            if (
                monthly.trial_interval is None
                or monthly.trial_interval_count is None
            ):
                missing_trial_tiers.append(f"{tier.value} (monthly)")
            annual = await product_repo.get_by_tier_and_interval(
                platform_org.id, tier.value, "year"
            )
            if annual is None:
                missing_annual_tiers.append(tier.value)
            elif (
                annual.trial_interval is None
                or annual.trial_interval_count is None
            ):
                missing_trial_tiers.append(f"{tier.value} (annual)")

    # A seeding gap degrades NEW-signup provisioning — it must not crash the
    # whole API and take down payments, portals, courses, and existing
    # customers. So we log each problem loudly (so ops sees exactly what to
    # run) and keep booting. Re-run `uv run task seed_platform_products` to
    # clear these. Previously these raised PlatformStartupError, which turned
    # a missing product into a full production outage / crash-loop.
    degraded = False
    if missing_tiers:
        degraded = True
        log.error(
            "platform.startup.missing_tier_products",
            platform_org_slug=platform_org.slug,
            missing=missing_tiers,
            remediation="uv run task seed_platform_products",
            impact="New signups can't start a trial and resolve to 'inactive'.",
        )

    if missing_annual_tiers:
        degraded = True
        log.error(
            "platform.startup.missing_annual_products",
            platform_org_slug=platform_org.slug,
            missing=missing_annual_tiers,
            remediation="uv run task seed_platform_products",
            impact="The annual billing toggle has no Products to point at.",
        )

    if missing_trial_tiers:
        degraded = True
        log.error(
            "platform.startup.missing_trial_config",
            platform_org_slug=platform_org.slug,
            missing=missing_trial_tiers,
            remediation="uv run task seed_platform_products",
            impact="New orgs get active (non-trial) Starter for $0 indefinitely.",
        )

    if not degraded:
        log.info(
            "platform.startup.ok",
            platform_org_id=str(platform_org.id),
            tiers=[t.value for t in _REQUIRED_TIERS],
        )
