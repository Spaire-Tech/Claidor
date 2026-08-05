"""Dashboard-facing endpoints for Spaire's own platform billing.

GET  /v1/platform/plans
    Lists Pro/Studio/Scale with their pricing and entitlements.

GET  /v1/platform/organizations/{organization_id}/subscription
    Current Spaire subscription state for a creator org plus the
    resolved entitlements.

POST /v1/platform/organizations/{organization_id}/upgrade-checkout
    Starts a Polar checkout for the target Pro/Studio/Scale tier.
    Returns a URL the creator visits to enter their card and complete
    the upgrade.
"""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import Depends
from pydantic import UUID4
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from polar.auth.models import AuthSubject, is_user
from polar.customer.repository import CustomerRepository
from polar.customer_portal.schemas.customer import (
    CustomerPaymentMethod,
    CustomerPaymentMethodTypeAdapter,
    CustomerPortalCustomerUpdate,
)
from polar.customer_portal.service.customer import (
    customer as customer_portal_customer_service,
)
from polar.customer_portal.service.order import (
    customer_order as customer_order_service,
)
from polar.customer_session.service import (
    customer_session as customer_session_service,
)
from polar.entitlements.schemas import Entitlements
from polar.entitlements.service import entitlements as entitlements_service
from polar.entitlements.tiers import TierKey, get_definition
from polar.enums import SubscriptionRecurringInterval
from polar.exceptions import ResourceNotFound
from polar.integrations.resend import domains as resend_domains
from polar.integrations.stripe.service import stripe as stripe_service
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.kit.trial import TrialInterval
from polar.kit.utils import utc_now
from polar.locker import Locker, get_locker
from polar.models import (
    Customer,
    Order,
    Organization,
    PaymentMethod,
    Product,
    Subscription,
    User,
)
from polar.models.product_price import ProductPriceFixed
from polar.models.subscription import SubscriptionStatus
from polar.openapi import APITag
from polar.organization.repository import OrganizationRepository
from polar.organization.schemas import OrganizationID
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.quotas.definitions import QuotaKey
from polar.quotas.schemas import OrganizationUsage
from polar.quotas.schemas import QuotaUsage as QuotaUsageSchema
from polar.quotas.service import quotas as quotas_service
from polar.routing import APIRouter
from polar.subscription.repository import SubscriptionRepository
from polar.subscription.schemas import Subscription as SubscriptionSchema

from . import auth
from .contacts import resolve_billing_contact_email
from .management import platform_management
from .repository import (
    platform_customer_repository,
    platform_product_repository,
    platform_subscription_repository,
)
from .schemas import (
    CancelSpaireSubscription,
    CurrentSpaireSubscription,
    CustomerPortalSession,
    CustomerPortalSessionCreate,
    EmailSenderDomainStatus,
    PlatformBillingDetails,
    PlatformBillingDetailsUpdate,
    PlatformOrder,
    PlatformOrderInvoice,
    SwitchPlan,
    TierPlan,
    TierPlanList,
    UpgradeCheckout,
    UpgradeCheckoutCreate,
)
from .service import platform as platform_service
from .upgrade import platform_upgrade

log: structlog.stdlib.BoundLogger = structlog.get_logger()

router = APIRouter(prefix="/platform", tags=["platform", APITag.private])


_PLAN_TIERS = (TierKey.starter, TierKey.studio, TierKey.scale)
_TIER_NAMES = {
    TierKey.starter: "Spaire Starter",
    TierKey.studio: "Spaire Studio",
    TierKey.scale: "Spaire Scale",
}


def _trial_days_from_product(product: Product | None) -> int | None:
    """Resolve trial length from the seeded Product row. Source of truth
    is `seed_platform_products.PRODUCT_SPECS[*].trial`; the frontend
    surfaces this number on the upgrade modal cards.

    Only `day`-interval trials are translated to a days integer (every
    spec uses `day` today). Other intervals or unset trial config
    return None.
    """
    if product is None:
        return None
    if product.trial_interval is None or product.trial_interval_count is None:
        return None
    if product.trial_interval == TrialInterval.day:
        return product.trial_interval_count
    return None


