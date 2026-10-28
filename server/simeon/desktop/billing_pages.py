"""The pages the apps open to change a plan or start it now, and the way
back from buying extra credits (27 October 2026).

The apps used to open Stripe's Customer Portal on its own confirm step, and
the portal changes a plan its own way: no credit for the old plan's unused
time and a downgrade at once. Simeon now changes plans itself, as Apple
does (`PlansService.change_plan`): an upgrade starts today and costs the new
price less the unused time, a downgrade waits for the renewal. The app's
browser sheet is not signed in to the website, so the app asks
`/desktop/api/billing/portal` and gets a link to the page here, carrying a
signed half-hour token naming the person, the change and the app to go back
to. The page says what the change does and what it costs, in the sign-in
page's design (`app_sign_in._page`), and its Confirm button makes it; the
page that follows brings the app forward.

Extra credits are paid on Stripe's Checkout page; it comes back to
`/desktop/billing/credits/done`, which grants the pack (once, as the webhook
does) and brings the app forward.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from html import escape
from typing import Literal
from urllib.parse import urlencode
from uuid import UUID

import structlog
from babel import Locale
from babel.dates import format_date
from babel.numbers import format_currency
from fastapi import Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from simeon.config import settings
from simeon.entitlements.tiers import TIER_NAMES, TierKey
from simeon.kit import jwt
from simeon.models import User
from simeon.openapi import APITag
from simeon.plans import credits as credits_service
from simeon.plans.service import CHECKOUT_SESSION_PLACEHOLDER, PlanChange, PlansError
from simeon.plans.service import plans as plans_service
from simeon.plans.stripe_billing import stripe_billing
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter
from simeon.user.repository import UserRepository

from .app_sign_in import NO_STORE, PRODUCT, _page, _same_origin
from .language import answer_in_request_language, current_language
from .words import say

log = structlog.get_logger()

router = APIRouter(
    prefix="/desktop/billing",
    tags=["desktop", APITag.private],
    dependencies=[Depends(answer_in_request_language)],
    include_in_schema=False,
)

TOKEN_TYPE: Literal["desktop_billing_change"] = "desktop_billing_change"
TOKEN_SECONDS = 30 * 60

#: The apps' own URL schemes (`endpoints.APP_SCHEMES`).
APP_SCHEMES = ("simeon", "simeon-ios")

Action = Literal["change", "start_now"]


def page_url(
    user: User, *, action: Action, tier: TierKey | None, back: str | None
) -> str:
    """The confirm page for one change, for this person, for half an hour."""
    token = jwt.encode(
        data={
            "sub": str(user.id),
            "action": action,
            "tier": tier.value if tier is not None else "",
            "back": back if back in APP_SCHEMES else "",
        },
        secret=settings.SECRET,
        expires_in=TOKEN_SECONDS,
        type=TOKEN_TYPE,
    )
    return settings.generate_external_url(
        f"/desktop/billing/change?{urlencode({'t': token})}"
    )


def back_url(back: str | None) -> str:
    query = urlencode({"to": back}) if back in APP_SCHEMES else ""
    return settings.generate_external_url(
        f"/desktop/billing/back{'?' + query if query else ''}"
    )


def credits_done_url(back: str | None) -> str:
    """Where Stripe's Checkout for extra credits sends the person back,
    with its own id filled in by Stripe."""
    query = urlencode({"to": back}) if back in APP_SCHEMES else ""
    return settings.generate_external_url(
        f"/desktop/billing/credits/done?{query + '&' if query else ''}"
        f"checkout_session_id={CHECKOUT_SESSION_PLACEHOLDER}"
    )


def _locale() -> Locale:
    try:
        return Locale.parse(current_language() or "en", sep="-")
    except (ValueError, LookupError):
        return Locale.parse("en")


def money(cents: int, currency: str = "usd") -> str:
    """$70, or $70.50: the locale's own way, without cents when there are none."""
    locale = _locale()
    amount = Decimal(cents) / 100
    if cents % 100 == 0:
        pattern = locale.currency_formats["standard"].pattern.replace(".00", "")
        return format_currency(
            amount,
            currency.upper(),
            format=pattern,
            locale=locale,
            currency_digits=False,
        )
    return format_currency(amount, currency.upper(), locale=locale)


def day(moment: datetime) -> str:
    return format_date(moment.date(), format="long", locale=_locale())


def _per(change: PlanChange) -> str:
    key = (
        "billing.page.per_year"
        if change.interval == "year"
        else "billing.page.per_month"
    )
    return say(key, amount=money(change.price, change.currency))


def _name(tier: TierKey | None) -> str:
    return TIER_NAMES.get(tier, "") if tier is not None else ""


def describe(change: PlanChange) -> tuple[str, str]:
    """The page's title and sentence for a change, before it is made."""
    plan, current = _name(change.tier), _name(change.current)
    if change.kind == "upgrade":
        return say("billing.page.upgrade", plan=plan), say(
            "billing.page.upgrade_body",
            plan=plan,
            amount=money(change.amount_due, change.currency),
            current=current,
            price=_per(change),
        )
    if change.kind == "downgrade":
        return say("billing.page.switch", plan=plan), say(
            "billing.page.downgrade_body",
            plan=plan,
            current=current,
            date=day(change.starts_at),
            price=_per(change),
        )
    if change.kind == "trial":
        return say("billing.page.switch", plan=plan), say(
            "billing.page.trial_body",
            plan=plan,
            date=day(change.starts_at),
            price=_per(change),
        )
    if change.kind == "keep":
        return say("billing.page.keep", plan=current), say(
            "billing.page.keep_body", plan=current, next=_name(change.scheduled_tier)
        )
    return say("billing.page.start_now", plan=plan), say(
        "billing.page.start_now_body",
        plan=plan,
        amount=money(change.amount_due, change.currency),
    )


