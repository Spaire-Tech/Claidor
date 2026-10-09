"""The app's own sign-in, on Simeon.

`simeon.desktop.endpoints` serves the protocol the older desktop client
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
    2. With no Simeon session in the browser, that page sends the
       person to the API's own Google sign-in and asks to be returned
       to — the same hand-off `/desktop/login` makes. No web app is in
       the way (6 October 2026).
    3. With one, it **asks**. A sign-in confirmed by a bare GET would
       mean anybody who can get a signed-in person to open a link of
       their making ends up holding that person's session, because the
       verifier in the link is theirs. So the page states whose account
       it is about to hand over and to what, and no sign-in is written
       until the person posts the form back.

       Before it asks, it checks the person has a plan. With billing
       required (`SIMEON_DESKTOP_BILLING_REQUIRED`) and no trialing or
       active subscription in the synced copy of Stripe's
       (`simeon.plans`), the page sends the browser to the web app's
       billing page instead (the one thing the web app is for), with
       this very URL as the way back; the
       billing page opens Stripe Checkout, which takes a card, starts
       the 7-day trial, and returns here with `checkout_session_id`,
       which the page copies in before asking, so the gate opens even
       if Stripe's webhook is a few seconds behind. So nobody is signed
       in to the app without a card on file (`docs/services-billing.md`).
    4. The app, meanwhile, is polling `/auth/poll?uuid=…&verifier=…`.
       404 means « not yet » and it keeps waiting; 200 with a token
       pair means it is signed in.
    5. Later, near expiry, it posts `/oauth/token` with the refresh
       token and gets a new pair.

The access token it receives is the ordinary desktop access token
inside an envelope — see `envelope_access_token` in
`simeon.desktop.service` for what that is, why it is needed, and why it
does not add a second way to check a credential.
"""

from __future__ import annotations

import re
from html import escape
from typing import Any
from urllib.parse import quote, urlencode, urlparse

