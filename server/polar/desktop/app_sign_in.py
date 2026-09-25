"""The app's own sign-in, on Claidor.

`polar.desktop.endpoints` serves the protocol the older desktop client
spoke: `/desktop/login`, a code, `/desktop/api/auth/exchange`. The app
in `desktop/` speaks a different one, and it is not ours to change — it
is the reconstruction's, read from
`desktop/source/packages/cursor-config/auth/login.ts` and
`desktop/source/electron-main/account/cursor-auth.ts`. So this module
answers it, on the same server, with the same sessions.

Three routes, and they must sit at the **root**. The app builds every
one of them with `new URL("/auth/poll", backendUrl)` or by concatenating
onto a base it has stripped of trailing slashes, and a leading slash
throws away whatever path a base URL carried. `/desktop/auth/poll`
would never be called.

    1. The app opens `{websiteUrl}/loginDeepControl?challenge=…&uuid=…`
       in the browser. The challenge is `base64url(sha256(verifier))`
       for a verifier only the app holds.
    2. With no Claidor session in the browser, that page sends the
       person to the web login and asks to be returned to — the same
       hand-off `/desktop/login` makes.
    3. With one, it **asks**. A sign-in confirmed by a bare GET would
       mean anybody who can get a signed-in person to open a link of
       their making ends up holding that person's session, because the
       verifier in the link is theirs. So the page states whose account
       it is about to hand over and to what, and nothing is written
       until the person posts the form back.
    4. The app, meanwhile, is polling `/auth/poll?uuid=…&verifier=…`.
       404 means « not yet » and it keeps waiting; 200 with a token
       pair means it is signed in.
    5. Later, near expiry, it posts `/oauth/token` with the refresh
       token and gets a new pair.

The access token it receives is the ordinary desktop access token
inside an envelope — see `envelope_access_token` in
`polar.desktop.service` for what that is, why it is needed, and why it
does not add a second way to check a credential.
"""

from __future__ import annotations

import re
from html import escape
from urllib.parse import quote, urlencode, urlparse

from fastapi import Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from polar.auth.dependencies import WebUserOrAnonymous
from polar.auth.models import is_user
from polar.config import settings
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .endpoints import client_version_of
from .service import (
    DesktopUnauthenticated,
    desktop,
    envelope_access_token,
    is_deep_control_param,
)

router = APIRouter(tags=["desktop", APITag.private])

#: The app's own protocol-token rule, copied from
#: `desktop/source/electron-main/auth/auth-callback-registration.ts`.
#: `redirectTarget` is a URL scheme and never a URL, so this is the
#: whole of what may be built into one.
REDIRECT_TARGET = re.compile(r"^[a-z][a-z0-9+.-]{1,31}$")

#: The deep link the app parses and acts on — `parseSandDeepLink` in
#: `desktop/source/shared/deep-link.ts` accepts `open` and brings the
#: window forward. There is no auth route in that parser and none is
#: needed: the app learns it is signed in by polling, not by the link.
DEEP_LINK_PATH = "://app/v1/open"

#: Tokens and the pages that lead to them are never anybody's to keep —
#: `/auth/poll` in particular is a GET that mints a session, and a cache
#: in front of it holding onto one 200 would hand it to the next caller.
NO_STORE = {"Cache-Control": "no-store"}

#: What the app calls itself to the person. The internal identifiers
#: stay as they are (`docs/product/direction.md` §0); this is the name
#: on a page somebody reads.
PRODUCT = "Simeon"


def _deep_link(redirect_target: str | None) -> str | None:
    if redirect_target is None:
        return None
    token = redirect_target.strip().lower()
    return f"{token}{DEEP_LINK_PATH}" if REDIRECT_TARGET.match(token) else None


