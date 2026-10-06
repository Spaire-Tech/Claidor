"""The billing page, on the API host: the three plans, Stripe Checkout to
start one, Stripe's Customer Portal for the rest.

Simeon is the Mac app; there is no web app in front of it (6 October
2026). So the page the app's upgrade button, the sign-in gate and the
window's access cover open lives here, at the root like the sign-in page
(`simeon.desktop.app_sign_in`), with the same one-file styling and the
same session cookie. Stripe's pages do the card, the invoices, the plan
switch and the cancellation; this page only chooses the plan and comes
back (`docs/services-billing.md`, section 3).

    GET  /billing?plan=&return_to=&checkout_session_id=&done=1
    POST /billing/checkout   tier, interval, return_to  → Stripe Checkout
    POST /billing/portal     flow, return_to            → the Customer Portal
"""

from __future__ import annotations

from html import escape
from urllib.parse import urlencode

from fastapi import Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from simeon.auth.dependencies import WebUserOrAnonymous
from simeon.auth.models import is_user
from simeon.config import settings
from simeon.entitlements.tiers import PAID_TIERS, TIER_NAMES, TierKey, get_definition
from simeon.models import DesktopSubscription, User
from simeon.openapi import APITag
from simeon.plans import catalog
from simeon.plans.service import PlansError, allowed_return_url
from simeon.plans.service import plans as plans_service
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .allowance import BILLING_PATH, billing_required, resolve_allowance
from .app_sign_in import NO_STORE, PRODUCT, _page, _same_origin
from .endpoints import sign_in_url

router = APIRouter(tags=["desktop", APITag.private])

STYLE = (
    "<style>"
    "main{max-width:40rem}"
    ".plans{display:grid;gap:1rem;margin:1.25rem 0}"
    ".plan{border:1px solid color-mix(in srgb,CanvasText 18%,transparent);"
    "border-radius:.75rem;padding:1rem 1.25rem}"
    ".plan h2{font-size:1.05rem;margin:0 0 .25rem}"
    ".plan .price{font-size:1.5rem;font-weight:600}"
    ".plan form{display:inline-block;margin:.5rem .5rem 0 0}"
    ".note{border-radius:.75rem;padding:.9rem 1.1rem;margin-bottom:1rem;"
    "background:color-mix(in srgb,CanvasText 8%,transparent)}"
    "button.quiet{background:transparent;color:CanvasText;"
    "border:1px solid color-mix(in srgb,CanvasText 30%,transparent)}"
    "</style>"
)


def _dollars(cents: int) -> str:
    return f"${cents // 100:,}" if cents % 100 == 0 else f"${cents / 100:,.2f}"


def _credits(n: int) -> str:
    return f"{n:,}"


def _hidden(**fields: str | None) -> str:
    return "".join(
        f'<input type="hidden" name="{name}" value="{escape(value, quote=True)}">'
        for name, value in fields.items()
        if value
    )


def _plan_of(value: str | None) -> TierKey | None:
    try:
        tier = TierKey(value) if value else None
    except ValueError:
        return None
    return tier if tier in PAID_TIERS else None


def _this_page(**query: str | None) -> str:
    kept = {k: v for k, v in query.items() if v}
    return settings.generate_external_url(
        BILLING_PATH + (f"?{urlencode(kept)}" if kept else "")
    )


def _status_line(row: DesktopSubscription | None) -> str:
    if row is None or not row.billable or row.tier is None:
        return ""
    name = TIER_NAMES.get(TierKey(row.tier), row.tier)
    definition = get_definition(TierKey(row.tier))
    when = ""
    if row.trialing and row.trial_end is not None:
        day = row.trial_end.strftime("%B %-d")
        when = (
            f" Your trial is cancelled and ends on {day}; you will not be charged."
            if row.cancel_at_period_end
            else f" Your trial ends on {day}; your card is charged then unless you cancel."
        )
    elif row.current_period_end is not None:
        day = row.current_period_end.strftime("%B %-d")
        when = (
            f" Your plan ends on {day}."
            if row.cancel_at_period_end
            else f" It renews on {day}."
        )
    if row.status == "past_due":
        when = " Your last payment failed. Update your card to keep your plan."
    credits = (
        f"{_credits(definition.trial_credits)} credits for the trial, then "
        f"{_credits(definition.weekly_credits)} a week."
        if row.trialing
        else f"{_credits(definition.weekly_credits)} credits a week, resetting every Monday."
    )
    return (
        '<div class="note"><strong>Your plan: Simeon '
        f"{escape(name)}{', on trial' if row.trialing else ''}.</strong> "
        f"{credits}{escape(when)}</div>"
    )


def _cards(highlight: TierKey | None, return_to: str | None) -> str:
    out = ['<div class="plans">']
    for tier in PAID_TIERS:
        definition = get_definition(tier)
        monthly = catalog.price_for(tier, "month")
        yearly = catalog.price_for(tier, "year")
        buttons = "".join(
            f'<form method="post" action="{BILLING_PATH}/checkout">'
            f"{_hidden(tier=tier.value, interval=interval, return_to=return_to)}"
            f'<button type="submit"{" class=quiet" if interval == "year" else ""}>'
            f"{label}</button></form>"
            for interval, label in (
                (
                    "month",
                    f"Start free trial, {_dollars(monthly.unit_amount)}/month after",
                ),
                ("year", f"{_dollars(yearly.unit_amount)}/year"),
            )
        )
        mark = ' style="border-color:CanvasText"' if tier == highlight else ""
        out.append(
            f'<div class="plan"{mark}><h2>Simeon {escape(TIER_NAMES[tier])}</h2>'
            f'<div class="price">{_dollars(monthly.unit_amount)}<small> / month</small></div>'
            f"<p>{_credits(definition.weekly_credits)} credits a week, about "
            f"{definition.weekly_credits // 100_000} tasks. "
            f"{escape(catalog.PRODUCT_DESCRIPTIONS[tier])}</p>{buttons}</div>"
        )
    out.append("</div>")
    out.append(
        f"<p><small>{catalog.TRIAL_DAYS} days free with "
        f"{_credits(get_definition(PAID_TIERS[0]).trial_credits)} credits, once; "
        "your card is charged when the trial ends unless you cancel. A credit is "
        "one token of input on the middle model; a typical task is about "
        "100,000 credits.</small></p>"
    )
    return "".join(out)


