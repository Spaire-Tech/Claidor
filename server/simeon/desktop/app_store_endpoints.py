"""The iPhone app's in-app purchase, on the server (12 October 2026).

- `GET  /desktop/api/billing/apple/products`: the subscriptions' product ids
  the app asks StoreKit for, with each plan's credits, and the web billing
  page the app may offer in the United States.
- `POST /desktop/api/billing/apple/transactions`: what StoreKit gave the app
  after a purchase, a restore or at launch; answers the plan and the quota.
- `POST /desktop/apple/notifications`: Apple's server notifications
  (version 2), set as the production and sandbox URL in App Store Connect.
- `POST /desktop/api/billing/free-month`: the free month the app starts
  after a sign-in, no card (`simeon.plans.free_month`, 12 October 2026).

`simeon.plans.app_store` checks Apple's signatures and keeps the plan;
`docs/services-billing.md` (section 9) says how it is set up.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.models import DesktopSession
from simeon.plans import app_store, free_month
from simeon.plans.app_store import AppStoreError
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .allowance import billing_url
from .auth import get_desktop_session
from .service import desktop

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

#: StoreKit's signed transactions run to a few kilobytes; a restore sends
#: one per subscription the Apple ID holds.
_SIGNED_MAX = 32_000
_SIGNED_COUNT = 20


def _error(error: AppStoreError) -> JSONResponse:
    return JSONResponse(
        {"error": {"type": "app_store", "message": error.message}},
        status_code=error.status_code,
    )


@router.get("/api/billing/apple/products", name="desktop:apple_products")
async def apple_products(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """The plans as StoreKit sells them, and the web page the app offers
    beside them where Apple allows it (the United States)."""
    _ = desktop_session
    return JSONResponse(
        {
            "products": app_store.products(),
            "webSubscribeUrl": billing_url(from_app=True),
        }
    )


class TransactionsBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    signedTransactions: list[str] = Field(max_length=_SIGNED_COUNT)
    signedRenewalInfo: list[str] = Field(default_factory=list, max_length=_SIGNED_COUNT)


def _plan_json(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "tier": row.tier,
        "status": row.status,
        "productId": row.product_id,
        "currentPeriodEnd": row.current_period_end.isoformat()
        if row.current_period_end
        else None,
        "cancelAtPeriodEnd": row.cancel_at_period_end,
        "environment": row.environment,
    }


@router.post("/api/billing/apple/transactions", name="desktop:apple_transactions")
async def apple_transactions(
    body: TransactionsBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Apply the app's signed transactions to the signed-in person, then
    answer the plan they make and the quota the app shows."""
    signed = [one for one in body.signedTransactions if 0 < len(one) <= _SIGNED_MAX]
    renewals = [one for one in body.signedRenewalInfo if 0 < len(one) <= _SIGNED_MAX]
    user = desktop_session.user
    try:
        rows = await app_store.sync_from_app(session, user, signed, renewals)
    except AppStoreError as error:
        return _error(error)
    live = [row for row in rows if row.billable]
    return JSONResponse(
        {
            "plan": _plan_json(live[0] if live else (rows[0] if rows else None)),
            "quota": await desktop.quota(session, user),
        }
    )


class FreeMonthBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    #: `DCDevice.generateToken()`, base64, a few kilobytes.
    deviceToken: str = Field(min_length=1, max_length=16_000)
    #: The app's guess at which DeviceCheck service knows its token: a
    #: build run from Xcode is signed for development.
    development: bool = False


@router.post("/api/billing/free-month", name="desktop:free_month")
async def start_free_month(
    body: FreeMonthBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Start the person's free month if they and this iPhone never had
    one. Always 200 with what happened (`free_month.Outcome.reason`) and
    the quota the app shows next."""
    user = desktop_session.user
    outcome = await free_month.start(
        session, user, device_token=body.deviceToken, development=body.development
    )
    return JSONResponse(
        {
            "outcome": outcome.reason,
            "endsAt": outcome.trial.ends_at.isoformat() if outcome.trial else None,
            "quota": await desktop.quota(session, user),
        }
    )


class NotificationBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    signedPayload: str = Field(min_length=1, max_length=200_000)


@router.post("/apple/notifications", name="desktop:apple_notifications")
async def apple_notifications(
    body: NotificationBody,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Apple's server notification. 200 once it is applied (or is one we
    do not act on), so Apple stops sending it; 400 when the signature does
    not check out."""
    try:
        outcome = await app_store.handle_notification(session, body.signedPayload)
    except AppStoreError as error:
        return _error(error)
    return JSONResponse({"ok": True, "outcome": outcome})
