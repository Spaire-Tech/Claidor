"""Apps under Simeon's own name (`polar/desktop/apps.py`), end to end over
HTTP with the provider mocked: the MCP server per app, sign-in, status,
disconnect, and that the provider's name never comes back."""

import json

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from polar.config import settings
from polar.desktop import apps as apps_module
from polar.desktop.composio import composio_user_id
from polar.desktop.service import desktop
from polar.models import User
from polar.postgres import AsyncSession

API = settings.COMPOSIO_BASE_URL.rstrip("/")


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


def _accounts(*ids: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "items": [
                {"id": one, "status": "ACTIVE", "status_reason": None} for one in ids
            ],
            "total_pages": 1,
            "current_page": 1,
            "total_items": len(ids),
        },
    )


TOOLS = {
    "items": [
        {
            "slug": f"GMAIL_TOOL_{n}",
            "name": f"Tool {n}",
            "description": "Sends mail through Composio's Gmail integration.",
            "input_parameters": {
                "type": "object",
                "properties": {"to": {"type": "string"}},
            },
            "is_deprecated": False,
        }
        for n in range(6)
    ],
    "total_pages": 1,
    "current_page": 1,
    "total_items": 6,
}


def _rpc(method: str, params: dict | None = None, id: int = 1) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        **({"params": params} if params else {}),
    }


@pytest.fixture(autouse=True)
def _keyed(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck-test")
    apps_module._tools_cache.clear()
    apps_module._sessions.clear()


@pytest.mark.asyncio
class TestAvailability:
    async def test_available_follows_the_key(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        response = await client.get("/desktop/api/apps", headers=headers)
        assert response.json() == {"available": True}
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "")
        response = await client.get("/desktop/api/apps", headers=headers)
        assert response.json() == {"available": False}
        assert (await client.get("/desktop/api/apps")).status_code == 401


@pytest.mark.asyncio
class TestTheAppsMcpServer:
    async def test_initialize_is_ours_and_a_notification_is_accepted(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/apps/mcp/gmail",
            headers=headers,
            json=_rpc("initialize", {"protocolVersion": "2025-06-18"}),
        )
        assert response.status_code == 200, response.text
        assert response.json()["result"]["serverInfo"]["name"] == "Simeon"
        note = await client.post(
            "/desktop/api/apps/mcp/gmail",
            headers=headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        )
        assert note.status_code == 202

    async def test_not_connected_reads_as_sign_in_needed(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            listed = mock.get(f"{API}/api/v3.1/connected_accounts").mock(
                return_value=_accounts()
            )
            response = await client.post(
                "/desktop/api/apps/mcp/gmail", headers=headers, json=_rpc("tools/list")
            )
        assert response.status_code == 401
        sent = listed.calls[0].request.url.params
        assert sent.get_list("user_ids") == [composio_user_id(user)]
        assert sent.get_list("toolkit_slugs") == ["gmail"]
        assert listed.calls[0].request.headers["x-api-key"] == "ck-test"

    async def test_tools_are_listed_and_called_without_the_provider_name(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.get(f"{API}/api/v3.1/connected_accounts").mock(
                return_value=_accounts("ca_1")
            )
            mock.get(f"{API}/api/v3.1/tools").mock(
                return_value=httpx.Response(200, json=TOOLS)
            )
            executed = mock.post(f"{API}/api/v3.1/tools/execute/GMAIL_TOOL_1").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "data": {"id": "m1", "via": "composio"},
                        "error": None,
                        "successful": True,
                    },
                )
            )
            listed = await client.post(
                "/desktop/api/apps/mcp/gmail", headers=headers, json=_rpc("tools/list")
            )
            called = await client.post(
                "/desktop/api/apps/mcp/gmail",
                headers=headers,
                json=_rpc(
                    "tools/call",
                    {"name": "GMAIL_TOOL_1", "arguments": {"to": "a@b.c"}},
                    id=2,
                ),
            )
        assert listed.status_code == 200, listed.text
        tools = listed.json()["result"]["tools"]
        assert [tool["name"] for tool in tools][:2] == ["GMAIL_TOOL_0", "GMAIL_TOOL_1"]
        assert "composio" not in listed.text.lower()
        body = json.loads(executed.calls[0].request.content)
        assert body == {
            "user_id": composio_user_id(user),
            "connected_account_id": "ca_1",
            "arguments": {"to": "a@b.c"},
        }
        result = called.json()["result"]
        assert result["isError"] is False
        assert "composio" not in called.text.lower()

    async def test_a_tool_of_another_app_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/api/v3.1/tools").mock(
                return_value=httpx.Response(200, json=TOOLS)
            )
            response = await client.post(
                "/desktop/api/apps/mcp/gmail",
                headers=headers,
                json=_rpc("tools/call", {"name": "GITHUB_DELETE_REPO"}),
            )
        assert response.json()["error"]["code"] == -32602

    async def test_signed_out_and_unconfigured_are_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        response = await client.post(
            "/desktop/api/apps/mcp/gmail", json=_rpc("tools/list")
        )
        assert response.status_code == 401
        headers = await _signed_in(client, session, user)
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "")
        response = await client.post(
            "/desktop/api/apps/mcp/gmail", headers=headers, json=_rpc("tools/list")
        )
        assert response.status_code == 503
        assert "composio" not in response.text.lower()