def _manage(return_to: str | None, trialing: bool) -> str:
    cancel = "Cancel trial" if trialing else "Cancel plan"
    return (
        '<div class="note">Your card, invoices and receipts are on Stripe, and so '
        "is changing or ending your plan."
        f'<form method="post" action="{BILLING_PATH}/portal">'
        f"{_hidden(flow='', return_to=return_to)}"
        '<button type="submit">Open billing on Stripe</button></form> '
        f'<form method="post" action="{BILLING_PATH}/portal">'
        f"{_hidden(flow='update', return_to=return_to)}"
        '<button type="submit" class="quiet">Switch plan</button></form> '
        f'<form method="post" action="{BILLING_PATH}/portal">'
        f"{_hidden(flow='cancel', return_to=return_to)}"
        f'<button type="submit" class="quiet">{cancel}</button></form></div>'
    )


@router.get(BILLING_PATH, name="desktop:billing", response_model=None)
async def billing(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    plan: str | None = Query(default=None),
    return_to: str | None = Query(default=None),
    checkout_session_id: str | None = Query(default=None),
    done: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse | HTMLResponse:
    back = allowed_return_url(return_to)
    highlight = _plan_of(plan)
    if not is_user(auth_subject):
        here = _this_page(plan=highlight.value if highlight else None, return_to=back)
        return RedirectResponse(sign_in_url(request, here), 303, headers=NO_STORE)
    user: User = auth_subject.subject

    if checkout_session_id:
        try:
            await plans_service.sync_checkout_session(
                session, user, checkout_session_id
            )
        except PlansError:
            pass
        except Exception:
            pass

    row = await plans_service.subscription_of(session, user)
    subscribed = row is not None and row.billable
    parts: list[str] = [STYLE]
    if done or checkout_session_id:
        parts.append(
            '<div class="note"><strong>Your card is saved.</strong> '
            + (
                f"Your {catalog.TRIAL_DAYS} days start now. "
                if row is not None and row.trialing
                else ""
            )
            + f"Open {PRODUCT} on your Mac to keep going.</div>"
        )
    if back and not subscribed:
        parts.append(
            f'<div class="note"><strong>One step before you sign in to {PRODUCT} on '
            "your Mac.</strong> Pick a plan and save a card. You are sent back to "
            "finish signing in once the card is saved.</div>"
        )
    if back and subscribed:
        parts.append(
            f'<div class="note"><strong>You have a plan.</strong> <a href="{escape(back, quote=True)}">'
            f"Go back and finish signing in to {PRODUCT}.</a></div>"
        )
    if not billing_required():
        allowance = await resolve_allowance(session, user)
        if allowance.free and not subscribed:
            parts.append(
                '<div class="note">This server does not require a plan yet: you have '
                f"{_credits(allowance.credits_limit)} credits a month on it.</div>"
            )
    parts.append(_status_line(row))
    if subscribed and row is not None:
        parts.append(_manage(back, row.trialing))
    else:
        parts.append(_cards(highlight, back))
    return _page(f"Your {PRODUCT} plan", "".join(parts))


@router.post(
    f"{BILLING_PATH}/checkout", name="desktop:billing_checkout", response_model=None
)
async def billing_checkout(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    tier: str = Form(default=""),
    interval: str = Form(default="month"),
    return_to: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse | HTMLResponse:
    chosen = _plan_of(tier)
    if not _same_origin(request) or not is_user(auth_subject) or chosen is None:
        return _page("That did not work", f"<p>Open {PRODUCT} and try again.</p>")
    back = allowed_return_url(return_to)
    # The sign-in page takes `checkout_session_id` itself and carries on;
    # otherwise this page says the card is saved.
    success = back or _this_page(done="1")
    try:
        url = await plans_service.create_checkout(
            session,
            auth_subject.subject,
            tier=chosen,
            interval="year" if interval == "year" else "month",
            success_url=success,
            cancel_url=_this_page(return_to=back),
        )
    except PlansError as error:
        return _page("That did not work", f"<p>{escape(error.message)}</p>")
    return RedirectResponse(url, 303, headers=NO_STORE)


@router.post(
    f"{BILLING_PATH}/portal", name="desktop:billing_portal", response_model=None
)
async def billing_portal(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    flow: str = Form(default=""),
    return_to: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse | HTMLResponse:
    if not _same_origin(request) or not is_user(auth_subject):
        return _page("That did not work", f"<p>Open {PRODUCT} and try again.</p>")
    back = allowed_return_url(return_to)
    try:
        url = await plans_service.create_portal(
            session,
            auth_subject.subject,
            return_url=_this_page(return_to=back),
            flow=flow if flow in ("cancel", "update", "payment_method") else None,
        )
    except PlansError as error:
        return _page("That did not work", f"<p>{escape(error.message)}</p>")
    return RedirectResponse(url, 303, headers=NO_STORE)


__all__ = ["router"]
