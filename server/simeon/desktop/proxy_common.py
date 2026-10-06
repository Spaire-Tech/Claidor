"""What every metered door on the desktop server shares.

The model proxy (`endpoints.py`) and the agent's other calls
(`capabilities.py`) answer errors in one shape, log a provider's refusal
in one place, and write a usage row the same way. Kept here so the two
modules need nothing from each other.
"""

from __future__ import annotations

import httpx
import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

from simeon.config import settings
from simeon.kit.db.postgres import AsyncSessionMaker
from simeon.models import User
from simeon.postgres import AsyncSession

from .allowance import Allowance, billing_url
from .auth import ProxyCaller
from .service import (
    HOURLY_BUDGET_CODE,
    QUOTA_EXHAUSTED_CODE,
    DesktopModel,
    Usage,
    desktop,
)

log = structlog.get_logger()

#: The one line to read when something fails through the proxy: the
#: provider's own sentence, in full. See `log_upstream_refusal`.
UPSTREAM_REFUSED = "desktop.proxy.upstream_refused"
REFUSAL_LOG_LIMIT = 1000


def upstream_timeout() -> httpx.Timeout:
    return httpx.Timeout(600.0, connect=30.0)


def error_response(kind: str, message: str, status: int) -> JSONResponse:
    """The error shape both wires use. Anthropic's and OpenAI's own error
    bodies are already this shape, so the app reads ours the same way it
    reads theirs."""
    return JSONResponse(
        {"error": {"type": kind, "message": message}}, status_code=status
    )


def quota_exhausted_response(allowance: Allowance | None = None) -> JSONResponse:
    """The allowance is spent, or there is none. One code, 40200, which
    the app's voice, search and image code already read as « credits
    exhausted »; a sentence that says what kind of allowance it was and
    where to go. The app shows the sentence as it is."""
    url = billing_url()
    if allowance is None or allowance.free:
        message = (
            f"Monthly credits exhausted (code {QUOTA_EXHAUSTED_CODE}). "
            "The allowance resets at the start of next month."
        )
    elif allowance.none:
        message = (
            f"No active plan (code {QUOTA_EXHAUSTED_CODE}). "
            f"Choose a plan at {url} to keep going."
        )
    elif allowance.trialing:
        message = (
            f"Your trial credits are used up (code {QUOTA_EXHAUSTED_CODE}). "
            f"Choose a plan at {url} to keep going."
        )
    else:
        resets = allowance.period_end.strftime("%A %-d %B at %H:%M UTC")
        message = (
            f"This week's credits are used (code {QUOTA_EXHAUSTED_CODE}). "
            f"They reset on {resets}. Upgrade at {url} to keep going now."
        )
    return JSONResponse(
        {
            "error": {
                "type": "quota_exhausted",
                "code": QUOTA_EXHAUSTED_CODE,
                "message": message,
            }
        },
        status_code=402,
    )


def hourly_budget_response(used: int, limit: int) -> JSONResponse:
    """The hourly brake. Same shape and status as the monthly refusal,
    its own code, and a sentence a person can act on."""
    return JSONResponse(
        {
            "error": {
                "type": "quota_exhausted",
                "code": HOURLY_BUDGET_CODE,
                "message": (
                    f"Hourly spending budget reached (code {HOURLY_BUDGET_CODE}): "
                    f"{used:,} of {limit:,} credits in the last hour. "
                    "The agent stops here; it can continue as the hour passes."
                ),
            }
        },
        status_code=402,
    )


async def budget_refusal(session: AsyncSession, user: User) -> JSONResponse | None:
    """The two spending refusals every metered door makes before calling
    a provider: the plan's allowance (the week, the trial, or none), then
    the sliding hour. Checked in that order so a spent allowance still
    says so."""
    allowance = await desktop.allowance(session, user)
    if await desktop.exhausted(session, user, allowance=allowance):
        return quota_exhausted_response(allowance)
    if await desktop.hourly_exhausted(session, user):
        used = await desktop.credits_used_last_hour(session, user.id)
        return hourly_budget_response(used, settings.DESKTOP_HOURLY_CREDITS)
    return None


def log_upstream_refusal(model: DesktopModel, status: int, body: bytes | None) -> None:
    """Write down why the model service refused, in full, once.

    Without this the reason is lost: the body is handed back to the app,
    the app's engine reduces it to a failure kind, and what reaches the
    person is « 400 terminated » — a status and a word, with the sentence
    that says what is actually wrong nowhere at all. That was the state on
    13 September, when GPT models failed and nothing anywhere recorded
    OpenAI's own explanation. One line here ended two hours of guessing.

    The body is the provider's error text. It carries no key: the key goes
    up in a header, and a provider does not echo it back.
    """
    text = (body or b"").decode(errors="replace").strip()
    log.warning(
        UPSTREAM_REFUSED,
        provider=model.provider.value,
        model=model.model_id,
        status=status,
        body=text[:REFUSAL_LOG_LIMIT] or "(empty)",
        truncated=len(text) > REFUSAL_LOG_LIMIT,
    )


async def record_usage_row(
    request: Request,
    session: AsyncSession,
    caller: ProxyCaller,
    model: DesktopModel,
    usage: Usage,
    upstream_status: int,
) -> None:
    """One usage row, written so that it survives the request.

    On a fresh session from the app's sessionmaker where there is one, so
    a row is committed even when the response that follows fails; on the
    request's own session otherwise, which the framework commits at the
    end. A lost row must never cost the person their answer, so the
    caller wraps this and logs rather than raises.
    """
    sessionmaker: AsyncSessionMaker | None = getattr(
        request.state, "async_sessionmaker", None
    )
    if sessionmaker is None:
        await desktop.record_usage(
            session,
            user_id=caller.user.id,
            session_id=caller.session_id,
            model=model,
            usage=usage,
            stream=False,
            upstream_status=upstream_status,
        )
        return
    async with sessionmaker() as fresh:
        await desktop.record_usage(
            fresh,
            user_id=caller.user.id,
            session_id=caller.session_id,
            model=model,
            usage=usage,
            stream=False,
            upstream_status=upstream_status,
        )
        await fresh.commit()
