"""Connect RPC served from FastAPI (25 September 2026).

The app's `createSandBackendTransport` speaks Connect over HTTP/1.1 with
the JSON codec. This measures the helper that every `/aiserver.v1.*`
module builds on: a unary method answers protobuf JSON, an error answers
Connect's `{code, message}` with the protocol's status, an
unauthenticated call is `unauthenticated`, a method nothing serves is
`unimplemented` from the catch-all, and a server stream is enveloped the
way `@connectrpc/connect` reads it.
"""

import httpx
import pytest
from fastapi import FastAPI

from polar.models import User
from polar.postgres import AsyncSession
from polar.sand import router as sand_router
from polar.sand.connect import (
    ConnectCall,
    ConnectError,
    ConnectService,
    decode_stream_frames,
    encode_stream_frames,
)

from tests.desktop.test_endpoints import _signed_in

demo = ConnectService("aiserver.v1.DemoService")


@demo.unary("Echo")
async def echo(call: ConnectCall) -> dict[str, object]:
    return {"echoed": call.message, "userId": str(call.caller.user_id)}


@demo.unary("Open", auth="none")
async def open_(call: ConnectCall) -> dict[str, object]:
    return {"anonymous": call.session is None}


@demo.unary("Blocked")
async def blocked(call: ConnectCall) -> dict[str, object]:
    raise ConnectError(
        "permission_denied",
        "blocked",
        headers={"x-automation-failure-hint": "SAND_BOX_BLOCKED", "retry-after": "60"},
    )


@demo.stream("Count")
async def count(call: ConnectCall):  # type: ignore[no-untyped-def]
    for n in range(int(call.message.get("upTo", 0))):
        yield {"n": n}


@pytest.fixture(autouse=True)
def _mount(app: FastAPI) -> None:
    # The catch-all is already mounted and Starlette matches in order, so
    # the demo service is included (which binds the app's dependency
    # overrides into each route) and then moved in front of it, the way a
    # real module is included before `unimplemented_router` in `polar.sand`.
    if any(getattr(route, "path", "") == "/aiserver.v1.DemoService/Echo" for route in app.routes):
        return
    before = len(app.router.routes)
    app.include_router(demo.router)
    added = app.router.routes[before:]
    del app.router.routes[before:]
    app.router.routes[0:0] = added


@pytest.mark.asyncio
class TestConnect:
    async def test_unary_answers_protobuf_json_for_the_signed_in_caller(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/aiserver.v1.DemoService/Echo",
            json={"preserveData": True, "count": "12"},
            headers={"Authorization": f"Bearer {access}", "content-type": "application/json"},
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"echoed": {"preserveData": True, "count": "12"}, "userId": str(user.id)}

    async def test_unauthenticated_is_connects_own_code(self, client: httpx.AsyncClient) -> None:
        response = await client.post("/aiserver.v1.DemoService/Echo", json={})
        assert response.status_code == 401
        assert response.json()["code"] == "unauthenticated"

    async def test_an_open_method_takes_no_bearer(self, client: httpx.AsyncClient) -> None:
        response = await client.post("/aiserver.v1.DemoService/Open", content=b"")
        assert response.status_code == 200
        assert response.json() == {"anonymous": True}

    async def test_an_error_carries_its_code_status_and_headers(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/aiserver.v1.DemoService/Blocked", json={}, headers={"Authorization": f"Bearer {access}"}
        )
        assert response.status_code == 403
        assert response.json() == {"code": "permission_denied", "message": "blocked"}
        assert response.headers["x-automation-failure-hint"] == "SAND_BOX_BLOCKED"
        assert response.headers["retry-after"] == "60"

    async def test_anything_unserved_is_unimplemented(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        for path in ("/aiserver.v1.NoSuchService/Nothing", "/agent.v1.AgentService/Nothing"):
            response = await client.post(path, json={}, headers={"Authorization": f"Bearer {access}"})
            assert response.status_code == 404, path
            assert response.json()["code"] == "unimplemented"

    async def test_a_server_stream_is_enveloped(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/aiserver.v1.DemoService/Count",
            json={"upTo": 3},
            headers={"Authorization": f"Bearer {access}", "content-type": "application/connect+json"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/connect+json")
        messages, end = decode_stream_frames(response.content)
        assert messages == [{"n": 0}, {"n": 1}, {"n": 2}]
        assert end == {}

    def test_frames_round_trip(self) -> None:
        body = encode_stream_frames([{"a": 1}], ConnectError("aborted", "gone"))
        assert decode_stream_frames(body) == ([{"a": 1}], {"error": {"code": "aborted", "message": "gone"}})


@pytest.mark.asyncio
class TestDashboardPreflight:
    async def test_privacy_mode_team_settings_and_me_answer(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        privacy = await client.post("/aiserver.v1.DashboardService/GetUserPrivacyMode", json={}, headers=headers)
        assert privacy.status_code == 200, privacy.text
        assert privacy.json()["privacyMode"] == 2
        team = await client.post("/aiserver.v1.DashboardService/GetTeamAdminSettingsOrEmptyIfNotInTeam", json={}, headers=headers)
        assert team.status_code == 200 and team.json() == {}
        me = await client.post("/aiserver.v1.DashboardService/GetMe", json={"teamId": 0}, headers=headers)
        assert me.status_code == 200, me.text
        body = me.json()
        assert body["authId"] == str(user.id)
        assert isinstance(body["userId"], int) and 0 < body["userId"] < 2_147_483_647
        assert body["email"] == user.email


@pytest.mark.asyncio
class TestLaunchPreflights:
    """The two RPCs the new Mac build asked for at launch and got "not found"
    (the founder, 25 September 2026, evening)."""

    async def test_sand_access_is_granted_and_composer_settings_are_empty(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        status = await client.post("/aiserver.v1.DashboardService/GetSandAccessStatus", json={}, headers=headers)
        assert status.status_code == 200, status.text
        assert status.json() == {"state": 1, "purchaseChannel": 1, "blockReason": 0}
        settings_ = await client.post("/aiserver.v1.BackgroundComposerService/GetBackgroundComposerUserSettings", json={}, headers=headers)
        assert settings_.status_code == 200, settings_.text
        assert settings_.json() == {}