def _page(title: str, body: str, *, deep_link: str | None = None) -> HTMLResponse:
    """One page, no assets, no scripts beyond the one line that brings
    the app forward. It is served from the API host, which has no
    front end of its own, so it carries its own styling or none."""
    jump = (
        ""
        if deep_link is None
        else f'<script>location.replace("{escape(deep_link, quote=True)}")</script>'
    )
    return HTMLResponse(
        headers={"Cache-Control": "no-store"},
        content="<!doctype html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)} · {PRODUCT}</title>"
        "<style>"
        ":root{color-scheme:light dark}"
        "body{margin:0;min-height:100vh;display:grid;place-items:center;"
        "font:16px/1.55 ui-sans-serif,-apple-system,system-ui,sans-serif;"
        "background:Canvas;color:CanvasText}"
        "main{max-width:26rem;padding:2rem;text-align:left}"
        "h1{font-size:1.25rem;margin:0 0 .75rem}"
        "p{margin:0 0 1rem;opacity:.85}"
        "button{font:inherit;font-weight:600;padding:.6rem 1.1rem;border:0;"
        "border-radius:.5rem;background:CanvasText;color:Canvas;cursor:pointer}"
        "code{opacity:.7;font-size:.85em}"
        "</style></head><body><main>"
        f"<h1>{escape(title)}</h1>{body}"
        f"</main>{jump}</body></html>",
    )


def _same_origin(request: Request) -> bool:
    """A cross-site POST cannot carry the session cookie, which is
    `SameSite=lax` (`polar.auth.service`). This refuses the rest: a form
    posted from another origin that somehow does.

    Both the configured external origin and the one this very request
    arrived on count, so a deployment reached by more than one name
    does not start refusing its own form."""
    origin = request.headers.get("Origin")
    if origin is None:
        return True
    theirs = urlparse(origin)
    mine = urlparse(settings.generate_external_url("/"))
    ours = {
        (mine.scheme, mine.hostname, mine.port),
        (request.url.scheme, request.url.hostname, request.url.port),
    }
    return (theirs.scheme, theirs.hostname, theirs.port) in ours


# --- the browser's half ----------------------------------------------------


@router.get("/loginDeepControl", name="desktop:deep_control", response_model=None)
async def login_deep_control(
    auth_subject: WebUserOrAnonymous,
    challenge: str = Query(default=""),
    uuid: str = Query(default=""),
    mode: str = Query(default="login"),
    redirectTarget: str | None = Query(default=None),  # the app's own name
) -> RedirectResponse | HTMLResponse:
    if not is_deep_control_param(uuid) or not is_deep_control_param(challenge):
        return _page(
            "That link is incomplete",
            f"<p>Open {PRODUCT} and sign in from there.</p>",
        )

    if not is_user(auth_subject):
        kept = {"challenge": challenge, "uuid": uuid, "mode": mode}
        if redirectTarget:
            kept["redirectTarget"] = redirectTarget
        return_to = settings.generate_external_url(
            f"/loginDeepControl?{urlencode(kept)}"
        )
        return RedirectResponse(
            settings.generate_frontend_url(
                f"/login?return_to={quote(return_to, safe='')}"
            ),
            303,
        )

    email = escape(auth_subject.subject.email)
    fields = "".join(
        f'<input type="hidden" name="{name}" value="{escape(value, quote=True)}">'
        for name, value in (
            ("challenge", challenge),
            ("uuid", uuid),
            ("mode", mode),
            ("redirectTarget", redirectTarget or ""),
        )
        if value
    )
    return _page(
        f"Sign in to {PRODUCT}?",
        f"<p>{PRODUCT} on your Mac is asking to sign in as <strong>{email}</strong>."
        " Only continue if you just asked it to.</p>"
        f'<form method="post" action="/loginDeepControl">{fields}'
        f'<button type="submit">Sign in as {email}</button></form>',
    )


@router.post("/loginDeepControl", name="desktop:deep_control_confirm")
async def confirm_deep_control(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    challenge: str = Form(default=""),
    uuid: str = Form(default=""),
    redirectTarget: str | None = Form(default=None),  # the app's own name
    session: AsyncSession = Depends(get_db_session),
) -> HTMLResponse:
    if (
        not _same_origin(request)
        or not is_user(auth_subject)
        or not is_deep_control_param(uuid)
        or not is_deep_control_param(challenge)
    ):
        return _page(
            "That sign-in could not be completed",
            f"<p>Open {PRODUCT} and try again.</p>",
        )

    await desktop.begin_deep_control(
        session, auth_subject.subject, uuid=uuid, challenge=challenge
    )
    return _page(
        f"You're signed in to {PRODUCT}",
        f"<p>You can close this tab and go back to {PRODUCT}.</p>",
        deep_link=_deep_link(redirectTarget),
    )


# --- the app's half --------------------------------------------------------


