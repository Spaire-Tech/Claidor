"""The middleman's own behaviour (`polar/connectors/pipedream.py`).

Nothing here touches the database, Redis or pydantic, and nothing here
touches the network: the HTTP calls go through `httpx.MockTransport` and
the token cache is a dictionary. That is deliberate — it means this file
runs with `pytest --noconftest` on an interpreter the rest of the suite
cannot start on (see the Testing section of `server/CLAUDE.md`), and the
two properties the design rests on can always be checked:

- the external user id is the authenticated person and comes from
  nowhere else;
- the client secret and the developer token never appear in anything
  this module hands back.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

import httpx
import pytest

from polar.connectors.pipedream import (
    PipedreamCredentials,
    PipedreamProvider,
    with_query,
)
from polar.connectors.provider import (
    ConnectorNotFound,
    ConnectorsNotConfigured,
    ConnectorUpstreamError,
)

if TYPE_CHECKING:
    from polar.models import User

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
SOMEBODY_ELSE = UUID("22222222-2222-2222-2222-222222222222")
SECRET = "pd-client-secret-that-must-never-appear"

CREDENTIALS = PipedreamCredentials(
    client_id="pd-client-id",
    client_secret=SECRET,
    project_id="proj_abc123",
    environment="development",
)


def a_user(user_id: UUID = USER_ID) -> User:
    """The provider reads one attribute off a person, so a test does not
    need a database row to be one."""

    class _User:
        id = user_id

    return cast("User", _User())


class FakeStore:
    """The token cache, as a dictionary. `writes` keeps the TTLs so the
    « minted once, kept until shortly before it expires » promise can be
    asserted rather than assumed."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.writes: list[tuple[str, str, int]] = []

    async def get(self, name: str) -> Any:
        return self.values.get(name)

    async def set(self, name: str, value: str, *, ex: int) -> Any:
        self.values[name] = value
        self.writes.append((name, value, ex))
        return True


class FakePipedream:
    """Pipedream, as far as httpx can tell. Every request it was asked
    for is kept, which is how the tests below check what was *not* sent."""

    def __init__(self, **routes: httpx.Response) -> None:
        self.routes = routes
        self.requests: list[httpx.Request] = []
        self.token_calls = 0

    def factory(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handle))

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path.endswith("/oauth/token"):
            self.token_calls += 1
            return self.routes.get(
                "token",
                httpx.Response(
                    200, json={"access_token": "pd-developer-token", "expires_in": 3600}
                ),
            )
        if path.endswith("/tokens"):
            return self.routes.get(
                "connect_token",
                httpx.Response(
                    200,
                    json={
                        "token": "ctok_single_use",
                        "expires_at": "2026-09-11T16:00:00Z",
                        "connect_link_url": (
                            "https://pipedream.com/_static/connect.html"
                            "?token=ctok_single_use&connectLink=true"
                        ),
                    },
                ),
            )
        if path.endswith("/accounts"):
            return self.routes.get(
                "accounts", httpx.Response(200, json={"data": [], "page_info": {}})
            )
        if "/accounts/" in path:
            return self.routes.get("delete", httpx.Response(204))
        return httpx.Response(404, json={"error": "no such route"})

    def sent_to(self, needle: str) -> list[httpx.Request]:
        return [one for one in self.requests if needle in str(one.url)]


def provider(
    fake: FakePipedream,
    store: FakeStore | None = None,
    credentials: PipedreamCredentials = CREDENTIALS,
) -> PipedreamProvider:
    return PipedreamProvider(
        credentials, store or FakeStore(), client_factory=fake.factory
    )


# --- the address the person is sent to --------------------------------------


