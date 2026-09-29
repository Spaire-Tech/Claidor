"""The session cookie is `simeon_session`. A session made before the rename
carries `claidor_session`: it still signs the person in, and signing in
again or out clears it, so no session is left behind under the old name."""

import pytest
from fastapi.responses import RedirectResponse
from starlette.requests import Request

from simeon.auth.scope import Scope
from simeon.auth.service import auth as auth_service
from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession


def _request(cookies: dict[str, str]) -> Request:
    header = "; ".join(f"{name}={value}" for name, value in cookies.items())
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "scheme": "https",
            "server": ("api.simeonlabs.com", 443),
            "headers": [(b"cookie", header.encode())] if header else [],
        }
    )


async def _token(session: AsyncSession, user: User) -> str:
    token, _ = await auth_service._create_user_session(
        session, user, user_agent="test", scopes=[Scope.web_read]
    )
    return token


@pytest.mark.asyncio
class TestSessionCookie:
    async def test_the_new_name_signs_in(
        self, session: AsyncSession, user: User
    ) -> None:
        token = await _token(session, user)
        found = await auth_service.authenticate(
            session, _request({"simeon_session": token})
        )
        assert found is not None
        assert found.user_id == user.id

    async def test_the_earlier_name_still_signs_in(
        self, session: AsyncSession, user: User
    ) -> None:
        token = await _token(session, user)
        found = await auth_service.authenticate(
            session, _request({"claidor_session": token})
        )
        assert found is not None
        assert found.user_id == user.id

    async def test_new_tokens_carry_the_simeon_prefix(
        self, session: AsyncSession, user: User
    ) -> None:
        assert (await _token(session, user)).startswith("simeon_us_")

    async def test_signing_out_clears_both_names(
        self, session: AsyncSession, user: User
    ) -> None:
        token = await _token(session, user)
        request = _request({"claidor_session": token})
        user_session = await auth_service.authenticate(session, request)
        response = await auth_service.get_logout_response(
            session, request, user_session
        )
        assert isinstance(response, RedirectResponse)
        cleared = response.headers.getlist("set-cookie")
        assert any(
            c.startswith(f"{settings.USER_SESSION_COOKIE_KEY}=") for c in cleared
        )
        assert any(c.startswith("claidor_session=") for c in cleared)
        assert await auth_service.authenticate(session, request) is None
