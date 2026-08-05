"""Server-side helper that creates an upgrade checkout for a creator
organization on Spaire's own platform-org products.

Used by polar.platform.endpoints.POST .../upgrade-checkout. Constructs
an internal AuthSubject scoped to the platform organization so the
existing checkout creation path's auth validation passes — the platform
org owns the product, so it's authorized to sell it.
"""

import re
from datetime import datetime, timedelta
from math import ceil
from typing import Literal

import structlog

from polar.auth.models import AuthSubject
from polar.auth.scope import Scope
from polar.checkout.schemas import CheckoutProductCreate
from polar.checkout.service import checkout as checkout_service
from polar.customer.repository import CustomerRepository
from polar.entitlements.tiers import TierKey
from polar.exceptions import PolarError
from polar.kit.trial import TrialInterval
from polar.kit.utils import utc_now
from polar.locker import Locker
from polar.models import Checkout, Customer, Organization
from polar.models.subscription import SubscriptionStatus
from polar.platform.billing import platform_billing
from polar.platform.repository import (
    platform_customer_repository,
    platform_product_repository,
    platform_subscription_repository,
)
from polar.platform.service import platform as platform_service
from polar.postgres import AsyncSession

log: structlog.stdlib.BoundLogger = structlog.get_logger()


_UPGRADEABLE_TIERS = (TierKey.starter, TierKey.studio, TierKey.scale)


class PlatformUpgradeError(PolarError): ...


class TierNotUpgradeable(PlatformUpgradeError):
    def __init__(self, tier: TierKey) -> None:
        super().__init__(
            f"Tier '{tier.value}' is not a valid upgrade target. "
            "Use 'starter', 'studio', or 'scale'.",
            400,
        )


class PlatformOrgNotConfigured(PlatformUpgradeError):
    def __init__(self) -> None:
        super().__init__(
            "Spaire platform billing is not configured on this server.",
            503,
        )


class TierProductNotFound(PlatformUpgradeError):
    def __init__(self, tier: TierKey) -> None:
        super().__init__(
            f"Spaire {tier.value.capitalize()} product is not available. "
            "Contact support.",
            503,
        )


class AlreadyOnPaidTier(PlatformUpgradeError):
    def __init__(self) -> None:
        super().__init__(
            "Your organization is already on a paid Spaire plan. Use the "
            "subscription management flow to switch plans.",
            409,
        )


class MissingPlatformCustomer(PlatformUpgradeError):
    def __init__(self) -> None:
        super().__init__(
            "Your organization has not been provisioned on Spaire billing yet. "
            "Try again in a moment.",
            503,
        )


def _plus_tagged_email(email: str, tag: str) -> str | None:
    """Build a sub-addressed variant of `email`: ``name@domain`` + tag ->
    ``name+tag@domain``.

    Sub-addressing (RFC 5233) routes to the same mailbox at Gmail, Outlook,
    Yahoo, iCloud, Fastmail, Proton and most other providers, while staying
    a distinct address — so two orgs owned by one person can each carry a
    deliverable billing email under the platform org's
    unique-(org, email) constraint. We route to the BASE mailbox by
    dropping any existing ``+tag`` rather than stacking tags.

    Returns None when `email` isn't a parseable address or `tag` yields no
    usable characters.
    """
    local, sep, domain = email.partition("@")
    if not sep or not local or not domain:
        return None
    base_local = local.split("+", 1)[0]
    if not base_local:
        return None
    safe_tag = re.sub(r"[^a-z0-9]+", "-", tag.lower()).strip("-")
    if not safe_tag:
        return None
    # Local-part max is 64 chars (RFC 5321); keep room for base + "+".
    max_tag = max(1, 64 - len(base_local) - 1)
    safe_tag = safe_tag[:max_tag].strip("-") or safe_tag[:max_tag]
    return f"{base_local}+{safe_tag}@{domain}"