def _annual_price_cents(annual_product: Product | None) -> int | None:
    """Pull the actual yearly amount off the annual Product's catalog
    price row. Returns None when annual hasn't been seeded so the
    frontend can hide the annual toggle for that tier."""
    if annual_product is None:
        return None
    for price in annual_product.prices:
        if isinstance(price, ProductPriceFixed) and not price.is_archived:
            return price.price_amount
    return None


def _annual_savings_percent(
    monthly_price_cents: int, annual_price_cents: int | None
) -> int:
    """Compute the real annual-vs-monthly discount from the seeded prices
    instead of hardcoding a marketing number that can drift from reality.
    Falls back to the nominal 20 when annual pricing isn't seeded."""
    if annual_price_cents is None or monthly_price_cents <= 0:
        return 20
    full_year = monthly_price_cents * 12
    if full_year <= 0 or annual_price_cents >= full_year:
        return 0
    return round((full_year - annual_price_cents) / full_year * 100)


async def _plan_for_tier(
    session: AsyncReadSession, platform_org_id: UUID | None, tier: TierKey
) -> TierPlan:
    definition = get_definition(tier)
    monthly_product: Product | None = None
    annual_product: Product | None = None
    if platform_org_id is not None:
        product_repo = platform_product_repository(session)
        monthly_product = await product_repo.get_by_tier_and_interval(
            platform_org_id, tier.value, "month"
        )
        annual_product = await product_repo.get_by_tier_and_interval(
            platform_org_id, tier.value, "year"
        )
    return TierPlan(
        tier=tier,
        name=_TIER_NAMES[tier],
        description=None,
        product_id=monthly_product.id if monthly_product is not None else None,
        annual_product_id=annual_product.id if annual_product is not None else None,
        monthly_price_cents=definition.monthly_price_cents,
        annual_price_cents=_annual_price_cents(annual_product),
        annual_savings_percent=_annual_savings_percent(
            definition.monthly_price_cents, _annual_price_cents(annual_product)
        ),
        trial_days=_trial_days_from_product(monthly_product),
        transaction_fee=Entitlements.from_dataclass(definition).transaction_fee,
        features=Entitlements.from_dataclass(definition).features,
        limits=Entitlements.from_dataclass(definition).limits,
    )


