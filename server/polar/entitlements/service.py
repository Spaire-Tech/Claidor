"""Resolve a creator organization's active Spaire subscription tier and
return the entitlements (transaction fee, limits, feature flags) for it.

Every downstream consumer that needs to gate behavior on a tier reads from
this service. The static tier definitions live in `tiers.py`.

Resolution path:
1. If no platform org is configured, return the legacy entitlements
   (unlimited / global default fee). This preserves single-tenant and
   development-mode behavior.
2. If the org being queried IS the platform org itself, return legacy.
   The platform org is the seller, not a buyer.
3. Look up the Customer record on the platform org whose
   user_metadata.creator_org_id == <organization_id>.
4. Find that Customer's most recent active or trialing Subscription.
5. Read the Product's user_metadata.tier to determine the tier.
6. Any miss along the way returns legacy entitlements.
"""

from uuid import UUID

from polar.models import Product
from polar.platform.repository import (
    platform_customer_repository,
    platform_subscription_repository,
)
from polar.platform.service import platform as platform_service
from polar.postgres import AsyncReadSession

from .exceptions import FeatureNotInPlanError, TierLimitReachedError
from .tiers import (
    PAID_TIERS,
    TierEntitlements,
    TierKey,
    get_definition,
    tier_from_value,
)


class EntitlementsService:
    async def get_for_organization(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
    ) -> TierEntitlements:
        tier = await self.get_tier(session, organization_id)
        return get_definition(tier)

    async def get_tier(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
    ) -> TierKey:
        # Platform billing isn't in play (dev / single-tenant / self-host) →
        # unlimited. Same for the platform org resolving itself.
        if not platform_service.is_configured():
            return TierKey.unmanaged

        if platform_service.is_platform_organization(organization_id):
            return TierKey.unmanaged

        platform_org_id = platform_service.get_id()

        # From here on this is a real creator on a configured platform. Any
        # miss means "no active plan" -> inactive (restrictive), NOT unlimited.
        # There is no free fallback.
        customer_repo = platform_customer_repository(session)
        customer = await customer_repo.get_for_creator_org(
            platform_org_id, organization_id
        )
        if customer is None:
            return TierKey.inactive

        subscription_repo = platform_subscription_repository(session)
        subscription = await subscription_repo.get_active_for_customer(
            customer.id
        )
        if subscription is None:
            return TierKey.inactive

        product: Product | None = subscription.product
        if product is None:
            return TierKey.inactive

        tier_value = (product.user_metadata or {}).get("tier")
        if not isinstance(tier_value, str):
            return TierKey.inactive

        # Honor the "pro" -> "starter" alias so a creator whose platform
        # product still carries the original "pro" metadata resolves to
        # Starter rather than dropping to inactive. Only the three paid tiers
        # are valid here; anything else is treated as no plan.
        tier = tier_from_value(tier_value)
        if tier not in PAID_TIERS:
            return TierKey.inactive
        return tier

    # ------------------------------------------------------------------
    # Guards — call-site helpers that check and raise.
    # ------------------------------------------------------------------

    async def require_feature(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        feature: str,
    ) -> None:
        """Raise FeatureNotInPlanError if the org's tier doesn't include
        `feature`. The feature name must match a boolean field on
        TierFeatures (see polar/entitlements/tiers.py).
        """
        entitlements_dataclass = await self.get_for_organization(
            session, organization_id
        )
        try:
            allowed = getattr(entitlements_dataclass.features, feature)
        except AttributeError as exc:
            raise ValueError(f"Unknown feature: {feature}") from exc
        if not allowed:
            raise FeatureNotInPlanError(feature, entitlements_dataclass.tier)

    async def require_under_limit(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        key: str,
        current: int,
    ) -> None:
        """Raise TierLimitReachedError if creating one more resource would
        push past the tier's limit. `current` is the count BEFORE the
        proposed insert, so the comparison is `current >= limit`.

        Returns silently when the tier sets the limit to None (unlimited).
        The limit name must match an integer-or-None field on TierLimits.
        """
        entitlements_dataclass = await self.get_for_organization(
            session, organization_id
        )
        try:
            limit = getattr(entitlements_dataclass.limits, key)
        except AttributeError as exc:
            raise ValueError(f"Unknown limit: {key}") from exc
        if limit is None:
            return
        if current >= limit:
            raise TierLimitReachedError(key, limit, entitlements_dataclass.tier)


entitlements = EntitlementsService()
