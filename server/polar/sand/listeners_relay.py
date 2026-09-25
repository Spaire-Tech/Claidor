"""The five JSON routes of Cursor's listener relay, on Simeon Labs'
server (25 September 2026). The box's host calls every one with its
own credential, so each takes `get_desktop_or_box_session`.

| Route | Caller | Cadence |
|---|---|---|
| `POST /sand/listener-subscriptions` | `backend-relay-source.ts` `ensureRegistered` | every 5 min, and on change |
| `POST /sand/listener-events/poll` | `backend-relay-source.ts` `tick` | every 4 s, or on a `listener-events` notify |
| `POST /sand/automation-events/poll` | `sand-automation-fire-consumer.ts` `tick` | every 15 s, or on an `automation-fires` notify |
| `POST /sand/automation-runs/complete` | the consumer, per run | — |
| `POST /sand/listener-webhooks/{platform}` | (ours) the person's Linear/Sentry/PagerDuty webhook | once |

Every body and answer is spelled the way that code reads it; a wrong
field name here is a silent listener there.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from polar.config import settings
from polar.desktop.auth import get_desktop_or_box_session
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .listeners_connections import (
    describe_github_subscription,
    describe_slack_subscription,
)
from .listeners_service import NEXT_POLL_AFTER_MS, WEBHOOK_PLATFORMS, listeners

log = structlog.get_logger()

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)


async def _body(request: Request) -> dict[str, Any]:
    try:
        decoded = await request.json()
    except ValueError:
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _string_list(value: object) -> list[str]:
    return (
        [entry for entry in value if isinstance(entry, str)]
        if isinstance(value, list)
        else []
    )


@router.post("/sand/listener-subscriptions", name="sand:listener_subscriptions")
async def listener_subscriptions(
    request: Request,
    caller: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    body = await _body(request)
    row = await listeners.register_subscriptions(session, caller.user_id, body)
    slack = await describe_slack_subscription(
        session, caller.user_id, row.slack_channels
    )
    github = await describe_github_subscription(
        session, caller.user_id, row.github_repos
    )
    log.info(
        "sand.listeners.subscribed",
        user_id=str(caller.user_id),
        slack_channels=row.slack_channels,
        slack_status=slack["status"],
        github_repos=row.github_repos,
        github_status=github["status"],
    )
    return JSONResponse({"slack": slack, "github": github})


@router.post("/sand/listener-events/poll", name="sand:listener_events_poll")
async def listener_events_poll(
    request: Request,
    caller: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    body = await _body(request)
    events = await listeners.poll_relay_events(
        session, caller.user_id, _string_list(body.get("ackIds"))
    )
    return JSONResponse({"events": events})


@router.post("/sand/automation-events/poll", name="sand:automation_events_poll")
async def automation_events_poll(
    request: Request,
    caller: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    body = await _body(request)
    events = await listeners.poll_fires(
        session, caller.user_id, _string_list(body.get("ackRunUuids"))
    )
    return JSONResponse({"events": events, "nextPollAfterMs": NEXT_POLL_AFTER_MS})


@router.post("/sand/automation-runs/complete", name="sand:automation_runs_complete")
async def automation_runs_complete(
    request: Request,
    caller: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    body = await _body(request)
    run_uuid = body.get("runUuid")
    status = body.get("status")
    if not isinstance(run_uuid, str) or status not in ("succeeded", "failed"):
        return JSONResponse(
            {"error": "runUuid and a status of succeeded or failed are required"},
            status_code=400,
        )
    error_message = (
        body.get("errorMessage") if isinstance(body.get("errorMessage"), str) else None
    )
    found = await listeners.complete_fire(
        session, caller.user_id, run_uuid, status, error_message
    )
    if not found:
        # The consumer treats 404 as settled, which is what a run nobody
        # remembers deserves.
        return JSONResponse({"error": "no such run"}, status_code=404)
    return JSONResponse({})


@router.post("/sand/listener-webhooks/{platform}", name="sand:listener_webhook_mint")
async def listener_webhook_mint(
    platform: str,
    caller: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The URL a person pastes into Linear, Sentry or PagerDuty, and the
    secret those services sign with. Minted once per person per platform;
    asking again answers the same."""
    if platform not in WEBHOOK_PLATFORMS:
        return JSONResponse(
            {"error": f"{platform} takes no inbound webhook here"}, status_code=404
        )
    row = await listeners.ensure_webhook_connection(session, caller.user_id, platform)
    url = settings.generate_external_url(
        f"/sand/ingress/{platform}/{row.webhook_token}"
    )
    log.info(
        "sand.listeners.webhook_minted", user_id=str(caller.user_id), platform=platform
    )
    return JSONResponse(
        {"platform": platform, "url": url, "signingSecret": row.signing_secret}
    )