from fastapi import Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from simeon.auth.dependencies import WebUserOrAnonymous
from simeon.auth.models import is_user
from simeon.auth.service import auth as auth_service
from simeon.config import settings
from simeon.openapi import APITag
from simeon.plans.service import PlansError
from simeon.plans.service import plans as plans_service
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .allowance import BILLING_PATH
from .endpoints import client_version_of, sign_in_url
from .service import (
    DesktopUnauthenticated,
    desktop,
    envelope_access_token,
    is_deep_control_param,
)
from .sign_in_brand import (
    GOOGLE_G_SVG,
    MARK_PATH,
    MARK_VIEWBOX,
    WORDMARK_HEIGHT,
    WORDMARK_PNG_BASE64,
    WORDMARK_WIDTH,
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
#: stay as they are (docs/kept-names.md); this is the name
#: on a page somebody reads.
PRODUCT = "Simeon"


#: The ways in of the iPhone's sign-in screen (9 October 2026): its
#: buttons name one as `provider`, and the page sends the browser straight
#: to that sign-in. The Mac names none and signs in with Google, as before.
PROVIDERS = ("google", "apple")


def _provider(value: str | None) -> str:
    return value if value in PROVIDERS else "google"


def apple_sign_in_ready() -> bool:
    """Sign in with Apple needs Simeon's Services ID, team, key id and key
    on the server (`SIMEON_APPLE_CLIENT_ID`, `_TEAM_ID`, `_KEY_ID`,
    `_KEY_VALUE`). Until they are set the Apple button's page says so and
    offers Google, rather than sending the person to an Apple page that
    refuses them."""
    return all(
        (
            settings.APPLE_CLIENT_ID,
            settings.APPLE_TEAM_ID,
            settings.APPLE_KEY_ID,
            settings.APPLE_KEY_VALUE,
        )
    )


def _deep_link(redirect_target: str | None) -> str | None:
    if redirect_target is None:
        return None
    token = redirect_target.strip().lower()
    return f"{token}{DEEP_LINK_PATH}" if REDIRECT_TARGET.match(token) else None


def _page(
    title: str,
    body: str,
    *,
    actions: str = "",
    heading: bool = True,
    deep_link: str | None = None,
) -> HTMLResponse:
    """One page, in the design of the iPhone's sign-in screen (the founder,
    9 October 2026: "make sure everything match"): simeonlabs.com's mark and
    "SimeonLabs" wordmark in the middle, the page's words under them when it
    has any (`heading`), and its buttons at the foot in the app's own: the
    first in our blue, the next in the plain glass; light or dark as the
    device is. It is served
    from the API host, which has no front end of its own, so it carries
    everything it draws (`sign_in_brand`); no script but the one line that
    brings the app forward."""
    jump = (
        ""
        if deep_link is None
        else f'<script>location.replace("{escape(deep_link, quote=True)}")</script>'
    )
    foot = f'<footer class="actions">{actions}</footer>' if actions else ""
    return HTMLResponse(
        headers={"Cache-Control": "no-store"},
        content="<!doctype html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="color-scheme" content="light dark">'
        f"<title>{escape(title)} · {PRODUCT}</title>"
        "<style>"
        # The iPhone app's colours (ios/Simeon/Theme.swift: ground, primary,
        # secondary, blue) and its plain glass button's fill.
        ":root{--ground:#fcfcfc;--ink:#141414;--ink2:rgba(20,20,20,.6);"
        "--blue:#255a93;--glass:#ffffff;--glass-edge:rgba(20,20,20,.08);"
        '--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",'
        '"Helvetica Neue",Arial,sans-serif}'
        "@media (prefers-color-scheme:dark){:root{--ground:#070707;--ink:#fcfcfc;"
        "--ink2:rgba(252,252,252,.6);--blue:#2f6db0;--glass:#1f1f21;"
        "--glass-edge:rgba(255,255,255,.1)}}"
        "*{box-sizing:border-box}"
        "body{margin:0;min-height:100vh;min-height:100dvh;display:flex;"
        "flex-direction:column;align-items:center;background:var(--ground);"
        "color:var(--ink);font-family:var(--font);font-size:17px;line-height:1.4;"
        "-webkit-font-smoothing:antialiased;"
        "padding:max(24px,env(safe-area-inset-top)) 21px"
        " max(14px,env(safe-area-inset-bottom))}"
        "main{flex:1;width:100%;max-width:420px;display:flex;flex-direction:column;"
        "align-items:center;justify-content:center;text-align:center;padding:24px 0}"
        ".mark{display:block;width:46px;height:46px;fill:var(--ink)}"
        ".wordmark{display:block;margin-top:28px;height:25px;"
        f"aspect-ratio:{WORDMARK_WIDTH}/{WORDMARK_HEIGHT};background:var(--ink);"
        # The picture once, in a custom property both mask properties read.
        f"--wordmark:url(data:image/png;base64,{WORDMARK_PNG_BASE64});"
        "-webkit-mask:var(--wordmark) center/contain no-repeat;"
        "mask:var(--wordmark) center/contain no-repeat}"
        "h1{margin:44px 0 0;font-size:22px;font-weight:600;letter-spacing:-.01em;"
        "line-height:1.25;text-wrap:balance}"
        "p{margin:10px 0 0;font-size:15px;color:var(--ink2);text-wrap:pretty}"
        "strong{font-weight:600;color:var(--ink);word-break:break-word}"
        ".actions{width:100%;max-width:420px;display:flex;flex-direction:column;"
        "gap:12px;padding-bottom:8px}"
        "form{margin:0}"
        ".pill{display:flex;width:100%;height:50px;align-items:center;"
        "justify-content:center;gap:9px;padding:0 20px;border-radius:999px;"
        "border:0;background:var(--blue);color:#fff;font:inherit;"
        "font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;"
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        "box-shadow:0 1px 2px rgba(0,0,0,.12);"
        "-webkit-tap-highlight-color:transparent}"
        ".pill.glass{background:var(--glass);color:var(--ink);"
        "box-shadow:inset 0 0 0 1px var(--glass-edge),0 1px 3px rgba(0,0,0,.06)}"
        ".pill:active{opacity:.7}"
        ".pill svg{flex:none;width:15px;height:15px}"
        "</style></head><body>"
        "<main>"
        f'<svg class="mark" viewBox="{MARK_VIEWBOX}" role="img" aria-label="{PRODUCT}">'
        f'<path d="{MARK_PATH}"/></svg>'
        '<span class="wordmark" role="img" aria-label="SimeonLabs"></span>'
        f"{f'<h1>{escape(title)}</h1>' if heading else ''}{body}</main>"
        f"{foot}{jump}</body></html>",
    )


def _same_origin(request: Request) -> bool:
    """A cross-site POST cannot carry the session cookie, which is
    `SameSite=lax` (`simeon.auth.service`). This refuses the rest: a form
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


async def _copy_in_checkout(
    session: AsyncSession, user: Any, checkout_session_id: str
) -> bool:
    """The checkout that just sent the browser back: copied in now, so
    the plan it started counts before Stripe's webhook has landed. True
    when it is this person's own and made a subscription; a checkout
    that cannot be read (someone else's, a made-up id) is False, and the
    allowance decides."""
    try:
        return (
            await plans_service.sync_checkout_session(
                session, user, checkout_session_id
            )
            is not None
        )
    except PlansError:
        return False
    except Exception:
        return False


async def _needs_a_plan(session: AsyncSession, user: Any) -> bool:
    """Whether to send the person to the billing page before asking.
    Never with billing not required (development, a self-hosted server):
    then the free monthly allowance applies and there is nothing to
    buy."""
    allowance = await desktop.allowance(session, user)
    return allowance.none


@router.get("/loginDeepControl", name="desktop:deep_control", response_model=None)
async def login_deep_control(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    challenge: str = Query(default=""),
    uuid: str = Query(default=""),
    mode: str = Query(default="login"),
    redirectTarget: str | None = Query(default=None),  # the app's own name
    checkout_session_id: str | None = Query(default=None),  # back from Checkout
    provider: str | None = Query(default=None),  # the iPhone's button
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse | HTMLResponse:
    if not is_deep_control_param(uuid) or not is_deep_control_param(challenge):
        return _page(
            "That link is incomplete",
            f"<p>Open {PRODUCT} and sign in from there.</p>",
        )

    kept = {"challenge": challenge, "uuid": uuid, "mode": mode}
    if redirectTarget:
        kept["redirectTarget"] = redirectTarget
    if provider in PROVIDERS:
        kept["provider"] = provider
    return_to = settings.generate_external_url(f"/loginDeepControl?{urlencode(kept)}")

    if not is_user(auth_subject):
        way = _provider(provider)
        if way == "apple" and not apple_sign_in_ready():
            google = settings.generate_external_url(
                f"/loginDeepControl?{urlencode({**kept, 'provider': 'google'})}"
            )
            return _page(
                "Sign in with Apple is coming soon",
                "<p>For now, continue with Google.</p>",
                actions=f'<a class="pill glass" href="{escape(google, quote=True)}">'
                f"{GOOGLE_G_SVG}Continue with Google</a>",
            )
        return RedirectResponse(sign_in_url(request, return_to, way), 303)

    just_paid = bool(checkout_session_id) and await _copy_in_checkout(
        session, auth_subject.subject, checkout_session_id or ""
    )
    if await _needs_a_plan(session, auth_subject.subject):
        return RedirectResponse(
            settings.generate_frontend_url(
                f"{BILLING_PATH}?plan=standard&return_to={quote(return_to, safe='')}"
            ),
            303,
            headers=NO_STORE,
        )
    if just_paid:
        # The person left this very sign-in for the billing page, saved a
        # card there, and Stripe brought them back with the checkout's
        # own id, which only their browser was given. That is the
        # confirmation (the founder, 7 October 2026: "after buying the
        # plan, if I came from the app, it should sign me in directly in
        # the app"): the pair is written and the app, polling, signs in;
        # the page brings it forward. Asking "Sign in as …?" again here
        # was a second click for nothing.
        await desktop.begin_deep_control(
            session, auth_subject.subject, uuid=uuid, challenge=challenge
        )
        return _page(
            f"You're signed in to {PRODUCT}",
            f"<p>Your plan is on. You can close this tab and go back to {PRODUCT}.</p>",
            deep_link=_deep_link(redirectTarget),
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
    # Only the two buttons under the mark (the founder, 9 October 2026, of
    # the heading and the line that named the device: "its noise.
    # remove."). The tap itself stays, naming the account: without it,
    # whoever got a signed-in person to open a sign-in link of their own
    # making would be signed in as that person. The second form is for
    # the person this page is not about: the browser keeps the website's
    # own sign-in long after the app's, so signing out of the app and
    # opening this link again showed the same account with no way past it
    # (the founder, 6 October 2026). It ends the browser's session and goes
    # to the web login, with this very link as the way back.
    return _page(
        f"Sign in to {PRODUCT}",
        "",
        heading=False,
        actions=f'<form method="post" action="/loginDeepControl">{fields}'
        f'<button class="pill" type="submit">Continue as {email}</button></form>'
        f'<form method="post" action="/loginDeepControl/switch">{fields}'
        '<button class="pill glass" type="submit">Use a different account</button>'
        "</form>",
    )


@router.post(
    "/loginDeepControl/switch", name="desktop:deep_control_switch", response_model=None
)
async def switch_deep_control(
    request: Request,
    challenge: str = Form(default=""),
    uuid: str = Form(default=""),
    mode: str = Form(default="login"),
    redirectTarget: str | None = Form(default=None),  # the app's own name
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse | HTMLResponse:
    """Ends the browser's website session and sends the person to the web
    login, asking to be returned to the app's sign-in link. A POST from
    the page itself, like the confirmation: a cross-site link must not be
    able to sign somebody out of the website."""
    if (
        not _same_origin(request)
        or not is_deep_control_param(uuid)
        or not is_deep_control_param(challenge)
    ):
        return _page(
            "That sign-in could not be completed",
            f"<p>Open {PRODUCT} and try again.</p>",
        )
    kept = {"challenge": challenge, "uuid": uuid, "mode": mode}
    if redirectTarget:
        kept["redirectTarget"] = redirectTarget
    return_to = settings.generate_external_url(f"/loginDeepControl?{urlencode(kept)}")
    user_session = await auth_service.authenticate(session, request)
    if user_session is not None:
        await session.delete(user_session)
    response = RedirectResponse(
        settings.generate_frontend_url(f"/login?return_to={quote(return_to, safe='')}"),
        303,
        headers=NO_STORE,
    )
    return auth_service.clear_user_session_cookie(request, response)


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


# --- the window on the web ---------------------------------------------------


def _from_the_web_app(request: Request) -> bool:
    """Only the page at `FRONTEND_BASE_URL` (app.simeonlabs.com) may trade
    its cookie for the pair. The cookie is `SameSite=lax`, so a cross-site
    POST never carries it; this refuses the one that somehow does, and a
    request with no `Origin` at all, which no browser page sends."""
    origin = request.headers.get("Origin")
    if origin is None:
        return False
    theirs = urlparse(origin)
    mine = urlparse(settings.FRONTEND_BASE_URL)
    return (theirs.scheme, theirs.hostname, theirs.port) == (
        mine.scheme,
        mine.hostname,
        mine.port,
    )


@router.post("/auth/web-session", name="desktop:web_session")
async def web_session(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Simeon on the web (4 October 2026). The window at
    app.simeonlabs.com is the Mac app's window, and it speaks the Mac's
    protocol: a bearer on `/desktop/*` and the box broker, refreshed at
    `/oauth/token`. The person is already signed in there with the web
    cookie, so this trades the cookie for that pair, on a session row
    marked `web` (`DesktopSession.client_kind`). 401 with no cookie, 403
    from anywhere but the web app. The answer is the shape `/auth/poll`
    gives the Mac, so one client reads both."""
    if not _from_the_web_app(request):
        return JSONResponse(
            {"error": "forbidden_origin"}, status_code=403, headers=NO_STORE
        )
    if not is_user(auth_subject):
        return JSONResponse(
            {"error": "unauthenticated"}, status_code=401, headers=NO_STORE
        )
    desktop_session, access, refresh = await desktop.issue_web_session(
        session,
        auth_subject.subject,
        user_agent=request.headers.get("User-Agent", ""),
    )
    return JSONResponse(
        {
            "accessToken": envelope_access_token(desktop_session, access),
            "refreshToken": refresh,
            "expiresAt": desktop_session.access_expires_at.isoformat(),
        },
        headers=NO_STORE,
    )


#: What a vendor's OAuth callback may carry on to the page: the code and
#: state of the sign-in, or the refusal. Nothing else travels.
_MCP_OAUTH_PARAMS = ("state", "code", "error", "error_description")


@router.get("/desktop/mcp-oauth/callback", name="desktop:mcp_oauth_callback")
async def mcp_oauth_callback(request: Request) -> RedirectResponse:
    """Where a connected app's sign-in started from Simeon on the web comes
    back (4 October 2026). On a Mac the app registers
    `http://localhost:8787/callback` with the vendor and listens there
    (`shared/node/mcp/mcp-oauth-loopback.ts`); a browser page cannot, so
    the box registers this address instead
    (`host/extensions/mcp/mcp-service.ts`, `hostedMcpOAuthCallbackUrl`).
    The vendor lands here with the code and the state; the page at
    `/app/connected.html` on the web app hands them to the box that started
    the sign-in, which holds the PKCE verifier and nothing else can. The
    code is single-use and bound to that verifier, so carrying it through
    the redirect gives a bystander nothing."""
    kept = [
        (name, value)
        for name, value in request.query_params.multi_items()
        if name in _MCP_OAUTH_PARAMS
    ]
    target = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/app/connected.html"
    if kept:
        target = f"{target}?{urlencode(kept)}"
    return RedirectResponse(target, status_code=302, headers=NO_STORE)


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

    The upstream app's protocol carries the PKCE verifier in the query string,
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
    """The box's own renewal (25 September 2026). The upstream app's host renews
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