class PlatformUpgradeService:
    async def _apply_real_billing_email(
        self,
        session: AsyncSession,
        customer: Customer,
        organization: Organization,
        real_email: str | None,
    ) -> None:
        """Set the platform Customer's email to the creator's real address
        so Stripe receipts / tax invoices are deliverable.

        The platform `customers` table is unique on (organization_id,
        lower(email)). A single person who owns several Spaire orgs has one
        platform Customer per org; if they all share one real email, only
        the first can hold it verbatim. On that collision we do NOT fall
        back to the undeliverable `@billing.spairehq.internal` placeholder —
        we adopt a plus-addressed variant (`name+{slug}@domain`) that routes
        to the same inbox at every major provider (RFC 5233 sub-addressing)
        but stays unique, so receipts still reach the creator for every org
        they own.
        """
        if real_email is None:
            return
        if customer.email.lower() == real_email.lower():
            return

        customer_repository = CustomerRepository.from_session(session)

        # Preferred: the real email verbatim (the common single-org case).
        if not await self._billing_email_taken(
            customer_repository, customer, real_email
        ):
            customer.email = real_email
            await session.flush()
            return

        # Collision: another of this person's orgs already holds the real
        # email. Adopt a deliverable plus-addressed variant rather than
        # leaving the dead placeholder. The org slug is globally unique, so
        # the tagged address can't collide in turn.
        tagged = _plus_tagged_email(real_email, organization.slug)
        if tagged is not None and tagged.lower() == customer.email.lower():
            return  # already holding the tagged variant — deliverable, done
        if tagged is not None and not await self._billing_email_taken(
            customer_repository, customer, tagged
        ):
            customer.email = tagged
            await session.flush()
            return

        # Last resort: slug-tagged variant also unusable (unparseable email
        # or, improbably, taken too). Tag with the org id's first 8 hex
        # chars, which cannot collide with any human-chosen tag. If even
        # that fails, log loudly — the customer would otherwise silently
        # keep an undeliverable placeholder and be charged with no receipt.
        fallback = _plus_tagged_email(real_email, organization.id.hex[:8])
        if (
            fallback is not None
            and fallback.lower() != customer.email.lower()
            and not await self._billing_email_taken(
                customer_repository, customer, fallback
            )
        ):
            customer.email = fallback
            await session.flush()
            return

        log.error(
            "platform.upgrade.billing_email_unresolvable",
            organization_id=str(organization.id),
            customer_id=str(customer.id),
            attempted_email=real_email,
        )

    async def _billing_email_taken(
        self,
        customer_repository: CustomerRepository,
        customer: Customer,
        email: str,
    ) -> bool:
        """True when another platform Customer in the same org already holds
        `email` (case-insensitive). The active customer holding it is not a
        collision."""
        existing = await customer_repository.get_by_email_and_organization(
            email, customer.organization_id
        )
        return existing is not None and existing.id != customer.id

    async def create_checkout(
        self,
        session: AsyncSession,
        locker: Locker | None = None,
        *,
        organization: Organization,
        tier: TierKey,
        billing_interval: Literal["month", "year"] = "month",
        success_url: str | None = None,
        billing_email: str | None = None,
    ) -> Checkout:
        """Create the upgrade checkout. When a `locker` is provided the
        whole read-decide-create sequence runs under a per-organization
        lock, so a double-clicked upgrade button can't race two checkouts
        through the trial/no-trial decision at once."""
        if locker is not None:
            async with locker.lock(
                f"platform:upgrade_checkout:{organization.id}",
                timeout=10.0,
                blocking_timeout=1.0,
            ):
                return await self._create_checkout(
                    session,
                    organization=organization,
                    tier=tier,
                    billing_interval=billing_interval,
                    success_url=success_url,
                    billing_email=billing_email,
                )
        return await self._create_checkout(
            session,
            organization=organization,
            tier=tier,
            billing_interval=billing_interval,
            success_url=success_url,
            billing_email=billing_email,
        )

    async def _create_checkout(
        self,
        session: AsyncSession,
        *,
        organization: Organization,
        tier: TierKey,
        billing_interval: Literal["month", "year"] = "month",
        success_url: str | None = None,
        billing_email: str | None = None,
    ) -> Checkout:
        if tier not in _UPGRADEABLE_TIERS:
            raise TierNotUpgradeable(tier)

        if not platform_service.is_configured():
            raise PlatformOrgNotConfigured()
        platform_org = await platform_service.get(session)

        if organization.id == platform_org.id:
            # Defensive — the platform org cannot upgrade itself.
            raise TierNotUpgradeable(tier)

        # Find the target tier's product for the chosen billing interval.
        product_repo = platform_product_repository(session)
        target_product = await product_repo.get_by_tier_and_interval(
            platform_org.id, tier.value, billing_interval
        )
        if target_product is None:
            raise TierProductNotFound(tier)

        # Find the creator's existing platform-org customer record.
        # The org-creation hook creates this synchronously now (no trial
        # sub, just the Customer row), but a creator hitting this
        # endpoint on a not-yet-processed actor still needs to be
        # rescued — so we bootstrap inline as a safety net.
        customer_repo = platform_customer_repository(session)
        customer = await customer_repo.get_for_creator_org(
            platform_org.id, organization.id
        )
        if customer is None:
            await platform_billing.ensure_platform_customer(session, organization)
            customer = await customer_repo.get_for_creator_org(
                platform_org.id, organization.id
            )
        if customer is None:
            raise MissingPlatformCustomer()

        # Put the creator's real email on the platform Customer (when it
        # doesn't collide with another of their orgs) so Stripe receipts
        # and tax invoices reach a real inbox instead of the synthetic
        # `creator-{slug}@billing.spairehq.internal` placeholder.
        await self._apply_real_billing_email(
            session, customer, organization, billing_email
        )

        # Resolve the creator's current active platform subscription to
        # decide how the checkout should treat it.
        #
        #   - Trialing: carry the REMAINING trial days onto the paid
        #     subscription and leave the trial live. It is NOT revoked
        #     here — payment must succeed first, after which
        #     maybe_supersede_platform_trial revokes it. If the creator
        #     abandons checkout, the trial is untouched and they keep
        #     their remaining days. Polar's checkout uniqueness check is
        #     satisfied because the platform org runs with
        #     allow_multiple_subscriptions enabled.
        #   - past_due (dunning window): allowed through, billed
        #     immediately, no trial — a delinquent creator settling up
        #     must never be blocked from paying. Supersede-on-success
        #     revokes the past_due sub and stops its dunning.
        #   - Active on a paid tier: not an upgrade-checkout operation
        #     (use switch-plan instead).
        subscription_repo = platform_subscription_repository(session)
        existing_sub = await subscription_repo.get_active_for_customer(customer.id)

        carryover_trial_end: datetime | None = None
        grant_fresh_trial = False
        bill_immediately = False
        if existing_sub is not None:
            if existing_sub.trialing:
                # Mid-trial tier switch: carry the remaining days, don't
                # restart the clock.
                carryover_trial_end = existing_sub.trial_end
            elif existing_sub.status == SubscriptionStatus.past_due:
                # Delinquent creator who WANTS to pay again: let them.
                # Blocking with "already on a paid plan" wedged past_due
                # creators out of ever re-paying. No trial — billed
                # immediately; on payment success the supersede hook
                # revokes the past_due sub, which also halts its dunning
                # retries.
                bill_immediately = True
            else:
                # Active (non-trialing) on a paid tier — same tier or a
                # different one both route through switch-plan, not here.
                raise AlreadyOnPaidTier()
        else:
            # No active plan. A FIRST-TIME creator (never trialed) gets the
            # card-required 14-day trial: the checkout captures their card
            # via a setup intent and billing starts at day 14. A creator who
            # has ALREADY used their trial (churned / lapsed) is charged
            # immediately — no second free trial, which closes the
            # cancel-then-re-subscribe-for-a-fresh-trial abuse loop.
            trial_consumed = bool(
                (customer.user_metadata or {}).get("trial_consumed_at")
            )
            grant_fresh_trial = not trial_consumed

        # Use model_validate so pydantic coerces success_url (a plain str)
        # into the HttpUrl-shaped SuccessUrl type the schema requires.
        checkout_payload: dict[str, object] = {
            "product_id": target_product.id,
            "customer_id": customer.id,
            "success_url": success_url,
        }

        now = utc_now()
        if bill_immediately:
            # past_due re-subscribe: no trial under any circumstances.
            checkout_payload["allow_trial"] = False
        elif carryover_trial_end is not None and carryover_trial_end > now:
            # Grant only the days remaining on the original trial, not a
            # fresh 14. Round up to whole days; clamp to the schema's 1..1000.
            remaining_days = ceil((carryover_trial_end - now) / timedelta(days=1))
            remaining_days = max(1, min(remaining_days, 1000))
            checkout_payload["trial_interval"] = TrialInterval.day
            checkout_payload["trial_interval_count"] = remaining_days
        elif grant_fresh_trial:
            # First-time: leave the trial config to the product (its 14-day
            # trial). allow_trial defaults True and we don't override the
            # interval, so the checkout does a card-capturing setup intent
            # (no immediate charge) and starts the 14-day trial.
            pass
        else:
            # Churned / already trialed: no trial, bill immediately.
            checkout_payload["allow_trial"] = False

        if billing_email is not None:
            # Also prefill the checkout form with the real email.
            checkout_payload["customer_email"] = billing_email
        checkout_create = CheckoutProductCreate.model_validate(checkout_payload)

        # Construct an AuthSubject scoped to the platform org so the
        # checkout's auth-aware product lookup succeeds. The platform
        # org is the seller of the Pro/Scale product, so this is the
        # accurate authorization context.
        platform_auth_subject: AuthSubject[Organization] = AuthSubject(
            subject=platform_org,
            scopes={
                Scope.web_write,
                Scope.checkouts_write,
                Scope.checkouts_read,
            },
            session=None,
        )

        checkout = await checkout_service.create(
            session, checkout_create, platform_auth_subject
        )

        log.info(
            "platform.upgrade_checkout.created",
            organization_id=str(organization.id),
            tier=tier.value,
            billing_interval=billing_interval,
            checkout_id=str(checkout.id),
            carried_trial=carryover_trial_end is not None and carryover_trial_end > now,
        )
        return checkout


platform_upgrade = PlatformUpgradeService()