class TestConnectLink:
    def test_the_app_is_merged_into_their_query_and_not_appended(self) -> None:
        """Their URL already carries a token and a flag. A second `?`
        would make the app slug part of the token's value."""
        merged = with_query(
            "https://pipedream.com/_static/connect.html?token=ctok&connectLink=true",
            {"app": "gmail"},
        )
        assert merged.count("?") == 1
        assert "token=ctok" in merged
        assert "connectLink=true" in merged
        assert "app=gmail" in merged

    def test_a_url_with_no_query_still_gets_one(self) -> None:
        assert with_query("https://example.test/connect", {"app": "slack"}) == (
            "https://example.test/connect?app=slack"
        )

    @pytest.mark.asyncio
    async def test_the_link_is_built_from_their_url_for_this_person(self) -> None:
        fake = FakePipedream()
        link = await provider(fake).link(a_user(), "gmail")

        assert "app=gmail" in link.url
        assert "token=ctok_single_use" in link.url
        assert link.expires_at.isoformat().startswith("2026-09-11T16:00:00")

        minted = fake.sent_to("/tokens")[0]
        assert minted.method == "POST"
        assert minted.url.path == "/v1/connect/proj_abc123/tokens"
        assert minted.headers["x-pd-environment"] == "development"

    @pytest.mark.asyncio
    async def test_the_identity_sent_is_the_person_s_own_id(self) -> None:
        fake = FakePipedream()
        await provider(fake).link(a_user(), "gmail")
        body = fake.sent_to("/tokens")[0].content.decode()
        assert str(USER_ID) in body
        assert str(SOMEBODY_ELSE) not in body

    @pytest.mark.asyncio
    async def test_an_answer_with_no_address_is_a_refusal_not_a_guess(self) -> None:
        fake = FakePipedream(
            connect_token=httpx.Response(200, json={"token": "ctok_only"})
        )
        with pytest.raises(ConnectorUpstreamError):
            await provider(fake).link(a_user(), "gmail")


# --- the MCP target ---------------------------------------------------------


class TestMcpTarget:
    @pytest.mark.asyncio
    async def test_the_headers_name_this_person_and_this_app(self) -> None:
        target = await provider(FakePipedream()).mcp_target(a_user(), "notion")

        assert target.url == "https://remote.mcp.pipedream.net/v3"
        assert target.headers["x-pd-external-user-id"] == str(USER_ID)
        assert target.headers["x-pd-app-slug"] == "notion"
        assert target.headers["x-pd-project-id"] == "proj_abc123"
        assert target.headers["x-pd-environment"] == "development"
        assert target.headers["Authorization"] == "Bearer pd-developer-token"

    @pytest.mark.asyncio
    async def test_two_people_never_share_a_target(self) -> None:
        store, fake = FakeStore(), FakePipedream()
        mine = await provider(fake, store).mcp_target(a_user(), "gmail")
        theirs = await provider(fake, store).mcp_target(a_user(SOMEBODY_ELSE), "gmail")
        assert (
            mine.headers["x-pd-external-user-id"]
            != (theirs.headers["x-pd-external-user-id"])
        )

    @pytest.mark.asyncio
    async def test_the_target_does_not_print_its_credential(self) -> None:
        """A target in a stack trace or a debug log must not be a
        project-wide key in a file."""
        target = await provider(FakePipedream()).mcp_target(a_user(), "gmail")
        assert "pd-developer-token" not in repr(target)
        assert "redacted" in repr(target)


# --- the developer token ----------------------------------------------------


class TestDeveloperToken:
    @pytest.mark.asyncio
    async def test_it_is_minted_once_and_kept(self) -> None:
        store, fake = FakeStore(), FakePipedream()
        one = provider(fake, store)
        await one.mcp_target(a_user(), "gmail")
        await one.mcp_target(a_user(), "slack")
        await provider(fake, store).mcp_target(a_user(SOMEBODY_ELSE), "gmail")

        assert fake.token_calls == 1

    @pytest.mark.asyncio
    async def test_it_is_dropped_before_it_expires(self) -> None:
        store, fake = FakeStore(), FakePipedream()
        await provider(fake, store).mcp_target(a_user(), "gmail")
        _, _, ttl = store.writes[0]
        assert 0 < ttl < 3600

    @pytest.mark.asyncio
    async def test_a_lifetime_they_did_not_state_is_still_bounded(self) -> None:
        store = FakeStore()
        fake = FakePipedream(
            token=httpx.Response(200, json={"access_token": "pd-developer-token"})
        )
        await provider(fake, store).mcp_target(a_user(), "gmail")
        _, _, ttl = store.writes[0]
        assert 0 < ttl <= 45 * 60

    @pytest.mark.asyncio
    async def test_a_refusal_never_quotes_the_exchange(self) -> None:
        """The only request that carries the client secret is this one,
        so its refusals say the status and nothing else."""
        fake = FakePipedream(
            token=httpx.Response(401, json={"error": SECRET, "sent": SECRET})
        )
        with pytest.raises(ConnectorUpstreamError) as raised:
            await provider(fake).mcp_target(a_user(), "gmail")
        assert SECRET not in str(raised.value)
        assert raised.value.status == 401

    @pytest.mark.asyncio
    async def test_an_answer_with_no_token_is_a_refusal(self) -> None:
        fake = FakePipedream(token=httpx.Response(200, json={"ok": True}))
        with pytest.raises(ConnectorUpstreamError):
            await provider(fake).mcp_target(a_user(), "gmail")


