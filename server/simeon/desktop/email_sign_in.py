"""Signing in to the apps with an email (19 October 2026).

The iPhone's "Log in or sign up" (the founder's ChatGPT reference): an email,
then a code sent to it or the account's password. Both answer the pair
`/auth/apple` and `/auth/poll` give, `{accessToken, refreshToken}`, with no
browser in between. App Review signs in this way too: Apple asks for an
account to review with.

- `POST /auth/email/code` `{email}`: sends a code (the web's login codes,
  `simeon.login_code`: 6 letters and digits, 30 minutes). 202 whether or not
  an account has that email, so the answer never says who has one.
- `POST /auth/email/verify` `{email, code}`: the pair. A new email becomes a
  new account here, as the web's codes make one; the code proves the email.
  `APP_REVIEW_EMAIL` with `APP_REVIEW_OTP_CODE` is let in without an email
  (the login code service's own bypass).
- `POST /auth/email/password` `{email, password}`: the pair, for an account
  that has set a password. One sentence for every refusal (no account, no
  password, the wrong one), and the same work done for each
  (`simeon.desktop.passwords`), so it never says which.
- `GET`/`PUT /desktop/api/account/password`: whether the signed-in person has
  a password, and setting or changing it. Only a signed-in person can, so a
  password is never put on an account by someone who hasn't proved the email
  is theirs; a forgotten one is replaced the same way, after a code.

Limits per email (Redis, keyed by the email's hash): 5 codes sent and 10
wrong codes or passwords in 15 minutes; then 429 with a sentence. A right
answer clears the wrong ones.
"""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Literal
from urllib.parse import urlencode

import structlog
from email_validator import EmailNotValidError
from email_validator import validate_email as validate_email_syntax
from fastapi import Depends, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse

from simeon.auth.dependencies import WebUserOrAnonymous
from simeon.auth.models import is_user
from simeon.auth.service import auth as auth_service
from simeon.config import settings
from simeon.integrations.loops.service import loops as loops_service
from simeon.kit.email import validate_email
from simeon.kit.http import ReturnTo
from simeon.login_code.service import LoginCodeError
from simeon.login_code.service import login_code as login_code_service
from simeon.models import DesktopSession, User
from simeon.openapi import APITag
from simeon.postgres import AsyncSession, get_db_session
from simeon.posthog import posthog
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.user.repository import UserRepository

from . import passwords
from .auth import get_desktop_session
from .endpoints import client_version_of
from .language import answer_in_request_language
from .service import desktop, envelope_access_token

log = structlog.get_logger()

#: `/auth/email/*`, beside `/auth/apple`, and `/desktop/api/account/password`
#: (mounted on the app itself: the desktop router's module is imported here).
router = APIRouter(
    tags=["desktop", APITag.private],
    dependencies=[Depends(answer_in_request_language)],
)
#: `/v1/login-password/authenticate`: the web's password sign-in, beside the
#: web's login codes (`/v1/login-code`), on the API's `/v1` router.
web_router = APIRouter(
    prefix="/login-password",
    tags=["login_code", APITag.private],
    dependencies=[Depends(answer_in_request_language)],
)

NO_STORE = {"Cache-Control": "no-store"}

#: The window the limits count over, in seconds.
WINDOW_SECONDS = 15 * 60
CODES_PER_WINDOW = 5
FAILURES_PER_WINDOW = 10

WRONG_CODE = "That code is wrong or has expired. Check the email, or send a new one."
WRONG_PASSWORD = "Wrong email or password. If you've never set a password, use the code we email you."
TOO_MANY_CODES = "Too many codes asked for this email. Try again in a few minutes."
TOO_MANY_TRIES = "Too many tries for this email. Try again in a few minutes."
CLOSED = "This account can't sign in to Simeon."
BAD_EMAIL = "Enter a valid email address."

#: The longest field read from a body.
_FIELD_MAX = 512


def _fields(body: Any) -> dict[str, str]:
    if not isinstance(body, dict):
        return {}
    return {
        name: value.strip()[:_FIELD_MAX]
        for name, value in body.items()
        if isinstance(name, str) and isinstance(value, str)
    }


async def _body(request: Request) -> dict[str, str]:
    try:
        return _fields(await request.json())
    except Exception:
        return {}


def _address(raw: str) -> str | None:
    """The email as the server keeps it (the domain lower-cased), or None."""
    if not raw:
        return None
    try:
        return validate_email_syntax(raw, check_deliverability=False).normalized
    except EmailNotValidError:
        return None


def _refusal(error: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"error": error, "message": message}, status_code=status, headers=NO_STORE
    )


def _key(kind: str, email: str) -> str:
    digest = hashlib.sha256(email.lower().encode()).hexdigest()[:32]
    return f"desktop:auth:email:{kind}:{digest}"


async def _count(redis: Redis, key: str) -> int:
    count = int(await redis.incr(key))
    if count == 1:
        await redis.expire(key, WINDOW_SECONDS)
    return count


async def _locked(redis: Redis, email: str) -> bool:
    failures = await redis.get(_key("failed", email))
    return failures is not None and int(failures) >= FAILURES_PER_WINDOW


async def _signed_in(
    request: Request,
    session: AsyncSession,
    user: User,
    *,
    how: Literal["code", "password"],
    signup: bool,
) -> JSONResponse:
    if signup:
        posthog.user_signup(user, how)
        await loops_service.user_signup(user, emailLogin=True)
    else:
        posthog.user_login(user, how)
    desktop_session, access, refresh = await desktop.issue_app_session(
        session,
        user,
        user_agent=request.headers.get("User-Agent", ""),
        client_version=client_version_of(request),
    )
    log.info("desktop.sign_in.email", user_id=str(user.id), how=how, signup=signup)
    return JSONResponse(
        {
            "accessToken": envelope_access_token(desktop_session, access),
            "refreshToken": refresh,
        },
        headers=NO_STORE,
    )