def _done_title(change: PlanChange) -> str:
    if change.kind == "downgrade":
        return say(
            "billing.page.done_later",
            plan=_name(change.tier),
            date=day(change.starts_at),
        )
    return say("billing.page.done", plan=_name(change.tier))


def _expired() -> HTMLResponse:
    return _page(
        say("apps.page.expired"),
        f"<p>{escape(say('apps.page.try_again'))}</p>",
    )


def _failed(message: str, back: str | None) -> HTMLResponse:
    return _page(
        say("billing.page.failed"),
        f"<p>{escape(message)}</p>",
        actions=f'<a class="pill glass" href="{escape(back_url(back), quote=True)}">'
        f"{escape(say('billing.page.back'))}</a>",
    )


async def _claims(
    session: AsyncSession, token: str
) -> tuple[User, Action, TierKey | None, str] | None:
    try:
        claims = jwt.decode(token=token, secret=settings.SECRET, type=TOKEN_TYPE)
        user_id = UUID(str(claims.get("sub") or ""))
    except Exception:
        return None
    user = await UserRepository.from_session(session).get_by_id(user_id)
    if user is None or not user.can_authenticate:
        return None
    action: Action = "start_now" if claims.get("action") == "start_now" else "change"
    try:
        tier = TierKey(claims["tier"]) if claims.get("tier") else None
    except ValueError:
        return None
    if action == "change" and tier is None:
        return None
    back = str(claims.get("back") or "")
    return user, action, tier, back if back in APP_SCHEMES else ""


@router.get("/change", name="desktop:billing_change", response_model=None)
async def change_page(
    t: str = Query(default=""),
    session: AsyncSession = Depends(get_db_session),
) -> HTMLResponse:
    """What the change does and costs, with Confirm and Not now."""
    found = await _claims(session, t)
    if found is None:
        return _expired()
    user, action, tier, back = found
    try:
        if action == "start_now":
            change = await plans_service.start_now_preview(session, user)
        else:
            assert tier is not None
            change = await plans_service.change_preview(session, user, tier)
    except PlansError as error:
        return _failed(error.message, back)
    except Exception:
        # A page in a browser, never a bare error (28 October 2026): what went wrong is in the log.
        log.exception("desktop.billing.change_page_failed", user_id=str(user.id))
        return _failed(say("apps.page.try_again"), back)
    title, sentence = describe(change)
    fields = f'<input type="hidden" name="t" value="{escape(t, quote=True)}">'
    return _page(
        title,
        f"<p>{escape(sentence)}</p>",
        actions='<form method="post" action="/desktop/billing/change">'
        f"{fields}"
        f'<button class="pill" type="submit">{escape(say("billing.page.confirm"))}'
        "</button></form>"
        f'<a class="pill glass" href="{escape(back_url(back), quote=True)}">'
        f"{escape(say('billing.page.not_now'))}</a>",
    )


@router.post("/change", name="desktop:billing_change_confirm", response_model=None)
async def confirm_change(
    request: Request,
    t: str = Form(default=""),
    session: AsyncSession = Depends(get_db_session),
) -> HTMLResponse:
    found = await _claims(session, t)
    if found is None or not _same_origin(request):
        return _expired()
    user, action, tier, back = found
    try:
        if action == "start_now":
            change = await plans_service.start_now(session, user)
        else:
            assert tier is not None
            change = await plans_service.change_plan(session, user, tier)
    except PlansError as error:
        return _failed(error.message, back)
    except Exception:
        log.exception("desktop.billing.change_failed", user_id=str(user.id))
        return _failed(say("apps.page.try_again"), back)
    return _page(
        _done_title(change),
        f"<p>{escape(say('sign_in.page.close_tab', product=PRODUCT))}</p>",
        deep_link=f"{back}://app/v1/open" if back else None,
    )


@router.get("/credits/done", name="desktop:billing_credits_done", response_model=None)
async def credits_done(
    to: str | None = Query(default=None),
    checkout_session_id: str = Query(default=""),
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    """Back from Stripe's Checkout for extra credits: the pack is granted
    now if the webhook has not done it yet, then on to the app. The pack
    goes to whoever the checkout was made for, and only once it is paid,
    whoever opens this link."""
    if checkout_session_id:
        try:
            checkout = await stripe_billing.retrieve_paid_checkout(checkout_session_id)
            await credits_service.grant(session, checkout)
        except Exception as error:
            # The webhook grants it anyway; the person is not held here.
            log.warning("plans.credits.return_not_granted", error=str(error))
    return RedirectResponse(back_url(to), status_code=302, headers=NO_STORE)


__all__ = [
    "back_url",
    "credits_done_url",
    "describe",
    "money",
    "page_url",
    "router",
]
