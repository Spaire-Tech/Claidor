"""The four connector routes, end to end over HTTP
(`polar/connectors/endpoints.py`, `polar/connectors/service.py`).

Three things are checked here that cannot be checked anywhere else: the
gate answers on every route, an unconfigured Claidor says so rather than
failing, and — the one the whole design rests on — the person an MCP
conversation is about is the person holding the session token, whatever
the request says about it.

Requires the full suite's fixtures (a database, fakeredis, the app), so
unlike `test_pipedream.py` it does not run under `--noconftest`.
"""

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from polar.config import settings
from polar.connectors.pipedream import API_BASE_URL, MCP_BASE_URL
from polar.desktop.service import desktop
from polar.models import User
from polar.postgres import AsyncSession

PROJECT_ID = "proj_test"
ACCOUNTS_URL = f"{API_BASE_URL}/connect/{PROJECT_ID}/accounts"
TOKENS_URL = f"{API_BASE_URL}/connect/{PROJECT_ID}/tokens"
OAUTH_URL = f"{API_BASE_URL}/oauth/token"

CONNECT_LINK = (
    "https://pipedream.com/_static/connect.html?token=ctok_1&connectLink=true"
)


def configure(mocker: MockerFixture) -> None:
    """A Claidor with a connection service behind it."""
    mocker.patch.object(settings, "PIPEDREAM_CLIENT_ID", "pd-client-id")
    mocker.patch.object(settings, "PIPEDREAM_CLIENT_SECRET", "pd-client-secret")
    mocker.patch.object(settings, "PIPEDREAM_PROJECT_ID", PROJECT_ID)
    mocker.patch.object(settings, "PIPEDREAM_ENVIRONMENT", "development")


def entitle(mocker: MockerFixture, user: User) -> None:
    mocker.patch.object(settings, "CONNECTORS_ENTITLED_EMAILS", {user.email})


async def signed_in(session: AsyncSession, user: User) -> str:
    """The desktop access token the app would be holding."""
    _, access, _ = await desktop._issue_session(session, user)
    await session.commit()
    return access


def pipedream(mock: respx.MockRouter, **_: object) -> dict[str, respx.Route]:
    """Their four endpoints, answering plausibly."""
    return {
        "oauth": mock.post(OAUTH_URL).mock(
            return_value=httpx.Response(
                200, json={"access_token": "pd-developer-token", "expires_in": 3600}
            )
        ),
        "accounts": mock.get(ACCOUNTS_URL).mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "apn_one",
                            "created_at": "2026-09-01T10:00:00Z",
                            "app": {"name_slug": "gmail"},
                        }
                    ],
                    "page_info": {"count": 1},
                },
            )
        ),
        "tokens": mock.post(TOKENS_URL).mock(
            return_value=httpx.Response(
                200,
                json={
                    "token": "ctok_1",
                    "expires_at": "2026-09-11T16:00:00Z",
                    "connect_link_url": CONNECT_LINK,
                },
            )
        ),
        "delete": mock.delete(f"{ACCOUNTS_URL}/apn_one").mock(
            return_value=httpx.Response(204)
        ),
    }