@router.get(
    "/plans",
    summary="List Spaire Plans",
    response_model=TierPlanList,
)
async def list_plans(
    auth_subject: auth.PlatformRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> TierPlanList:
    """Return the three subscribable Spaire plans (Pro, Studio, Scale)
    with their list pricing, trial config, and entitlements.

    Used by the dashboard to render the upgrade modal.
    """
    _ = auth_subject  # auth is for access gating only
    platform_org_id: UUID | None = None
    if platform_service.is_configured():
        platform_org_id = platform_service.get_id()
    items = [
        await _plan_for_tier(session, platform_org_id, tier) for tier in _PLAN_TIERS
    ]
    return TierPlanList(items=items)


@router.get(
    "/organizations/{organization_id}/subscription",
    summary="Get Current Spaire Subscription",
    response_model=CurrentSpaireSubscription,
)
async def get_subscription(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CurrentSpaireSubscription:
    """Return the creator org's current Spaire subscription state."""
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    entitlements_dataclass = await entitlements_service.get_for_organization(
        session, organization.id
    )

    status_label = "none"
    monthly_price_cents = entitlements_dataclass.monthly_price_cents
    currency = "usd"
    current_period_end: datetime | None = None
    trial_end: datetime | None = None
    cancel_at_period_end = False
    billing_interval: str | None = None
    is_default_trial = False
    past_due_at: datetime | None = None
    suspension_at: datetime | None = None

    if platform_service.is_configured():
        platform_org_id = platform_service.get_id()
        customer_repo = platform_customer_repository(session)
        customer = await customer_repo.get_for_creator_org(
            platform_org_id, organization.id
        )
        if customer is not None:
            subscription_repo = platform_subscription_repository(session)
            subscription = await subscription_repo.get_active_for_customer(customer.id)
            if subscription is not None:
                status_label = subscription.status.value
                currency = subscription.currency
                # `amount` on the subscription row is the per-period
                # amount (monthly for month subs, yearly for year subs).
                # Normalize to a monthly figure for the dashboard so the
                # "Recurring monthly cost" copy stays accurate even on
                # annual plans.
                if (
                    subscription.recurring_interval
                    == SubscriptionRecurringInterval.year
                ):
                    billing_interval = "year"
                    # Round to the nearest cent instead of truncating —
                    # $470/yr must not display as $39.16 when marketing
                    # says $39.17 (or vice versa).
                    monthly_price_cents = round(subscription.amount / 12)
                else:
                    billing_interval = "month"
                    monthly_price_cents = subscription.amount
                current_period_end = subscription.current_period_end
                # Only surface trial_end while actually trialing — the
                # column keeps its historical value after conversion, and
                # the schema documents this field as "if currently
                # trialing". A stale date here re-lights trial banners.
                if subscription.status == SubscriptionStatus.trialing:
                    trial_end = subscription.trial_end
                cancel_at_period_end = subscription.cancel_at_period_end
                # Surface the dunning state so the dashboard can show a
                # "payment failed, pay by {date}" banner. past_due_deadline
                # is past_due_at + the dunning retry window; after it, the
                # sub is canceled and the org drops to `inactive`.
                if subscription.status == SubscriptionStatus.past_due:
                    past_due_at = subscription.past_due_at
                    suspension_at = subscription.past_due_deadline
                # The org-creation hook stamps managed_by=trial on the
                # auto-attached Pro trial. After the creator goes
                # through upgrade-checkout, Polar creates a new
                # subscription on the chosen tier and that becomes the
                # most-recent active sub — it carries no managed_by, so
                # is_default_trial flips False. The onboarding review
                # page reads this to verify a Stripe checkout actually
                # completed when it sees ?upgraded=1.
                managed_by = (subscription.user_metadata or {}).get("managed_by")
                is_default_trial = managed_by == "trial"

    return CurrentSpaireSubscription(
        tier=entitlements_dataclass.tier,
        billing_interval=billing_interval,  # type: ignore[arg-type]
        status=status_label,
        monthly_price_cents=monthly_price_cents,
        currency=currency,
        current_period_end=current_period_end,
        trial_end=trial_end,
        cancel_at_period_end=cancel_at_period_end,
        past_due_at=past_due_at,
        suspension_at=suspension_at,
        is_default_trial=is_default_trial,
        entitlements=Entitlements.from_dataclass(entitlements_dataclass),
    )


@router.get(
    "/organizations/{organization_id}/usage",
    summary="Get Quota Usage",
    response_model=OrganizationUsage,
)
async def get_usage(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> OrganizationUsage:
    """Current usage and tier-defined limit for every gated quota.

    Returns one entry per QuotaKey (video hours, video views, storage).
    Unlimited quotas surface as ``limit: null`` and ``remaining: null``.
    Used by the dashboard's "Usage" widget and helpful for backoffice
    debugging.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    usage_map = await quotas_service.get_all_usage(session, organization.id)
    items = [QuotaUsageSchema.from_dataclass(usage_map[k]) for k in QuotaKey]
    return OrganizationUsage(items=items)


@router.post(
    "/organizations/{organization_id}/upgrade-checkout",
    summary="Create Upgrade Checkout",
    response_model=UpgradeCheckout,
    status_code=201,
)
async def create_upgrade_checkout(
    organization_id: OrganizationID,
    body: UpgradeCheckoutCreate,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
    locker: Locker = Depends(get_locker),
) -> UpgradeCheckout:
    """Create a Polar checkout for the target Pro/Scale tier on the
    Spaire platform org. Returns a URL the creator visits to enter their
    card and complete the upgrade.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    # Resolve the billing email to stamp onto the platform customer.
    # Prefer an explicit value from the request; otherwise fall back to
    # the calling user's email; otherwise (organization tokens) resolve a
    # real member of the org. This must never stay None: the platform
    # Customer otherwise keeps its synthetic
    # `creator-{slug}@billing.spairehq.internal` placeholder and every
    # receipt, invoice, and dunning email for real charges goes to an
    # undeliverable address.
    billing_email = body.billing_email
    if billing_email is None and is_user(auth_subject):
        billing_email = auth_subject.subject.email
    if billing_email is None:
        billing_email = await resolve_billing_contact_email(session, organization)
    if billing_email is None:
        log.warning(
            "platform.upgrade_checkout.no_billing_email",
            organization_id=str(organization.id),
        )

    checkout = await platform_upgrade.create_checkout(
        session,
        locker,
        organization=organization,
        tier=body.tier,
        billing_interval=body.billing_interval,
        success_url=body.success_url,
        billing_email=billing_email,
    )

    return UpgradeCheckout(
        checkout_id=checkout.id,
        checkout_url=checkout.url,
        client_secret=checkout.client_secret,
    )


async def _serialize_subscription(
    session: AsyncSession, subscription: Subscription
) -> SubscriptionSchema:
    """Reload `subscription` with the relationships SubscriptionSchema
    serializes — customer, product (+ medias, custom fields, organization),
    and meters — which are all lazy="raise". The platform management methods
    return a bare Subscription, so serializing it directly raises and the
    endpoint 500s; reloading with the canonical eager options (the same ones
    the regular /subscriptions endpoints use) is what makes serialization
    work.
    """
    repository = SubscriptionRepository.from_session(session)
    statement = (
        repository.get_base_statement()
        .where(Subscription.id == subscription.id)
        .options(*repository.get_eager_options())
    )
    loaded = await repository.get_one_or_none(statement)
    return SubscriptionSchema.model_validate(loaded)


@router.post(
    "/organizations/{organization_id}/switch-plan",
    summary="Switch Spaire Plan",
    response_model=SubscriptionSchema,
)
async def switch_plan(
    organization_id: OrganizationID,
    body: SwitchPlan,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
    locker: Locker = Depends(get_locker),
) -> SubscriptionSchema:
    """Switch a creator's current Spaire subscription from one paid tier
    to another (Starter <-> Studio <-> Scale). The card on file is reused;
    proration is invoiced immediately. Use the upgrade-checkout endpoint
    to convert a trialing subscription or start a new one, and the cancel
    endpoint to end the paid subscription.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    subscription = await platform_management.switch_plan(
        session,
        locker,
        organization=organization,
        target_tier=body.tier,
        target_interval=body.billing_interval,
    )
    return await _serialize_subscription(session, subscription)


@router.post(
    "/organizations/{organization_id}/cancel",
    summary="Cancel Spaire Subscription",
    response_model=SubscriptionSchema,
)
async def cancel_subscription(
    organization_id: OrganizationID,
    body: CancelSpaireSubscription,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
    locker: Locker = Depends(get_locker),
) -> SubscriptionSchema:
    """Schedule the creator's current Spaire subscription to cancel at
    the end of the current billing period (or, for a trialing
    subscription, at the end of the trial — the remaining trial days are
    kept and nothing is charged).

    After the subscription revokes, the org has no plan and resolves to
    `inactive`: features are gated off until a new plan is picked through
    the upgrade-checkout flow. There is no automatic free fallback.

    Canceling with no paid subscription is a no-op.
    """
    _ = body  # Body kept for future cancel-reason capture.
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    subscription = await platform_management.cancel_at_period_end(
        session, locker, organization=organization
    )
    return await _serialize_subscription(session, subscription)


@router.post(
    "/organizations/{organization_id}/customer-portal-session",
    summary="Mint Customer Portal Session",
    response_model=CustomerPortalSession,
    status_code=201,
)
async def create_customer_portal_session(
    organization_id: OrganizationID,
    body: CustomerPortalSessionCreate,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CustomerPortalSession:
    """Mint a short-lived customer-portal session for the platform-org
    customer that represents this creator. Returns a URL the creator
    can visit to view invoices, update payment methods, and cancel
    their Spaire subscription.

    The session token authenticates as the platform-org customer, which
    is necessarily a different identity from the dashboard user — so the
    portal shows the Spaire subscription (creator-as-buyer view), not the
    creator's own customers.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    if not platform_service.is_configured():
        raise ResourceNotFound(
            "Spaire platform billing is not configured on this server."
        )

    platform_org_id = platform_service.get_id()
    customer_repo = platform_customer_repository(session)
    # load_organization: customer_portal_url reads customer.organization.slug,
    # and that relationship is lazy="raise" — without eager-loading it here
    # the response build raises and the endpoint 500s.
    customer = await customer_repo.get_for_creator_org(
        platform_org_id, organization.id, load_organization=True
    )
    if customer is None:
        # Should have been created by PR 4 on org-create or by PR 6's
        # grandfather migration; surface as 404 if neither has run.
        raise ResourceNotFound(
            "Your organization has not been provisioned on Spaire billing yet."
        )

    return_url = body.return_url
    token, customer_session = await customer_session_service.create_customer_session(
        session,
        customer,
        return_url=None if return_url is None else return_url,  # type: ignore[arg-type]
    )
    customer_session.raw_token = token

    return CustomerPortalSession(
        token=token,
        expires_at=customer_session.expires_at,
        customer_portal_url=customer_session.customer_portal_url,
    )


@router.get(
    "/organizations/{organization_id}/email-sender-domain",
    summary="Get Custom Email Sender Domain Status",
    response_model=EmailSenderDomainStatus,
)
async def get_email_sender_domain(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailSenderDomainStatus:
    """Current state of the org's custom outbound email sender domain:
    configured domain, Resend id, the DNS records the creator must
    install, and whether DKIM has verified.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")
    return EmailSenderDomainStatus(
        domain=organization.email_sender_domain,
        verified_at=organization.email_sender_verified_at,
        resend_id=organization.email_sender_resend_id,
        dns_records=organization.email_sender_dns_records,
    )


@router.post(
    "/organizations/{organization_id}/email-sender-domain/verify",
    summary="Verify Custom Email Sender Domain",
    response_model=EmailSenderDomainStatus,
)
async def verify_email_sender_domain(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSenderDomainStatus:
    """Ask Resend to re-check the domain's DKIM records and stamp the
    verification timestamp if successful. Returns the updated state.

    The creator must have installed the DNS records returned by the
    GET endpoint before this call will succeed.
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    await entitlements_service.require_feature(
        session, organization.id, "custom_email_sender_domain"
    )

    if organization.email_sender_resend_id is None:
        raise ResourceNotFound(
            "No domain registered. Set email_sender_domain first via "
            "the organization update endpoint."
        )

    response = await resend_domains.verify_domain(organization.email_sender_resend_id)

    # Update cached records (Resend sometimes returns refreshed values).
    records = response.get("records")
    if isinstance(records, list):
        organization.email_sender_dns_records = records

    status = response.get("status")
    if status == "verified":
        if organization.email_sender_verified_at is None:
            organization.email_sender_verified_at = utc_now()
    else:
        # Status came back not_started / pending / failed — make sure
        # we don't claim verification.
        organization.email_sender_verified_at = None

    return EmailSenderDomainStatus(
        domain=organization.email_sender_domain,
        verified_at=organization.email_sender_verified_at,
        resend_id=organization.email_sender_resend_id,
        dns_records=organization.email_sender_dns_records,
    )


# ----------------------------------------------------------------------
# Dashboard-native Spaire billing management
#
# These let a creator manage their Spaire subscription — cards on file,
# invoices, billing address — entirely inside their dashboard, with NO
# redirect to the customer portal. Each resolves the org's platform
# Customer via get_for_creator_org (after the standard org-readable check)
# and reuses the existing customer-portal services, which take a bare
# Customer/Order — just authenticated with the dashboard session instead
# of a customer-session token. Mirrors Polar's own /v1/organizations/{id}
# billing endpoints.
# ----------------------------------------------------------------------


async def _billing_customer(
    session: AsyncReadSession | AsyncSession,
    auth_subject: AuthSubject[User | Organization],
    organization_id: UUID,
) -> Customer:
    """Resolve the platform Customer holding this org's Spaire billing,
    after verifying the dashboard caller can manage the org."""
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")
    if not platform_service.is_configured():
        raise ResourceNotFound(
            "Spaire platform billing is not configured on this server."
        )
    customer = await platform_customer_repository(session).get_for_creator_org(
        platform_service.get_id(), organization.id
    )
    if customer is None:
        raise ResourceNotFound(
            "Your organization has not been provisioned on Spaire billing yet."
        )
    return customer


@router.get(
    "/organizations/{organization_id}/payment-methods",
    summary="List Spaire Payment Methods",
    response_model=ListResource[CustomerPaymentMethod],
)
async def list_payment_methods(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    pagination: PaginationParamsQuery,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[CustomerPaymentMethod]:
    """Cards on file the creator uses to pay for their Spaire subscription."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    statement = (
        select(PaymentMethod)
        .where(
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.deleted_at.is_(None),
        )
        .order_by(PaymentMethod.created_at.desc())
    )
    results = (await session.execute(statement)).scalars().all()
    items = [CustomerPaymentMethodTypeAdapter.validate_python(pm) for pm in results]
    return ListResource.from_paginated_results(items, len(items), pagination)


@router.delete(
    "/organizations/{organization_id}/payment-methods/{payment_method_id}",
    summary="Delete Spaire Payment Method",
    status_code=204,
)
async def delete_payment_method(
    organization_id: OrganizationID,
    payment_method_id: UUID4,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a card. The card backing the active subscription is reassigned
    automatically; you can't remove your only card."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    statement = select(PaymentMethod).where(
        PaymentMethod.id == payment_method_id,
        PaymentMethod.customer_id == customer.id,
        PaymentMethod.deleted_at.is_(None),
    )
    payment_method = (await session.execute(statement)).scalar_one_or_none()
    if payment_method is None:
        raise ResourceNotFound("Payment method not found.")
    await customer_portal_customer_service.delete_payment_method(
        session, payment_method
    )


@router.post(
    "/organizations/{organization_id}/payment-methods/{payment_method_id}/default",
    summary="Set Default Spaire Payment Method",
    status_code=204,
)
async def set_default_payment_method(
    organization_id: OrganizationID,
    payment_method_id: UUID4,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Make a card the one Spaire charges each billing period."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    statement = select(PaymentMethod).where(
        PaymentMethod.id == payment_method_id,
        PaymentMethod.customer_id == customer.id,
        PaymentMethod.deleted_at.is_(None),
    )
    payment_method = (await session.execute(statement)).scalar_one_or_none()
    if payment_method is None:
        raise ResourceNotFound("Payment method not found.")
    if customer.stripe_customer_id is not None:
        await stripe_service.update_customer(
            customer.stripe_customer_id,
            invoice_settings={"default_payment_method": payment_method.processor_id},
        )
    customer_repository = CustomerRepository.from_session(session)
    await customer_repository.update(
        customer, update_dict={"default_payment_method": payment_method}
    )


def _order_description(order: Order) -> str:
    """Order.description raises IndexError for an order that has neither a
    product nor items — and a platform customer can have such orders (e.g. a
    balance/wallet order, or one whose product was removed). Compute it
    safely so the order-history list never 500s on a single odd row."""
    if order.product is not None:
        return order.product.name
    if order.items:
        return order.items[0].label
    return order.invoice_number or "Spaire subscription"


@router.get(
    "/organizations/{organization_id}/orders",
    summary="List Spaire Orders",
    response_model=ListResource[PlatformOrder],
)
async def list_orders(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    pagination: PaginationParamsQuery,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[PlatformOrder]:
    """Past invoices for the creator's Spaire subscription, newest first."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    base = (
        select(Order)
        .where(Order.customer_id == customer.id, Order.deleted_at.is_(None))
        .order_by(Order.created_at.desc())
    )
    count = await session.scalar(select(func.count()).select_from(base.subquery()))
    # Order.description reads .product (and .items as a fallback); both are
    # lazy="raise", so eager-load them before serializing.
    page = (
        (
            await session.execute(
                base.options(selectinload(Order.product), selectinload(Order.items))
                .limit(pagination.limit)
                .offset((pagination.page - 1) * pagination.limit)
            )
        )
        .scalars()
        .all()
    )
    items = [
        PlatformOrder(
            id=order.id,
            created_at=order.created_at,
            invoice_number=order.invoice_number,
            description=_order_description(order),
            total_amount=order.total_amount,
            currency=order.currency,
            # Order.status is a plain String column, so a DB-loaded order
            # carries a str here, NOT an OrderStatus enum — `.value` would
            # AttributeError on every real request. str() is safe for both
            # the str and the (StrEnum) in-memory cases.
            status=str(order.status),
            refunded_amount=order.refunded_amount,
            is_invoice_generated=order.invoice_path is not None,
        )
        for order in page
    ]
    return ListResource.from_paginated_results(items, count or 0, pagination)


@router.get(
    "/organizations/{organization_id}/orders/{order_id}/invoice",
    summary="Get Spaire Order Invoice",
    response_model=PlatformOrderInvoice,
)
async def get_order_invoice(
    organization_id: OrganizationID,
    order_id: UUID4,
    auth_subject: auth.PlatformRead,
    session: AsyncSession = Depends(get_db_session),
) -> PlatformOrderInvoice:
    """A signed URL to download a Spaire invoice PDF, generating it first
    if it has not been built yet."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    statement = select(Order).where(
        Order.id == order_id,
        Order.customer_id == customer.id,
        Order.deleted_at.is_(None),
    )
    order = (await session.execute(statement)).scalar_one_or_none()
    if order is None:
        raise ResourceNotFound("Order not found.")
    if order.invoice_path is None:
        await customer_order_service.trigger_invoice_generation(session, order)
        raise ResourceNotFound(
            "Invoice is being generated. Try again in a few seconds."
        )
    invoice = await customer_order_service.get_order_invoice(order)
    return PlatformOrderInvoice(url=invoice.url)


@router.get(
    "/organizations/{organization_id}/billing-details",
    summary="Get Spaire Billing Details",
    response_model=PlatformBillingDetails,
)
async def get_billing_details(
    organization_id: OrganizationID,
    auth_subject: auth.PlatformRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> PlatformBillingDetails:
    """The name/address/tax-id shown on the creator's Spaire invoices."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    return PlatformBillingDetails(
        billing_name=customer.billing_name,
        billing_address=customer.billing_address,
        tax_id=customer.tax_id,
        default_payment_method_id=customer.default_payment_method_id,
    )


@router.patch(
    "/organizations/{organization_id}/billing-details",
    summary="Update Spaire Billing Details",
    response_model=PlatformBillingDetails,
)
async def update_billing_details(
    organization_id: OrganizationID,
    body: PlatformBillingDetailsUpdate,
    auth_subject: auth.PlatformWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PlatformBillingDetails:
    """Update the billing identity used on the creator's Spaire invoices."""
    customer = await _billing_customer(session, auth_subject, organization_id)
    customer = await customer_portal_customer_service.update(
        session,
        customer,
        CustomerPortalCustomerUpdate(
            billing_name=body.billing_name,
            billing_address=body.billing_address,
            tax_id=body.tax_id,
        ),
    )
    return PlatformBillingDetails(
        billing_name=customer.billing_name,
        billing_address=customer.billing_address,
        tax_id=customer.tax_id,
        default_payment_method_id=customer.default_payment_method_id,
    )