@pytest.mark.asyncio
class TestSigningIn:
    async def test_connect_gives_a_link_that_returns_to_our_page(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.get(f"{API}/api/v3.1/connected_accounts").mock(
                return_value=_accounts()
            )
            created = mock.post(f"{API}/api/v3.1/tool_router/session").mock(
                return_value=httpx.Response(201, json={"session_id": "trs_1"})
            )
            linked = mock.post(f"{API}/api/v3.1/tool_router/session/trs_1/link").mock(
                return_value=httpx.Response(
                    201,
                    json={
                        "link_token": "t",
                        "redirect_url": "https://accounts.google.com/o/oauth2/auth?x=1",
                        "connected_account_id": "ca_2",
                    },
                )
            )
            response = await client.post(
                "/desktop/api/apps/gmail/connect", headers=headers
            )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "toolkit": "gmail",
            "connected": False,
            "url": "https://accounts.google.com/o/oauth2/auth?x=1",
        }
        assert json.loads(created.calls[0].request.content) == {
            "user_id": composio_user_id(user)
        }
        sent = json.loads(linked.calls[0].request.content)
        assert sent["toolkit"] == "gmail"
        assert sent["callback_url"].endswith("/desktop/apps/connected")

    async def test_status_and_disconnect(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.get(f"{API}/api/v3.1/connected_accounts").mock(
                return_value=_accounts("ca_1")
            )
            deleted = mock.delete(f"{API}/api/v3.1/connected_accounts/ca_1").mock(
                return_value=httpx.Response(200, json={"success": True})
            )
            status = await client.get("/desktop/api/apps/gmail/status", headers=headers)
            gone = await client.delete("/desktop/api/apps/gmail", headers=headers)
        assert status.json() == {"toolkit": "gmail", "connected": True}
        assert gone.json() == {"toolkit": "gmail", "disconnected": 1}
        assert deleted.called

    async def test_the_landing_page_and_the_callback_are_ours(
        self, client: httpx.AsyncClient
    ) -> None:
        page = await client.get("/desktop/apps/connected")
        assert page.status_code == 200
        assert "Simeon" in page.text
        assert "composio" not in page.text.lower()
        callback = await client.get("/desktop/apps/oauth/callback?code=abc&state=xyz")
        assert callback.status_code == 302
        assert (
            callback.headers["location"]
            == f"{apps_module.COMPOSIO_CALLBACK}?code=abc&state=xyz"
        )


def test_scrub() -> None:
    assert (
        apps_module.scrub("Powered by Composio, see composio.dev")
        == "Powered by Simeon, see simeonlabs.com"
    )