@router.get("/auth/poll", name="desktop:deep_control_poll")
async def auth_poll(
    request: Request,
    uuid: str = Query(default=""),
    verifier: str = Query(default=""),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """404 until the person has confirmed in the browser, then once with
    the pair. The app reads 404 as « keep waiting » and resets its error
    count on it, so it must not be an error shape.

    Grok Bot's protocol carries the PKCE verifier in the query string,
    which lands in every access log (F-258). Since 25 September 2026 the
    app posts it instead (`/auth/poll` with a JSON body, below); this GET
    stays for a build from before that day."""
    return await _auth_poll(request, session, uuid=uuid, verifier=verifier)


@router.post("/auth/poll", name="desktop:deep_control_poll_post")
async def auth_poll_post(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The same poll with `{uuid, verifier}` in the body, so the verifier
    is never written to an access log."""
    try:
        body = await request.json()
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    return await _auth_poll(
        request,
        session,
        uuid=str(body.get("uuid") or ""),
        verifier=str(body.get("verifier") or ""),
    )


async def _auth_poll(
    request: Request, session: AsyncSession, *, uuid: str, verifier: str
) -> JSONResponse:
    issued = await desktop.complete_deep_control(
        session,
        uuid=uuid,
        verifier=verifier,
        user_agent=request.headers.get("User-Agent", ""),
        client_version=client_version_of(request),
    )
    if issued is None:
        return JSONResponse({"error": "not_found"}, status_code=404, headers=NO_STORE)
    desktop_session, access, refresh = issued
    return JSONResponse(
        {
            "accessToken": envelope_access_token(desktop_session, access),
            "refreshToken": refresh,
        },
        headers=NO_STORE,
    )


@router.post("/oauth/token", name="desktop:deep_control_refresh")
async def oauth_token(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    """The refresh the app runs behind the person's back.

    Its reading of the answer is worth knowing before changing any
    status here. A non-2xx revokes the stored credentials and shows
    « we couldn't confirm your sign-in ». A 200 carrying
    `shouldLogout` is the gentler « your session ended ». So a refresh
    token that is simply spent or expired gets the second, and only a
    request that is malformed gets the first.
    """
    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        return JSONResponse(
            {"error": "invalid_request"}, status_code=400, headers=NO_STORE
        )

    grant_type = body.get("grant_type")
    if grant_type != "refresh_token":
        return JSONResponse(
            {"error": "unsupported_grant_type"}, status_code=400, headers=NO_STORE
        )

    refresh_token = body.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        return JSONResponse(
            {"error": "invalid_request"}, status_code=400, headers=NO_STORE
        )

    try:
        desktop_session, access, new_refresh = await desktop.refresh(
            session, refresh_token
        )
    except DesktopUnauthenticated:
        return JSONResponse(
            {"shouldLogout": True, "error": "invalid_grant"}, headers=NO_STORE
        )

    return JSONResponse(
        {
            "access_token": envelope_access_token(desktop_session, access),
            "refresh_token": new_refresh,
        },
        headers=NO_STORE,
    )


@router.post("/sand-box/inference-credential", name="desktop:box_inference_credential")
async def box_inference_credential(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    """The box's own renewal (25 September 2026). Grok Bot's host renews
    its inference credential at this path on its backend
    (`desktop/source/host/extensions/auth/credential-renewer.ts`,
    `RENEWAL_PATH`, `{credential}` in, `{accessToken, expiresAtMs}`
    out), and it builds the path with a leading slash, so it lives at
    the root like the sign-in routes. The credential is the one the Mac
    asked for at `/desktop/api/box/renewal-credential` and wrote into
    the box's token file; a box that outlives the app (routines fire
    while the Mac is awake) renews here every hour without the Mac. A
    refused credential is a 401, which the renewer reports and retries
    with backoff; nothing here signs the desktop out.
    """
    try:
        body = await request.json()
    except Exception:
        body = None
    credential = body.get("credential") if isinstance(body, dict) else None
    if not isinstance(credential, str) or not credential:
        return JSONResponse(
            {"error": "invalid_request"}, status_code=400, headers=NO_STORE
        )
    try:
        row, access = await desktop.renew_box_access(session, credential)
    except DesktopUnauthenticated as error:
        return JSONResponse(
            {"error": "invalid_grant", "message": error.message},
            status_code=401,
            headers=NO_STORE,
        )
    return JSONResponse(
        {
            "accessToken": envelope_access_token(row, access),
            "expiresAtMs": int(row.access_expires_at.timestamp() * 1000),
        },
        headers=NO_STORE,
    )


__all__ = ["router"]