# --- what is configured, and what is not ------------------------------------


class TestNotConfigured:
    @pytest.mark.asyncio
    async def test_no_credentials_means_no_call_at_all(self) -> None:
        fake = FakePipedream()
        empty = PipedreamCredentials(
            client_id="", client_secret="", project_id="", environment="development"
        )
        with pytest.raises(ConnectorsNotConfigured):
            await provider(fake, credentials=empty).connections(a_user())
        assert fake.requests == []

    def test_half_configured_is_not_configured(self) -> None:
        assert not PipedreamCredentials("id", "secret", "").configured
        assert not PipedreamCredentials("", "secret", "proj").configured
        assert PipedreamCredentials("id", "secret", "proj").configured

    def test_the_credentials_do_not_print_their_secret(self) -> None:
        printed = repr(CREDENTIALS)
        assert SECRET not in printed
        assert "proj_abc123" in printed


# --- what is connected ------------------------------------------------------


ACCOUNTS = httpx.Response(
    200,
    json={
        "data": [
            {
                "id": "apn_one",
                "created_at": "2026-09-01T10:00:00Z",
                "app": {"name_slug": "gmail", "name": "Gmail"},
            },
            {
                "id": "apn_two",
                "created_at": "not a date",
                "app": {"name_slug": "slack"},
            },
            {"id": "apn_broken", "app": None},
        ],
        "page_info": {"count": 3},
    },
)


class TestConnections:
    @pytest.mark.asyncio
    async def test_a_row_becomes_a_slug_and_an_opaque_id(self) -> None:
        fake = FakePipedream(accounts=ACCOUNTS)
        found = await provider(fake).connections(a_user())

        assert [(one.slug, one.account_id) for one in found] == [
            ("gmail", "apn_one"),
            ("slack", "apn_two"),
        ]
        assert found[0].connected_at is not None
        # An unreadable date costs the card its line and nothing else.
        assert found[1].connected_at is None

    @pytest.mark.asyncio
    async def test_the_list_is_asked_for_this_person_only(self) -> None:
        fake = FakePipedream(accounts=ACCOUNTS)
        await provider(fake).connections(a_user())
        asked = fake.sent_to("/accounts")[0]
        assert asked.url.params["external_user_id"] == str(USER_ID)
        # Credentials are never asked for, so they never reach this process.
        assert "include_credentials" not in asked.url.params

    @pytest.mark.asyncio
    async def test_their_credentials_are_never_carried_outwards(self) -> None:
        fake = FakePipedream(
            accounts=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "apn_one",
                            "app": {"name_slug": "gmail"},
                            "credentials": {"oauth_access_token": "not ours to hold"},
                        }
                    ]
                },
            )
        )
        found = await provider(fake).connections(a_user())
        assert "not ours to hold" not in repr(found)


class TestDisconnect:
    @pytest.mark.asyncio
    async def test_an_account_this_person_holds_is_removed(self) -> None:
        fake = FakePipedream(accounts=ACCOUNTS)
        await provider(fake).disconnect(a_user(), "apn_one")
        deleted = fake.sent_to("/accounts/apn_one")
        assert [one.method for one in deleted] == ["DELETE"]

    @pytest.mark.asyncio
    async def test_somebody_else_s_account_never_reaches_them(self) -> None:
        """Their delete is addressed by account id alone, with our
        project-wide token behind it. An id this person does not own must
        therefore never leave this process."""
        fake = FakePipedream(accounts=ACCOUNTS)
        with pytest.raises(ConnectorNotFound):
            await provider(fake).disconnect(a_user(), "apn_somebody_else")
        assert fake.sent_to("/accounts/apn_somebody_else") == []