@router.post("/auth/email/code", name="desktop:email_code")
async def email_code(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """A sign-in code to the email; 202 whether or not it has an account."""
    fields = await _body(request)
    address = _address(fields.get("email", ""))
    if address is None:
        return _refusal("bad_email", BAD_EMAIL, 400)
    try:
        # Its domain takes mail (the web's check); a blocking lookup, off the loop.
        await asyncio.to_thread(validate_email, address)
    except EmailNotValidError:
        return _refusal("bad_email", BAD_EMAIL, 400)
    if await _count(redis, _key("sent", address)) > CODES_PER_WINDOW:
        log.info("desktop.sign_in.email.code_limited")
        return _refusal("too_many", TOO_MANY_CODES, 429)
    code_model, code = await login_code_service.request(session, address)
    await login_code_service.send(code_model, code)
    return JSONResponse({"sent": True}, status_code=202, headers=NO_STORE)


@router.post("/auth/email/verify", name="desktop:email_verify")
async def email_verify(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """The code from the email: the pair, the account made if it is new."""
    fields = await _body(request)
    address = _address(fields.get("email", ""))
    # Codes are capitals and digits (`LOGIN_CODE_LENGTH`); a phone keyboard may not type capitals.
    code = "".join(fields.get("code", "").split()).upper()
    if address is None or not code:
        return _refusal("bad_request", WRONG_CODE, 400)
    if await _locked(redis, address):
        return _refusal("too_many", TOO_MANY_TRIES, 429)
    try:
        user, signup = await login_code_service.authenticate(
            session, code=code, email=address
        )
    except LoginCodeError:
        await _count(redis, _key("failed", address))
        return _refusal("wrong_code", WRONG_CODE, 400)
    if not user.can_authenticate:
        return _refusal("account_closed", CLOSED, 403)
    await redis.delete(_key("failed", address))
    return await _signed_in(request, session, user, how="code", signup=signup)


@router.post("/auth/email/password", name="desktop:email_password")
async def email_password(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """The account's password: the pair; one sentence for every refusal."""
    fields = await _body(request)
    address = _address(fields.get("email", ""))
    password = fields.get("password", "")
    if address is None or not password:
        return _refusal("wrong_password", WRONG_PASSWORD, 401)
    if await _locked(redis, address):
        return _refusal("too_many", TOO_MANY_TRIES, 429)
    user = await UserRepository.from_session(session).get_by_email(address)
    stored = user.password_hash if user is not None else None
    if not await passwords.verify_password_async(password, stored) or user is None:
        await _count(redis, _key("failed", address))
        return _refusal("wrong_password", WRONG_PASSWORD, 401)
    if not user.can_authenticate:
        return _refusal("account_closed", CLOSED, 403)
    await redis.delete(_key("failed", address))
    return await _signed_in(request, session, user, how="password", signup=False)


@router.get("/desktop/api/account/password", name="desktop:account_password")
async def account_password(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """Whether the signed-in person has a password (Settings › Account)."""
    return JSONResponse(
        {"set": desktop_session.user.password_hash is not None}, headers=NO_STORE
    )


@router.put("/desktop/api/account/password", name="desktop:account_password_set")
async def set_account_password(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Set or change the signed-in person's password; 400 with a sentence
    when it can't be used."""
    fields = await _body(request)
    password = fields.get("password", "")
    user = desktop_session.user
    problem = passwords.password_problem(password, user.email)
    if problem is not None:
        return _refusal("weak_password", problem, 400)
    had = user.password_hash is not None
    user.password_hash = await passwords.hash_password_async(password)
    session.add(user)
    log.info("desktop.account.password_set", user_id=str(user.id), changed=had)
    return JSONResponse({"set": True}, headers=NO_STORE)


@web_router.post("/authenticate", name="login_password:authenticate")
async def web_password(
    request: Request,
    return_to: ReturnTo,
    auth_subject: WebUserOrAnonymous,
    email: str = Form(""),
    password: str = Form(""),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> RedirectResponse:
    """app.simeonlabs.com's "Continue with password" (its `/login/password`
    form): the account's password gives the browser its session, as a code
    does (`/v1/login-code/authenticate`), and goes on to `return_to` (from
    the Mac app, its sign-in link). A refusal goes back to the form with the
    same one sentence, under the same per-email limits as the app's."""
    if is_user(auth_subject):
        return RedirectResponse(return_to, 303)

    def refused(message: str) -> RedirectResponse:
        query = urlencode({"return_to": return_to, "email": email, "error": message})
        url = settings.generate_frontend_url(f"/login/password?{query}")
        return RedirectResponse(url, 303)

    address = _address(email.strip()[:_FIELD_MAX])
    password = password[:_FIELD_MAX]
    if address is None or not password:
        return refused(WRONG_PASSWORD)
    if await _locked(redis, address):
        return refused(TOO_MANY_TRIES)
    user = await UserRepository.from_session(session).get_by_email(address)
    stored = user.password_hash if user is not None else None
    if not await passwords.verify_password_async(password, stored) or user is None:
        await _count(redis, _key("failed", address))
        return refused(WRONG_PASSWORD)
    if not user.can_authenticate:
        return refused(CLOSED)
    await redis.delete(_key("failed", address))
    posthog.user_login(user, "password")
    log.info("desktop.sign_in.email", user_id=str(user.id), how="password", web=True)
    response = await auth_service.get_login_response(
        session, request, user, return_to=return_to
    )
    # As the web's code sign-in does (`login_code/endpoints.py`): the session
    # written before the browser follows the redirect, or it can arrive first.
    await session.commit()
    return response