@pytest.mark.asyncio
class TestTheGate:
    async def test_no_session_token_is_a_401(self, client: httpx.AsyncClient) -> None:
        assert (await client.get("/desktop/api/connectors")).status_code == 401

    async def test_a_person_who_is_not_entitled_is_refused_on_every_route(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The gate is the server's, not the app's: a patched client gets
        the same 402 from all four."""
        configure(mocker)
        access = await signed_in(session, user)
        headers = {"Authorization": f"Bearer {access}"}

        with respx.mock(assert_all_called=False) as mock:
            pipedream(mock)
            answers = [
                await client.get("/desktop/api/connectors", headers=headers),
                await client.post(
                    "/desktop/api/connectors/gmail/link", headers=headers
                ),
                await client.delete("/desktop/api/connectors/apn_one", headers=headers),
                await client.post(
                    "/desktop/api/connectors/mcp/gmail", headers=headers, json={}
                ),
            ]
            assert not mock.calls, "nothing should reach the provider"

        assert [one.status_code for one in answers] == [402, 402, 402, 402]
        assert all(one.json()["entitled"] is False for one in answers)
        # The shelf can still be drawn from the refusal.
        assert answers[0].json()["connections"] == []

    async def test_the_allowlist_is_a_yes(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)

        with respx.mock(assert_all_called=False) as mock:
            pipedream(mock)
            response = await client.get(
                "/desktop/api/connectors",
                headers={"Authorization": f"Bearer {access}"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["entitled"] is True
        assert body["connections"] == [
            {
                "slug": "gmail",
                "accountId": "apn_one",
                "connectedAt": "2026-09-01T10:00:00+00:00",
            }
        ]


@pytest.mark.asyncio
class TestNotConfigured:
    async def test_a_claidor_with_no_connection_service_says_so(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """503, not a stack trace, and before the gate — an unconfigured
        deployment is not a question about the person's plan."""
        mocker.patch.object(settings, "PIPEDREAM_CLIENT_ID", "")
        mocker.patch.object(settings, "PIPEDREAM_CLIENT_SECRET", "")
        mocker.patch.object(settings, "PIPEDREAM_PROJECT_ID", "")
        entitle(mocker, user)
        access = await signed_in(session, user)
        headers = {"Authorization": f"Bearer {access}"}

        answers = [
            await client.get("/desktop/api/connectors", headers=headers),
            await client.post("/desktop/api/connectors/gmail/link", headers=headers),
            await client.delete("/desktop/api/connectors/apn_one", headers=headers),
            await client.post(
                "/desktop/api/connectors/mcp/gmail", headers=headers, json={}
            ),
        ]
        assert [one.status_code for one in answers] == [503, 503, 503, 503]
        assert all("not configured" in one.json()["detail"] for one in answers)


@pytest.mark.asyncio
class TestTheCache:
    async def test_the_second_look_does_not_ask_them_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """Opening the app is one call, not forty."""
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)
        headers = {"Authorization": f"Bearer {access}"}

        with respx.mock(assert_all_called=False) as mock:
            routes = pipedream(mock)
            first = await client.get("/desktop/api/connectors", headers=headers)
            second = await client.get("/desktop/api/connectors", headers=headers)
            assert routes["accounts"].call_count == 1

        assert first.json() == second.json()

    async def test_minting_a_link_forgets_what_we_last_heard(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The sign-in happens in a window that never reports back, so
        the mint is the last moment we can know the answer is stale."""
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)
        headers = {"Authorization": f"Bearer {access}"}

        with respx.mock(assert_all_called=False) as mock:
            routes = pipedream(mock)
            await client.get("/desktop/api/connectors", headers=headers)
            link = await client.post(
                "/desktop/api/connectors/gmail/link", headers=headers
            )
            await client.get("/desktop/api/connectors", headers=headers)
            assert routes["accounts"].call_count == 2

        assert link.status_code == 200
        body = link.json()
        assert "app=gmail" in body["url"]
        assert "token=ctok_1" in body["url"]
        assert body["expiresAt"].startswith("2026-09-11T16:00:00")

    async def test_a_disconnect_forgets_it_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)
        headers = {"Authorization": f"Bearer {access}"}

        with respx.mock(assert_all_called=False) as mock:
            routes = pipedream(mock)
            await client.get("/desktop/api/connectors", headers=headers)
            removed = await client.delete(
                "/desktop/api/connectors/apn_one", headers=headers
            )
            await client.get("/desktop/api/connectors", headers=headers)

        assert removed.status_code == 204
        assert routes["delete"].call_count == 1
        # Once for the first look, once for the ownership check inside the
        # disconnect, once for the look after the cache was dropped.
        assert routes["accounts"].call_count == 3

    async def test_an_account_that_is_not_this_person_s_is_a_404(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)

        with respx.mock(assert_all_called=False) as mock:
            routes = pipedream(mock)
            response = await client.delete(
                "/desktop/api/connectors/apn_somebody_else",
                headers={"Authorization": f"Bearer {access}"},
            )
            assert routes["delete"].call_count == 0

        assert response.status_code == 404


@pytest.mark.asyncio
class TestTheExternalUserId:
    """The security property of `docs/maties/connectors.md`, section 4.

    Their developer token is project-wide: it reaches whichever person
    the `x-pd-external-user-id` header names. If a client could set that
    header — or the query parameter their server also accepts — it could
    read every customer Claidor has.
    """

    async def test_the_person_is_the_session_and_no_header_changes_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)

        with respx.mock(assert_all_called=False) as mock:
            pipedream(mock)
            upstream = mock.post(MCP_BASE_URL).mock(
                return_value=httpx.Response(200, json={"jsonrpc": "2.0", "id": 1})
            )
            response = await client.post(
                "/desktop/api/connectors/mcp/gmail",
                headers={
                    "Authorization": f"Bearer {access}",
                    "x-pd-external-user-id": "00000000-0000-0000-0000-000000000000",
                    "x-pd-project-id": "proj_somebody_else",
                    "x-pd-app-slug": "google_drive",
                    "x-pd-environment": "production",
                    "content-type": "application/json",
                },
                json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
            )

        assert response.status_code == 200
        sent = upstream.calls[0].request
        assert sent.headers["x-pd-external-user-id"] == str(user.id)
        assert sent.headers["x-pd-project-id"] == PROJECT_ID
        assert sent.headers["x-pd-app-slug"] == "gmail"
        assert sent.headers["x-pd-environment"] == "development"
        # The app's own credential is ours to replace, never to forward.
        assert sent.headers["authorization"] == "Bearer pd-developer-token"
        assert access not in str(sent.headers)

    async def test_a_query_string_is_not_carried_at_all(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """Their MCP server reads its `x-pd-*` values as query parameters
        too, so forwarding a query string would hand back exactly the
        override the header allowlist just took away."""
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)

        with respx.mock(assert_all_called=False) as mock:
            pipedream(mock)
            upstream = mock.post(MCP_BASE_URL).mock(
                return_value=httpx.Response(200, json={"jsonrpc": "2.0", "id": 1})
            )
            await client.post(
                "/desktop/api/connectors/mcp/gmail"
                "?x-pd-external-user-id=00000000-0000-0000-0000-000000000000",
                headers={"Authorization": f"Bearer {access}"},
                json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
            )

        sent = upstream.calls[0].request
        assert sent.url.query == b""

    async def test_a_slug_that_is_not_a_slug_never_becomes_a_header(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        configure(mocker)
        entitle(mocker, user)
        access = await signed_in(session, user)

        with respx.mock(assert_all_called=False) as mock:
            pipedream(mock)
            upstream = mock.post(MCP_BASE_URL).mock(
                return_value=httpx.Response(200, json={})
            )
            response = await client.post(
                "/desktop/api/connectors/mcp/Gmail%20OR%20nothing",
                headers={"Authorization": f"Bearer {access}"},
                json={},
            )
            assert upstream.call_count == 0

        assert response.status_code == 400
