"""The box broker (25 September 2026): `aiserver.v1.GrokBotService`
served from Simeon Labs' server against an in-memory `BoxHost`, the
local-exec credential routes, and the API's own proxy to the box.

The fields asserted are the ones `BrokeredHostConnector` (`box-host-
connector.ts`), `BoxLifecycleService` (`box-lifecycle-service.ts`), the
migration watcher (`box-migration-watcher.ts`) and the local-exec daemon
(`local-exec-daemon.ts`) read; the URL shapes are the ones
`gateway-client.ts`, `sand-box.ts` and `box-connection.ts` build on.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.server import serve

from polar.config import settings
from polar.models import SandBox, User
from polar.postgres import AsyncSession, get_db_session
from polar.sand import box_hosts, box_proxy, box_service
from polar.sand.box_hosts import (
    BOX_HOST_UNAVAILABLE_SENTENCE,
    BoxBlocked,
    BoxSpec,
    ProvisionedBox,
)
from polar.sand.box_service import (
    PHASE_CREATING,
    PHASE_DONE,
    RUN_STATE_ABSENT,
    RUN_STATE_HIBERNATED,
    RUN_STATE_RUNNING,
)
from polar.sand.connect import decode_stream_frames
from tests.desktop.test_endpoints import _signed_in

ENSURE = "/aiserver.v1.GrokBotService/EnsureSandBox"
RECREATE = "/aiserver.v1.GrokBotService/RecreateSandBox"
FORCE_RECREATE = "/aiserver.v1.GrokBotService/ForceRecreateSandBox"
WATCH = "/aiserver.v1.GrokBotService/WatchSandBoxMigration"
RUN_STATE = "/aiserver.v1.GrokBotService/GetSandBoxRunState"
TURN_FINISHED = "/aiserver.v1.GrokBotService/NotifySandAgentTurnFinished"


class FakeBoxHost:
    """A host that keeps its boxes in a dict: what `DockerBoxHost` does
    against a daemon, without one."""

    name = "docker"

    def __init__(self) -> None:
        self.boxes: dict[str, dict[str, Any]] = {}
        self.created: list[BoxSpec] = []
        self.removed: list[tuple[str, list[str]]] = []
        self.blocked: BoxBlocked | None = None
        self.next_port = 40000

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        if self.blocked is not None:
            raise self.blocked
        self.created.append(spec)
        box_id = f"container-{len(self.created)}"
        ports = {
            port: self.next_port + i for i, port in enumerate((1340, 6080, 6081, 8790))
        }
        self.next_port += 10
        self.boxes[box_id] = {"running": True, "ports": ports, "spec": spec}
        return ProvisionedBox(box_id, "10.0.0.7", ports, spec.image, "abc")

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        box = self.boxes.get(provider_box_id)
        if box is None:
            return None
        return ProvisionedBox(
            provider_box_id, "10.0.0.7", box["ports"], box["spec"].image, "abc"
        )

    async def run_state(self, provider_box_id: str) -> Any:
        box = self.boxes.get(provider_box_id)
        if box is None:
            return None
        return "running" if box["running"] else "stopped"

    async def start(self, provider_box_id: str) -> None:
        self.boxes[provider_box_id]["running"] = True

    async def stop(self, provider_box_id: str) -> None:
        self.boxes[provider_box_id]["running"] = False

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        self.boxes.pop(provider_box_id, None)
        self.removed.append((provider_box_id, volumes))


@pytest.fixture
def host() -> Any:
    fake = FakeBoxHost()
    box_hosts.set_box_host_for_tests(fake)

    async def healthy(url: str, token: str) -> bool:
        return True

    box_service.set_health_check_for_tests(healthy)
    box_service.migrations.events.clear()
    yield fake
    box_hosts.set_box_host_for_tests(None)
    box_service.set_health_check_for_tests(None)


async def _ensure(client: httpx.AsyncClient, access: str) -> httpx.Response:
    return await client.post(
        ENSURE, json={}, headers={"Authorization": f"Bearer {access}"}
    )


async def _box_access_token(client: httpx.AsyncClient, access: str) -> str:
    """A box credential's own access token, the way the box's host gets
    one: minted for the desktop, traded at the renewal route."""
    minted = await client.post(
        "/desktop/api/box/renewal-credential",
        headers={"Authorization": f"Bearer {access}"},
    )
    credential = minted.json()["data"]["credential"]
    traded = await client.post(
        "/sand-box/inference-credential", json={"credential": credential}
    )
    assert traded.status_code == 200, traded.text
    return traded.json()["accessToken"]


@pytest.mark.asyncio
class TestEnsureSandBox:
    async def test_creates_once_and_reuses_with_the_fields_the_app_reads(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        first = await _ensure(client, access)
        assert first.status_code == 200, first.text
        body = first.json()
        for field in (
            "gatewayUrl",
            "gatewayToken",
            "networkToken",
            "vncUrl",
            "forkVncBaseUrl",
        ):
            assert isinstance(body[field], str) and body[field], field
        box_id = body["podId"]
        # The API's own proxy, at a path the gateway client concatenates
        # `/api/…` onto and the tunnel derivation swaps `/p/1340` → `/p/8790`.
        assert body["gatewayUrl"] == f"{settings.BASE_URL}/sand-box/{box_id}/p/1340"
        assert body["forkVncBaseUrl"] == f"{settings.BASE_URL}/sand-box/{box_id}/p/6081"
        # `buildSandBoxNoVncUrl` in sand-box.ts, so the webview loads what Grok Bot's loads.
        assert body["vncUrl"].startswith(
            f"{settings.BASE_URL}/sand-box/{box_id}/p/6080/vnc.html?network_token="
        )
        assert "resume_lower_s=900&resume_upper_s=18000" in body["vncUrl"]
        assert "path=websockify%3Fnetwork_token%3D" in body["vncUrl"]
        # The same `docker run` as the Mac, credential in the environment.
        env = dict(line.split("=", 1) for line in host.created[0].environment())
        assert env["SAND_GATEWAY_TOKEN"] == body["gatewayToken"]
        assert env["SAND_BACKEND_URL"] == settings.BASE_URL
        assert env["SAND_INFERENCE_RENEWAL_CREDENTIAL"].startswith("claidor_db_")
        assert (
            env["SAND_SUPERVISOR_ENABLED"] == "1"
            and env["SAND_USE_EXISTING_BOX_EXEC_DAEMON"] == "1"
        )
        assert "SAND_DEV_INFERENCE_TOKEN_FILE" not in env
        # The box renews with the injected credential, without the Mac.
        renewed = await client.post(
            "/sand-box/inference-credential",
            json={"credential": env["SAND_INFERENCE_RENEWAL_CREDENTIAL"]},
        )
        assert renewed.status_code == 200, renewed.text

        second = await _ensure(client, access)
        assert second.status_code == 200
        assert second.json()["podId"] == box_id
        assert second.json()["gatewayToken"] == body["gatewayToken"]
        assert len(host.created) == 1

    async def test_a_stopped_box_is_started_and_a_lost_one_recreated_on_its_volumes(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        body = (await _ensure(client, access)).json()
        container = next(iter(host.boxes))
        await host.stop(container)
        again = (await _ensure(client, access)).json()
        assert again["podId"] == body["podId"] and host.boxes[container]["running"]
        assert len(host.created) == 1
        host.boxes.clear()
        third = (await _ensure(client, access)).json()
        assert third["podId"] == body["podId"]
        assert len(host.created) == 2
        assert host.created[1].workspace_volume == host.created[0].workspace_volume

    async def test_no_host_is_one_sentence_as_unavailable(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        box_hosts.set_box_host_for_tests(None)
        previous = settings.BOX_HOST_PROVIDER
        settings.BOX_HOST_PROVIDER = ""
        try:
            access, _ = await _signed_in(client, session, user)
            response = await _ensure(client, access)
        finally:
            settings.BOX_HOST_PROVIDER = previous
        assert response.status_code == 503
        assert response.json() == {
            "code": "unavailable",
            "message": BOX_HOST_UNAVAILABLE_SENTENCE,
        }

    async def test_a_blocked_box_carries_the_hint_the_retry_after_and_the_details(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        host.blocked = BoxBlocked(
            "capacity",
            title="No room",
            detail="Try again in a minute.",
            retry_after_s=90,
        )
        access, _ = await _signed_in(client, session, user)
        response = await _ensure(client, access)
        assert response.status_code == 429
        assert response.headers["x-automation-failure-hint"] == "SAND_BOX_BLOCKED"
        assert response.headers["retry-after"] == "90"
        body = response.json()
        assert body["code"] == "resource_exhausted"
        detail = body["details"][0]
        assert detail["type"] == "aiserver.v1.ErrorDetails"
        raw = base64.b64decode(detail["value"])
        assert (
            b"No room" in raw
            and b"Try again in a minute." in raw
            and b"sandBoxBlockReason" in raw
            and b"capacity" in raw
        )

    async def test_a_box_credential_cannot_ensure(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_access = await _box_access_token(client, access)
        response = await _ensure(client, box_access)
        assert response.status_code == 401


@pytest.mark.asyncio
class TestRecreate:
    async def test_recreate_keeps_the_volumes_and_force_wipes_them(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        first = (await _ensure(client, access)).json()
        auth = {"Authorization": f"Bearer {access}"}
        recreated = await client.post(
            RECREATE, json={"preserveData": True, "force": False}, headers=auth
        )
        assert recreated.status_code == 200, recreated.text
        body = recreated.json()
        assert body["started"] is True and body["reason"] == "" and body["operationId"]
        assert host.removed[-1][1] == []
        assert len(host.created) == 2
        after = (await _ensure(client, access)).json()
        assert after["podId"] == first["podId"]
        assert after["gatewayToken"] != first["gatewayToken"]

        forced = await client.post(FORCE_RECREATE, json={}, headers=auth)
        assert forced.status_code == 200
        assert forced.json()["started"] is True
        assert host.removed[-1][1] == [
            f"simeon-box-{UUID(first['podId']).hex}-workspace",
            f"simeon-box-{UUID(first['podId']).hex}-data",
        ]

    async def test_without_a_box_recreate_is_refused_not_failed(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            RECREATE,
            json={"preserveData": True},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200
        assert (
            response.json()["started"] is False
            and "connect once first" in response.json()["reason"]
        )

    async def test_the_docker_box_on_the_mac_is_told_it_is_updated_from_the_mac(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_access = await _box_access_token(client, access)
        response = await client.post(
            RECREATE,
            json={"preserveData": True, "force": False},
            headers={"Authorization": f"Bearer {box_access}"},
        )
        assert response.status_code == 200
        assert (
            response.json()["started"] is False
            and "Docker on the user's Mac" in response.json()["reason"]
        )

    async def test_the_migration_stream_replays_the_recreate(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        auth = {"Authorization": f"Bearer {access}"}
        await _ensure(client, access)
        operation = (
            await client.post(RECREATE, json={"preserveData": True}, headers=auth)
        ).json()["operationId"]
        box_service.migrations.idle = 0.05
        try:
            response = await client.post(
                WATCH, json={"fromOffsetKey": "", "includeFinished": True}, headers=auth
            )
        finally:
            box_service.migrations.idle = 25.0
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/connect+json")
        messages, end = decode_stream_frames(response.content)
        assert end == {}
        assert [m["phase"] for m in messages] == [PHASE_CREATING, PHASE_DONE]
        assert all(m["operationId"] == operation for m in messages)
        assert messages[0]["offsetKey"] == "1" and messages[1]["offsetKey"] == "2"
        assert messages[0]["atMs"].isdigit()


@pytest.mark.asyncio
class TestRunState:
    async def test_absent_then_running_then_hibernated(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        auth = {"Authorization": f"Bearer {access}"}
        assert (await client.post(RUN_STATE, json={}, headers=auth)).json() == {
            "state": RUN_STATE_ABSENT,
            "imageUpdateAvailable": False,
        }
        await _ensure(client, access)
        assert (await client.post(RUN_STATE, json={}, headers=auth)).json()[
            "state"
        ] == RUN_STATE_RUNNING
        await host.stop(next(iter(host.boxes)))
        assert (await client.post(RUN_STATE, json={}, headers=auth)).json()[
            "state"
        ] == RUN_STATE_HIBERNATED

    async def test_from_the_cloud_box_credential_and_from_a_local_one(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        # The Docker box on the Mac holds a credential with no row: running.
        local_box_access = await _box_access_token(client, access)
        local = await client.post(
            RUN_STATE, json={}, headers={"Authorization": f"Bearer {local_box_access}"}
        )
        assert local.json() == {
            "state": RUN_STATE_RUNNING,
            "imageUpdateAvailable": False,
        }
        # The cloud box's own credential, the one in its environment.
        await _ensure(client, access)
        credential = dict(line.split("=", 1) for line in host.created[0].environment())[
            "SAND_INFERENCE_RENEWAL_CREDENTIAL"
        ]
        traded = await client.post(
            "/sand-box/inference-credential", json={"credential": credential}
        )
        cloud = await client.post(
            RUN_STATE,
            json={},
            headers={"Authorization": f"Bearer {traded.json()['accessToken']}"},
        )
        assert cloud.json()["state"] == RUN_STATE_RUNNING
        finished = await client.post(
            TURN_FINISHED,
            json={"agentId": "a1", "awaitingUserResponse": True},
            headers={"Authorization": f"Bearer {traded.json()['accessToken']}"},
        )
        assert finished.status_code == 200 and finished.json() == {}


@pytest.mark.asyncio
class TestLocalExecCredential:
    async def test_mint_then_trade_for_the_box_connection(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        minted = await client.post(
            "/sand-box/local-exec-daemon-credential",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert minted.status_code == 200, minted.text
        credential = minted.json()["credential"]
        assert credential.startswith("claidor_db_") and isinstance(
            minted.json()["expiresAtMs"], int
        )
        # No cloud box yet: the daemon keeps what it has.
        assert (
            await client.post(
                "/sand-box/local-exec-connection", json={"credential": credential}
            )
        ).status_code == 404
        box = (await _ensure(client, access)).json()
        traded = await client.post(
            "/sand-box/local-exec-connection", json={"credential": credential}
        )
        assert traded.status_code == 200, traded.text
        assert traded.json() == {
            "baseUrl": box["gatewayUrl"],
            "token": box["gatewayToken"],
            "networkToken": box["networkToken"],
        }
        assert (
            await client.post(
                "/sand-box/local-exec-connection",
                json={"credential": "claidor_db_nope"},
            )
        ).status_code == 401
        assert (
            await client.post("/sand-box/local-exec-connection", json={})
        ).status_code == 400
        # Sign-out takes it with it.
        await client.post(
            "/desktop/api/auth/logout", headers={"Authorization": f"Bearer {access}"}
        )
        assert (
            await client.post(
                "/sand-box/local-exec-connection", json={"credential": credential}
            )
        ).status_code == 401

    async def test_a_box_credential_cannot_mint_one(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_access = await _box_access_token(client, access)
        response = await client.post(
            "/sand-box/local-exec-daemon-credential",
            json={},
            headers={"Authorization": f"Bearer {box_access}"},
        )
        assert response.status_code == 401


# --- the proxy ------------------------------------------------------------------------


def _fake_upstream() -> FastAPI:
    upstream = FastAPI()

    @upstream.api_route("/{path:path}", methods=["GET", "POST"])
    async def echo(request: Request, path: str) -> Any:
        if path == "events":

            async def lines() -> AsyncIterator[bytes]:
                for n in range(3):
                    yield f"data: {n}\n\n".encode()
                    await asyncio.sleep(0)

            return StreamingResponse(lines(), media_type="text/event-stream")
        return JSONResponse(
            {
                "path": path,
                "query": request.url.query,
                "host": request.headers.get("host", ""),
                "authorization": request.headers.get("authorization", ""),
                "network": request.headers.get("x-anyrun-network-token", ""),
                "body": (await request.body()).decode(),
            }
        )

    return upstream


@pytest_asyncio.fixture
async def proxied_upstream() -> AsyncIterator[FastAPI]:
    upstream = _fake_upstream()
    transport = httpx.ASGITransport(app=upstream)

    def factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=transport, timeout=None)

    box_proxy.set_client_factory_for_tests(factory)
    yield upstream
    box_proxy.set_client_factory_for_tests(None)


@pytest.mark.asyncio
class TestProxy:
    async def test_the_network_token_gates_every_port_and_the_path_reaches_the_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        proxied_upstream: FastAPI,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box = (await _ensure(client, access)).json()
        base = f"/sand-box/{box['podId']}/p/1340"
        assert (await client.get(f"{base}/health")).status_code == 401
        assert (
            await client.get(
                f"{base}/health", headers={"x-anyrun-network-token": "wrong"}
            )
        ).status_code == 401
        # The gateway client sends the header from the descriptor and a bearer.
        response = await client.post(
            f"{base}/api/listAllAutomations",
            content="{}",
            headers={
                "x-anyrun-network-token": box["networkToken"],
                "authorization": f"Bearer {box['gatewayToken']}",
                "content-type": "application/json",
            },
        )
        assert response.status_code == 200, response.text
        echoed = response.json()
        assert echoed["path"] == "api/listAllAutomations" and echoed["body"] == "{}"
        assert echoed["authorization"] == f"Bearer {box['gatewayToken']}"
        assert echoed["host"].startswith("10.0.0.7:")
        # noVNC's page carries the token as a query parameter, with the wake parameters.
        page = await client.get(
            f"/sand-box/{box['podId']}/p/6080/vnc.html?network_token={box['networkToken']}&resume_lower_s=900&resume_upper_s=18000"
        )
        assert page.status_code == 200
        assert (
            page.json()["path"] == "vnc.html"
            and "resume_upper_s=18000" in page.json()["query"]
        )
        # Only the box's four ports.
        assert (
            await client.get(
                f"/sand-box/{box['podId']}/p/1337/x",
                headers={"x-anyrun-network-token": box["networkToken"]},
            )
        ).status_code == 404
        # Another box id with this token: refused.
        assert (
            await client.get(
                f"/sand-box/{UUID(int=1)}/p/1340/health",
                headers={"x-anyrun-network-token": box["networkToken"]},
            )
        ).status_code == 401

    async def test_the_events_stream_is_streamed(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        proxied_upstream: FastAPI,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box = (await _ensure(client, access)).json()
        response = await client.get(
            f"/sand-box/{box['podId']}/p/1340/events",
            headers={
                "x-anyrun-network-token": box["networkToken"],
                "accept": "text/event-stream",
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.text == "data: 0\n\ndata: 1\n\ndata: 2\n\n"


def test_websockify_and_the_egress_tunnel_are_proxied_as_websockets() -> None:
    """The WebSocket half against a real `websockets` echo server on the
    loopback, through a small app that mounts the proxy router with a
    fake box lookup (no database)."""
    box = SandBox(
        id=UUID(int=7),
        user_id=UUID(int=1),
        provider="docker",
        provider_box_id="c",
        host_address="127.0.0.1",
        ports={},
        gateway_token="g",
        network_token="secret",
    )
    seen: dict[str, Any] = {}

    async def lookup(db: Any, box_id: UUID, token: str) -> SandBox | None:
        return box if box_id == box.id and token == "secret" else None

    async def run() -> None:
        async def echo(connection: Any) -> None:
            seen["path"] = connection.request.path
            seen["subprotocol"] = connection.subprotocol
            seen["authorization"] = connection.request.headers.get("authorization")
            async for message in connection:
                await connection.send(message)

        async with serve(
            echo,
            "127.0.0.1",
            0,
            subprotocols=["binary"],
            select_subprotocol=lambda connection, offered: offered[0]
            if offered
            else None,
        ) as server:
            port = server.sockets[0].getsockname()[1]
            box.ports = {"6080": port, "8790": port}
            app = FastAPI()
            app.include_router(box_proxy.router)

            async def no_db() -> Any:
                yield None

            app.dependency_overrides[get_db_session] = no_db
            box_proxy.set_lookup_for_tests(lookup)
            try:
                await asyncio.to_thread(_drive, app, box)
            finally:
                box_proxy.set_lookup_for_tests(None)

    def _drive(app: FastAPI, box: SandBox) -> None:
        with TestClient(app) as tc:
            with tc.websocket_connect(
                f"/sand-box/{box.id}/p/6080/websockify?network_token=secret&resume_lower_s=900",
                subprotocols=["binary"],
            ) as ws:
                ws.send_bytes(b"\x00\x01rfb")
                assert ws.receive_bytes() == b"\x00\x01rfb"
                ws.send_text("hello")
                assert ws.receive_text() == "hello"
            with tc.websocket_connect(
                f"/sand-box/{box.id}/p/8790/",
                headers={
                    "x-anyrun-network-token": "secret",
                    "authorization": "Bearer g",
                },
            ) as ws:
                ws.send_text("tunnel")
                assert ws.receive_text() == "tunnel"
            with pytest.raises(WebSocketDisconnect):
                with tc.websocket_connect(
                    f"/sand-box/{box.id}/p/6080/websockify?network_token=wrong"
                ):
                    pass

    asyncio.run(run())
    assert (
        seen["path"].startswith("/")
        and "resume_lower_s=900" in seen["path"]
        or seen["path"] == "/"
    )
    assert seen["authorization"] == "Bearer g"
