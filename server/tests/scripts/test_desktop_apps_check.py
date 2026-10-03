"""The apps check reads an account's sign-ins from the provider, makes one
read-only call per app through the agent's own path, and says plainly which
work; `--disconnect` removes an app's sign-ins so Add asks again."""

import json

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from scripts.desktop_apps_check import check, disconnect
from simeon.config import settings
from simeon.desktop import apps
from simeon.desktop.composio import composio_user_id
from simeon.models import User

API = settings.COMPOSIO_BASE_URL.rstrip("/")


def _tools(*names: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "items": [
                {
                    "slug": name,
                    "name": name,
                    "description": "",
                    "input_parameters": {"type": "object", "properties": {}},
                    "is_deprecated": False,
                }
                for name in names
            ],
            "total_pages": 1,
        },
    )


@pytest.fixture(autouse=True)
def _keyed(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck-test")
    apps._tools_cache.clear()
    apps._accounts_cache.clear()


@pytest.mark.asyncio
async def test_a_working_app_and_a_broken_one_are_told_apart(user: User) -> None:
    def accounts(request: httpx.Request) -> httpx.Response:
        assert request.url.params.get_list("user_ids") == [composio_user_id(user)]
        toolkits = request.url.params.get_list("toolkit_slugs")
        rows = [
            {
                "id": "ca_g",
                "status": "ACTIVE",
                "toolkit": {"slug": "gmail"},
                "created_at": "2026-09-28T10:00:00Z",
            },
            {
                "id": "ca_l",
                "status": "ACTIVE",
                "toolkit": {"slug": "linkedin"},
                "created_at": "2026-09-29T10:00:00Z",
            },
        ]
        if toolkits:
            rows = [row for row in rows if row["toolkit"]["slug"] in toolkits]
        return httpx.Response(200, json={"items": rows, "total_pages": 1})

    def tools(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("toolkit_slug") == "gmail":
            return _tools("GMAIL_GET_PROFILE", "GMAIL_SEND_EMAIL")
        return _tools("LINKEDIN_GET_MY_INFO", "LINKEDIN_CREATE_POST")

    def execute(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if request.url.path.endswith("GMAIL_GET_PROFILE"):
            assert body["connected_account_id"] == "ca_g"
            return httpx.Response(
                200,
                json={"successful": True, "data": {"emailAddress": "bass@example.com"}},
            )
        return httpx.Response(
            200, json={"successful": False, "error": "The LinkedIn token was revoked."}
        )

    with respx.mock() as mock:
        mock.get(f"{API}/api/v3.1/connected_accounts").mock(side_effect=accounts)
        mock.get(f"{API}/api/v3.1/tools").mock(side_effect=tools)
        mock.post(url__regex=rf"{API}/api/v3.1/tools/execute/.*").mock(
            side_effect=execute
        )
        lines = await check(user)

    text = "\n".join(lines)
    assert "gmail            ACTIVE       signed in 2026-09-28T10:00:00Z" in text
    assert "gmail: GMAIL_GET_PROFILE: works:" in text
    assert "bass@example.com" in text
    assert (
        "linkedin: LINKEDIN_GET_MY_INFO: FAILED: The LinkedIn token was revoked."
        in text
    )


@pytest.mark.asyncio
async def test_no_sign_ins_says_every_add_will_ask(user: User) -> None:
    with respx.mock() as mock:
        mock.get(f"{API}/api/v3.1/connected_accounts").mock(
            return_value=httpx.Response(200, json={"items": [], "total_pages": 1})
        )
        lines = await check(user)
    assert lines == [
        "No app sign-ins on file for this account: every Add will ask to sign in."
    ]


@pytest.mark.asyncio
async def test_disconnect_removes_the_apps_sign_ins(user: User) -> None:
    with respx.mock() as mock:
        mock.get(f"{API}/api/v3.1/connected_accounts").mock(
            return_value=httpx.Response(
                200,
                json={"items": [{"id": "ca_g", "status": "ACTIVE"}], "total_pages": 1},
            )
        )
        deleted = mock.delete(f"{API}/api/v3.1/connected_accounts/ca_g").mock(
            return_value=httpx.Response(200, json={})
        )
        assert await disconnect(user, "gmail") == 1
    assert deleted.called
