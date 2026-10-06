"""The web app's billing page, on Stripe Billing.

GET  /v1/plans/              The three plans with their prices and credits.
GET  /v1/plans/subscription  The signed-in person's plan, from the synced copy.
POST /v1/plans/checkout      A Stripe Checkout URL that starts a plan.
POST /v1/plans/portal        A Customer Portal URL for cards, invoices, changes.
POST /v1/plans/sync          Copy in the subscription a checkout just made.
"""

from fastapi import Depends

from simeon.auth.dependencies import WebUserRead, WebUserWrite
from simeon.desktop.allowance import billing_exempt, billing_required
from simeon.entitlements.schemas import Entitlements
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, TierKey, get_definition
from simeon.models import DesktopSubscription
from simeon.openapi import APITag
from simeon.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from simeon.routing import APIRouter

from . import catalog
from .schemas import (
    CheckoutCreate,
    CheckoutCreated,
    CheckoutSync,
    CurrentSubscription,
    Plan,
    PlanList,
    PortalCreate,
    PortalCreated,
)
from .service import plans as plans_service

router = APIRouter(prefix="/plans", tags=["plans", APITag.private])


def plan_list() -> PlanList:
    items: list[Plan] = []
    for tier in PAID_TIERS:
        definition = get_definition(tier)
        monthly = catalog.price_for(tier, "month")
        yearly = catalog.price_for(tier, "year")
        items.append(
            Plan(
                tier=tier,
                name=f"Simeon {TIER_NAMES[tier]}",
                description=catalog.PRODUCT_DESCRIPTIONS[tier],
                monthly_price_cents=monthly.unit_amount,
                annual_price_cents=yearly.unit_amount,
                weekly_credits=definition.weekly_credits,
                trial_credits=definition.trial_credits,
                trial_days=catalog.TRIAL_DAYS,
                monthly_lookup_key=monthly.lookup_key,
                annual_lookup_key=yearly.lookup_key,
            )
        )
    return PlanList(items=items)


def current_subscription(
    row: DesktopSubscription | None,
    stripe_customer_id: str | None,
    *,
    free: bool = False,
) -> CurrentSubscription:
    """`free` is a person who needs no plan (billing not required on this
    server, or an exempt e-mail): `unmanaged` rather than `inactive`, so
    the web app's gates leave them alone. A plan they bought anyway still
    shows."""
    tier = TierKey.unmanaged if free else TierKey.inactive
    if row is not None and row.billable and row.tier is not None:
        try:
            tier = TierKey(row.tier)
        except ValueError:
            pass
    interval = row.billing_interval if row is not None else None
    return CurrentSubscription(
        tier=tier,
        status=row.status if row is not None else ("free" if free else "none"),
        billing_interval=interval if interval in ("month", "year") else None,  # type: ignore[arg-type]
        current_period_end=row.current_period_end if row is not None else None,
        trial_end=row.trial_end if row is not None and row.trialing else None,
        cancel_at_period_end=bool(row.cancel_at_period_end)
        if row is not None
        else False,
        stripe_customer_id=stripe_customer_id
        or (row.stripe_customer_id if row is not None else None),
        entitlements=Entitlements.from_dataclass(get_definition(tier)),
    )


@router.get("/", summary="List Simeon Plans", response_model=PlanList)
async def list_plans(auth_subject: WebUserRead) -> PlanList:
    _ = auth_subject
    return plan_list()


@router.get(
    "/subscription",
    summary="Get My Subscription",
    response_model=CurrentSubscription,
)
async def get_subscription(
    auth_subject: WebUserRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CurrentSubscription:
    user = auth_subject.subject
    row = await plans_service.subscription_of(session, user)  # type: ignore[arg-type]
    return current_subscription(
        row,
        user.stripe_customer_id,
        free=not billing_required() or billing_exempt(user),
    )


@router.post(
    "/checkout",
    summary="Start A Plan",
    response_model=CheckoutCreated,
    status_code=201,
)
async def create_checkout(
    body: CheckoutCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CheckoutCreated:
    url = await plans_service.create_checkout(
        session,
        auth_subject.subject,
        tier=body.tier,
        interval=body.billing_interval,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
    )
    return CheckoutCreated(checkout_url=url)


@router.post(
    "/portal",
    summary="Open The Customer Portal",
    response_model=PortalCreated,
    status_code=201,
)
async def create_portal(
    body: PortalCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PortalCreated:
    url = await plans_service.create_portal(
        session,
        auth_subject.subject,
        return_url=body.return_url,
        flow=body.flow,
        tier=body.tier,
    )
    return PortalCreated(portal_url=url)


@router.post(
    "/sync",
    summary="Sync A Finished Checkout",
    response_model=CurrentSubscription,
)
async def sync_checkout(
    body: CheckoutSync,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CurrentSubscription:
    user = auth_subject.subject
    row = await plans_service.sync_checkout_session(
        session, user, body.checkout_session_id
    )
    return current_subscription(row, user.stripe_customer_id)
