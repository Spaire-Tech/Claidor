"""The web app's billing page, on Stripe Billing.

GET  /v1/plans/                    The three plans with their prices and credits.
GET  /v1/plans/subscription        The signed-in person's plan, from the synced copy.
POST /v1/plans/checkout            A Stripe Checkout URL that starts a plan.
POST /v1/plans/portal              A Customer Portal URL for cards, invoices, cancelling.
POST /v1/plans/sync                Copy in the subscription a checkout just made.
POST /v1/plans/change/preview      What moving to a plan would do and cost.
POST /v1/plans/change              Move to a plan: upgrades today, downgrades at renewal.
POST /v1/plans/start-now/preview   What ending the trial now would charge.
POST /v1/plans/start-now           End the trial and start the plan today.
GET  /v1/plans/credits             Extra credits: the balance and the packs.
POST /v1/plans/credits/checkout    A Stripe Checkout URL for extra credits.
POST /v1/plans/credits/sync        Grant the pack a checkout just paid for.
"""

from fastapi import Depends

from simeon.auth.dependencies import WebUserRead, WebUserWrite
from simeon.config import settings
from simeon.desktop.allowance import (
    billing_exempt,
    billing_required,
    resolve_allowance,
)
from simeon.desktop.language import answer_in_request_language
from simeon.entitlements.schemas import Entitlements
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, TierKey, get_definition
from simeon.models import User
from simeon.openapi import APITag
from simeon.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from simeon.routing import APIRouter

from . import catalog
from . import credits as credits_service
from .effective import PlanRow
from .schemas import (
    CheckoutCreate,
    CheckoutCreated,
    CheckoutSync,
    CreditPack,
    CreditsCheckoutCreate,
    CreditsSummary,
    CurrentSubscription,
    Plan,
    PlanChange,
    PlanChangeCreate,
    PlanList,
    PortalCreate,
    PortalCreated,
)
from .service import BILLING_PATH, CHECKOUT_SESSION_PLACEHOLDER, allowed_return_url
from .service import PlanChange as PlanChangeResult
from .service import plans as plans_service

router = APIRouter(
    prefix="/plans",
    tags=["plans", APITag.private],
    # The billing page's refusals in the browser's language (`say`).
    dependencies=[Depends(answer_in_request_language)],
)


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
    row: PlanRow | None,
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
        or getattr(row, "stripe_customer_id", None),
        provider=row.provider if row is not None else None,  # type: ignore[arg-type]
        scheduled_tier=_tier_or_none(getattr(row, "scheduled_tier", None)),
        scheduled_at=getattr(row, "scheduled_at", None),
        entitlements=Entitlements.from_dataclass(get_definition(tier)),
    )


def _tier_or_none(value: str | None) -> TierKey | None:
    try:
        return TierKey(value) if value else None
    except ValueError:
        return None


def plan_change(change: PlanChangeResult) -> PlanChange:
    return PlanChange(
        kind=change.kind,
        current=change.current,
        tier=change.tier,
        billing_interval=change.interval,
        amount_due=change.amount_due,
        credit=change.credit,
        price=change.price,
        currency=change.currency,
        starts_at=change.starts_at,
        proration_date=change.proration_date,
        scheduled_tier=change.scheduled_tier,
    )


async def credits_summary(session: AsyncSession, user: User) -> CreditsSummary:
    allowance = await resolve_allowance(session, user)
    packs = await credits_service.live_packs(session, user.id)
    return CreditsSummary(
        balance=sum(pack.remaining for pack in packs),
        packs=[
            CreditPack(
                credits=pack.credits,
                remaining=pack.remaining,
                expires_at=pack.expires_at,
            )
            for pack in packs
        ],
        pack_credits=catalog.CREDITS_PACK,
        pack_price_cents=catalog.CREDITS_PACK_CENTS,
        max_packs=catalog.CREDITS_MAX_PACKS,
        can_buy=allowance.paid,
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
    row = await plans_service.plan_of(session, user)  # type: ignore[arg-type]
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


@router.post(
    "/change/preview",
    summary="Preview A Plan Change",
    response_model=PlanChange,
)
async def preview_change(
    body: PlanChangeCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PlanChange:
    return plan_change(
        await plans_service.change_preview(session, auth_subject.subject, body.tier)
    )


@router.post("/change", summary="Change Plan", response_model=PlanChange)
async def change_plan(
    body: PlanChangeCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PlanChange:
    return plan_change(
        await plans_service.change_plan(
            session,
            auth_subject.subject,
            body.tier,
            proration_date=body.proration_date,
        )
    )


@router.post(
    "/start-now/preview",
    summary="Preview Starting The Plan Now",
    response_model=PlanChange,
)
async def preview_start_now(
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PlanChange:
    return plan_change(
        await plans_service.start_now_preview(session, auth_subject.subject)
    )


@router.post("/start-now", summary="Start The Plan Now", response_model=PlanChange)
async def start_now(
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PlanChange:
    return plan_change(await plans_service.start_now(session, auth_subject.subject))


@router.get("/credits", summary="Get My Extra Credits", response_model=CreditsSummary)
async def get_credits(
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CreditsSummary:
    return await credits_summary(session, auth_subject.subject)


@router.post(
    "/credits/checkout",
    summary="Buy Extra Credits",
    response_model=CheckoutCreated,
    status_code=201,
)
async def create_credits_checkout(
    body: CreditsCheckoutCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CheckoutCreated:
    success = allowed_return_url(body.success_url) or settings.generate_frontend_url(
        f"{BILLING_PATH}?credits=1"
    )
    joiner = "&" if "?" in success else "?"
    url = await credits_service.create_checkout(
        session,
        auth_subject.subject,
        packs=body.packs,
        success_url=f"{success}{joiner}checkout_session_id={CHECKOUT_SESSION_PLACEHOLDER}",
        cancel_url=allowed_return_url(body.cancel_url)
        or settings.generate_frontend_url(BILLING_PATH),
    )
    return CheckoutCreated(checkout_url=url)


@router.post(
    "/credits/sync",
    summary="Sync A Finished Credits Checkout",
    response_model=CreditsSummary,
)
async def sync_credits_checkout(
    body: CheckoutSync,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CreditsSummary:
    user = auth_subject.subject
    await credits_service.sync_checkout(session, user, body.checkout_session_id)
    return await credits_summary(session, user)
