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

from polar.kit.db.postgres import AsyncSessionMaker
from polar.postgres import AsyncSession

from .auth import ProxyCaller
from .service import QUOTA_EXHAUSTED_CODE, DesktopModel, Usage, desktop

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


def quota_exhausted_response() -> JSONResponse:
    return JSONResponse(
        {
            "error": {
                "type": "quota_exhausted",
                "code": QUOTA_EXHAUSTED_CODE,
                "message": (
                    f"Monthly credits exhausted (code {QUOTA_EXHAUSTED_CODE}). "
                    "The allowance resets at the start of next month."
                ),
            }
        },
        status_code=402,
    )


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
