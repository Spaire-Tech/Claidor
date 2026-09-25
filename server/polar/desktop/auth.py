"""Who the desktop app's caller is.

One bearer token, resolved one way. It lives here rather than beside the
routes because the connector routes (`polar.connectors.endpoints`) hang
off the same `/desktop` router and must authenticate a person exactly as
these do — the whole of `docs/maties/connectors.md` section 4 rests on
the server knowing, without argument, whose session a request carries.
A second way to answer that question would be a second way to get it
wrong.

The model proxy is the one exception, and it is written down below
rather than left to be discovered.
"""

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Request

from polar.auth.models import AuthSubject, Subject, is_user
from polar.auth.scope import Scope
from polar.models import DesktopSession, User
from polar.postgres import AsyncSession, get_db_session

from .service import DesktopUnauthenticated, desktop
from .tokens import is_desktop_access_token


def bearer_token(request: Request) -> str | None:
    """The app sends its access token as a bearer; the vendored client
    also has paths that send it as `x-api-key`, so both are read."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    api_key = request.headers.get("x-api-key", "").strip()
    return api_key or None


async def get_desktop_or_box_session(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> DesktopSession:
    """Any live session row behind the bearer: a signed-in desktop, the
    person's box (`is_box_credential`) or a cloud job (`is_job_token`).
    Only the profile route takes this one, because the box's host reads
    the person's name from it (`user-full-name-service.ts`)."""
    token = bearer_token(request)
    if token is None:
        raise DesktopUnauthenticated()
    found = await desktop.authenticate(session, token)
    if found is None:
        raise DesktopUnauthenticated("This desktop session has expired.")
    return found


async def get_desktop_session(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> DesktopSession:
    """The bearer's session, minus the box's credential.

    A box credential's access token is a `DesktopSession` row too, and
    until 25 September 2026 it reached every route on this router:
    connectors, memory, the maty queue, sign-out, and the box credential
    mint itself. It reaches the model proxy (`get_proxy_caller`) and the
    profile (`get_desktop_or_box_session`), which is what it is for, and
    nothing else. A cloud job's token keeps what it had: the runner lays
    the person's memory out with it and writes it back
    (`tests/maty/test_endpoints.py`), and `refresh` already refuses it.
    """
    found = await get_desktop_or_box_session(request, session)
    if found.is_box_credential:
        raise DesktopUnauthenticated(
            "The box's credential reaches the model proxy only. Sign in to the app."
        )
    return found


# --- the model proxy's caller ------------------------------------------------


@dataclass(frozen=True)
class ProxyCaller:
    """Whose allowance a model request spends, and — when there is one —
    which session it was sent from.

    `session_id` is None for a caller that holds no session. That is not a
    gap being papered over: `DesktopUsage.session_id` has always been
    nullable and `desktop.record_usage` has always taken `UUID | None`, so
    a sessionless caller meters exactly like any other. What is lost is
    only the ability to say which of a person's clients sent a given
    request, which a personal access token cannot answer anyway.
    """

    user: User
    session_id: UUID | None


def _token_subject(request: Request) -> AuthSubject[Subject] | None:
    """The auth subject the middleware already resolved, if any.

    `polar.auth.middlewares.get_auth_subject` runs for every request and
    has already looked a `claidor_pat_` token up, checked that it has not
    expired or been revoked, and attached the person and their scopes. So
    this reads that answer rather than asking a second time — a second way
    to check a token would be a second way to get it wrong.
    """
    return getattr(request.state, "auth_subject", None)


async def get_proxy_caller(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> ProxyCaller:
    """Two credentials reach the model proxy, and only the model proxy.

    **A desktop session.** What the app holds: an access token good for an
    hour, refreshed behind the person's back. Everything under `/desktop`
    takes this one.

    **A personal access token carrying `model_proxy`.** What a server
    holds. A program handed a credential once, storing it, with no refresh
    loop to run, cannot use a one-hour token: it would work for an hour
    and then answer 401 in the middle of somebody's conversation. Rakazo's
    OpenAI-compatible model connection is precisely that shape — the base
    URL, the model id and one static key, entered once
    (the Rakazo attempt, removed 18 September; see `docs/product/going-back-brief.md`).

    The scope is the whole grant. A token holding it reaches the three
    proxy routes, speech, and the model list; it reaches nothing else here,
    because every other route on this router asks for a session and this
    is not one.
    """
    token = bearer_token(request)
    if token is None:
        raise DesktopUnauthenticated()

    if is_desktop_access_token(token):
        found = await desktop.authenticate(session, token)
        if found is None:
            raise DesktopUnauthenticated("This desktop session has expired.")
        return ProxyCaller(user=found.user, session_id=found.id)

    auth_subject = _token_subject(request)
    if (
        auth_subject is not None
        and is_user(auth_subject)
        and Scope.model_proxy in auth_subject.scopes
    ):
        user = auth_subject.subject
        if not user.can_authenticate:
            raise DesktopUnauthenticated("This account cannot sign in.")
        return ProxyCaller(user=user, session_id=None)

    raise DesktopUnauthenticated(
        "This token does not reach the model proxy. Sign in to the app, or "
        "use a personal access token with the model_proxy scope."
    )


__all__ = [
    "ProxyCaller",
    "bearer_token",
    "get_desktop_or_box_session",
    "get_desktop_session",
    "get_proxy_caller",
]
