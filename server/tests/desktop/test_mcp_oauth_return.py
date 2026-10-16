"""A connected app's sign-in finished by the app that opened it
(`simeon/desktop/mcp_oauth_return.py`, 15 October 2026): the iPhone or Mac
app names the sign-in, and the vendor's answer goes back to the app instead
of the web page, which finished it on whichever account the browser held."""

import httpx
import pytest

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from tests.desktop.test_endpoints import _signed_in

RETURN = "/desktop/api/mcp-oauth/return"
STATE = "vendor-stripe-0123456789abcdef"


@pytest.mark.asyncio
class TestSignInBackToTheApp:
    async def test_a_sign_in_the_app_named_goes_back_to_the_app_once(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        named = await client.post(
            RETURN,
            json={"state": STATE, "back": "simeon-ios"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert named.status_code == 200, named.text
        assert named.json()["code"] == 0

        back = await client.get(
            f"/desktop/mcp-oauth/callback?state={STATE}&code=c1&foo=bar"
        )
        assert back.status_code == 302
        assert back.headers["cache-control"] == "no-store"
        assert (
            back.headers["location"] == f"simeon-ios://mcp-oauth?state={STATE}&code=c1"
        )
        # Once: the same answer again goes where an unnamed one goes.
        again = await client.get(f"/desktop/mcp-oauth/callback?state={STATE}&code=c1")
        assert again.headers["location"] == (
            f"{settings.FRONTEND_BASE_URL}/app/connected.html?state={STATE}&code=c1"
        )

    async def test_a_refusal_goes_back_to_the_app_too(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        await client.post(
            RETURN,
            json={"state": STATE, "back": "simeon"},
            headers={"Authorization": f"Bearer {access}"},
        )
        refused = await client.get(
            f"/desktop/mcp-oauth/callback?state={STATE}&error=access_denied"
        )
        assert refused.headers["location"] == (
            f"simeon://mcp-oauth?state={STATE}&error=access_denied"
        )

    async def test_only_a_signed_in_app_and_only_its_own_schemes(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        anonymous = await client.post(
            RETURN, json={"state": STATE, "back": "simeon-ios"}
        )
        assert anonymous.status_code == 401
        access, _ = await _signed_in(client, session, user)
        elsewhere = await client.post(
            RETURN,
            json={"state": STATE, "back": "https"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert elsewhere.status_code == 422
        # Nothing named: the web app's page, as before.
        web = await client.get(f"/desktop/mcp-oauth/callback?state={STATE}&code=c1")
        assert "/app/connected.html" in web.headers["location"]
