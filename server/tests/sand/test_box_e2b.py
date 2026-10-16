"""Simeon's cloud computer on E2B (16 October 2026).

`E2BBoxHost` against a stand-in for E2B's `AsyncSandbox` that keeps its
sandboxes in a dict and records every call, alone and behind the same
broker path the app calls (`EnsureSandBox`), the sleeper and the proxy.
"""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from e2b import SandboxState
from e2b.exceptions import (
    AuthenticationException,
    SandboxNotFoundException,
    ServiceBusyException,
)
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_e2b, box_hosts, box_proxy, box_service
from simeon.sand.box_e2b import E2BBoxHost, env_file, machine_id_of
from simeon.sand.box_hosts import (
    BoxBlocked,
    BoxHostError,
    BoxHostUnavailable,
    BoxSpec,
    HostBundle,
    box_host_entries,
)
from simeon.sand.box_repository import SandBoxRepository
from simeon.sand.box_service import broker, dial_headers
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import FakeBoxHost, _ensure, backups
from tests.sand.test_box_sleep import _box_of, health

__all__ = ["backups", "health"]

BUNDLE = HostBundle(b"// host", b"// exec daemon")


class FakeE2B:
    """E2B's `AsyncSandbox` class methods, over a dict."""

    def __init__(self) -> None:
        self.boxes: dict[str, dict[str, Any]] = {}
        self.created: list[dict[str, Any]] = []
        self.calls: list[tuple[str, str]] = []
        self.fail_boot = False
        self.busy_connects = 0
        self.create_error: BaseException | None = None
        self.api: list[dict[str, Any]] = []

    def _box(self, sandbox_id: str) -> dict[str, Any]:
        box = self.boxes.get(sandbox_id)
        if box is None:
            raise SandboxNotFoundException(f"sandbox {sandbox_id} not found")
        return box

    def _handle(self, sandbox_id: str) -> Any:
        box = self._box(sandbox_id)
        fake = self

        class Files:
            async def write(
                self, path: str, data: Any, user: str | None = None
            ) -> None:
                box["files"][path] = (data, user)

        class Commands:
            async def run(
                self, cmd: str, user: str | None = None, timeout: float | None = None
            ) -> Any:
                if fake.fail_boot and "start-simeon-vm" in cmd:
                    raise RuntimeError("the VM refused the command")
                box["commands"].append((cmd, user))
                return SimpleNamespace(exit_code=0, stdout="", stderr="")

        return SimpleNamespace(
            sandbox_id=sandbox_id,
            sandbox_domain="e2b.app",
            traffic_access_token=box["token"],
            files=Files(),
            commands=Commands(),
        )

    async def create(self, **opts: Any) -> Any:
        if self.create_error is not None:
            raise self.create_error
        self.api.append({k: opts[k] for k in ("api_key", "domain") if k in opts})
        self.created.append(opts)
        sandbox_id = f"sbx{len(self.created)}"
        self.boxes[sandbox_id] = {
            "state": "running",
            "metadata": dict(opts["metadata"]),
            "token": f"traffic-{sandbox_id}",
            "files": {},
            "commands": [],
            "template": opts["template"],
        }
        return self._handle(sandbox_id)

    async def connect(self, sandbox_id: str, timeout: int, **_: Any) -> Any:
        self.calls.append(("connect", sandbox_id))
        if self.busy_connects > 0:
            self.busy_connects -= 1
            raise ServiceBusyException("busy")
        self._box(sandbox_id)["state"] = "running"
        return self._handle(sandbox_id)

    async def pause(self, sandbox_id: str, **_: Any) -> bool:
        self.calls.append(("pause", sandbox_id))
        self._box(sandbox_id)["state"] = "paused"
        return True

    async def get_info(self, sandbox_id: str, **_: Any) -> Any:
        box = self._box(sandbox_id)
        return SimpleNamespace(
            sandbox_id=sandbox_id,
            sandbox_domain="e2b.app",
            metadata=box["metadata"],
            state=SandboxState.RUNNING
            if box["state"] == "running"
            else SandboxState.PAUSED,
        )

    async def kill(self, sandbox_id: str, **_: Any) -> bool:
        self.calls.append(("kill", sandbox_id))
        self._box(sandbox_id)
        del self.boxes[sandbox_id]
        return True

    async def set_timeout(self, sandbox_id: str, timeout: int, **_: Any) -> None:
        self.calls.append(("set_timeout", sandbox_id))
        self._box(sandbox_id)

    def list(self, query: Any, **_: Any) -> Any:
        found = [
            SimpleNamespace(sandbox_id=sandbox_id)
            for sandbox_id, box in self.boxes.items()
            if all(box["metadata"].get(k) == v for k, v in query.metadata.items())
        ]

        class Pages:
            has_next = True

            async def next_items(self) -> list[Any]:
                Pages.has_next = False
                return found

        return Pages()


def _host(
    sdk: FakeE2B, *, name: str = "e2b-1", users: tuple[str, ...] = (), **kw: Any
) -> E2BBoxHost:
    return E2BBoxHost(
        name=name,
        template="simeon-box",
        bundle=BUNDLE,
        users=users,
        sdk=sdk,
        api_key="e2b_test",
        domain="",
        **kw,
    )


def _spec(**kw: Any) -> BoxSpec:
    fields: dict[str, Any] = {
        "name": "simeon-box-" + "ab" * 16,
        "gateway_token": "gw",
        "renewal_credential": "simeon_db_x",
        "backend_url": "https://api.example.com",
        "image": "ignored",
        "workspace_volume": "w",
        "data_volume": "d",
        "labels": {"com.simeonlabs.box-store": "1"},
    }
    fields.update(kw)
    return BoxSpec(**fields)


# --- the host alone ---------------------------------------------------------------


@pytest.mark.asyncio
class TestE2BHost:
    async def test_a_new_computer_is_locked_down_and_its_stack_started(self) -> None:
        sdk = FakeE2B()
        host = _host(sdk)
        made = await host.create(_spec())

        opts = sdk.created[0]
        assert opts["template"] == "simeon-box"
        # Paused, never killed, when its timeout passes; no wake on traffic.
        assert opts["lifecycle"] == {"on_timeout": "pause", "auto_resume": False}
        # Nobody reaches its ports without the traffic token.
        assert opts["network"] == {"allow_public_traffic": False}
        assert opts["metadata"] == {
            "simeon_box": "simeon-box-" + "ab" * 16,
            "image": "e2b:simeon-box",
            "host_sha256": BUNDLE.host_sha256,
            "box_store": "1",
        }
        assert sdk.api == [{"api_key": "e2b_test"}]

        box = sdk.boxes[made.provider_box_id]
        files = box["files"]
        env, _ = files["/run/simeon/box.env"]
        assert "export SAND_GATEWAY_TOKEN='gw'" in env
        assert "export SAND_INFERENCE_RENEWAL_CREDENTIAL='simeon_db_x'" in env
        assert files["/etc/machine-id"] == ("ab" * 16 + "\n", "root")
        assert files["/home/box/sand-host/host-main.cjs"] == (b"// host", "root")
        assert files["/home/box/box-exec-daemon/main.cjs"] == (
            b"// exec daemon",
            "root",
        )
        assert len(files["/run/simeon/seed"][0]) == 64
        # Everything is written before the stack starts, as root, detached.
        last, user = box["commands"][-1]
        assert user == "root"
        assert "setsid -f /usr/local/bin/start-simeon-vm" in last
        assert "date -u -s @" in last

        assert made.host_address == "e2b.app"
        assert made.ports == {1340: 1340, 6080: 6080, 6081: 6081, 8790: 8790}
        assert made.image == "e2b:simeon-box"
        assert made.host_sha256 == BUNDLE.host_sha256
        assert made.box_store == "1"
        assert made.host_meta == {"kind": "e2b", "traffic_token": "traffic-sbx1"}

    async def test_a_computer_that_does_not_boot_is_removed(self) -> None:
        sdk = FakeE2B()
        sdk.fail_boot = True
        with pytest.raises(BoxHostError):
            await _host(sdk).create(_spec())
        assert sdk.boxes == {}
        assert ("kill", "sbx1") in sdk.calls

    async def test_without_the_host_bundle_nothing_is_made(self) -> None:
        sdk = FakeE2B()
        host = E2BBoxHost(name="e2b-1", template="t", bundle=None, sdk=sdk)
        with pytest.raises(BoxHostUnavailable):
            await host.create(_spec())
        assert sdk.created == []

    async def test_sleep_wake_state_remove_and_keep_alive(self) -> None:
        sdk = FakeE2B()
        host = _host(sdk)
        made = await host.create(_spec())
        sandbox = made.provider_box_id
        assert await host.run_state(sandbox) == "running"

        await host.stop(sandbox)
        assert await host.run_state(sandbox) == "stopped"
        await host.start(sandbox)
        assert await host.run_state(sandbox) == "running"
        # The clock is set as the computer comes back.
        assert sdk.boxes[sandbox]["commands"][-1][0].startswith("date -u -s @")

        await host.keep_alive(sandbox)
        assert ("set_timeout", sandbox) in sdk.calls

        read = await host.inspect(sandbox)
        assert read is not None
        assert (read.image, read.host_sha256, read.box_store) == (
            "e2b:simeon-box",
            BUNDLE.host_sha256,
            "1",
        )
        # A read never carries the traffic token: E2B gives it only at create.
        assert read.host_meta == {"kind": "e2b"}

        # Found by its name, as the cleanup of a box that did not come up asks.
        await host.remove("simeon-box-" + "ab" * 16, volumes=["w", "d"])
        assert await host.run_state(sandbox) is None
        assert await host.inspect(sandbox) is None
        # Gone already: nothing to do.
        await host.stop(sandbox)
        await host.remove(sandbox, volumes=[])

    async def test_a_busy_wake_is_tried_again_then_held(
        self, mocker: MockerFixture
    ) -> None:
        sdk = FakeE2B()
        host = _host(sdk)
        sandbox = (await host.create(_spec())).provider_box_id
        await host.stop(sandbox)
        mocker.patch("simeon.sand.box_e2b.asyncio.sleep", side_effect=_no_wait)
        sdk.busy_connects = 2
        await host.start(sandbox)
        assert await host.run_state(sandbox) == "running"

        mocker.patch.object(box_e2b, "BUSY_RETRY_S", 0.0)
        sdk.busy_connects = 5
        with pytest.raises(BoxBlocked):
            await host.start(sandbox)

    async def test_e2b_refusals_become_the_apps_sentences(self) -> None:
        sdk = FakeE2B()
        sdk.create_error = AuthenticationException("bad key")
        with pytest.raises(BoxHostUnavailable, match="E2B_API_KEY"):
            await _host(sdk).create(_spec())
        sdk.create_error = ServiceBusyException("no room")
        with pytest.raises(BoxBlocked):
            await _host(sdk).create(_spec())


async def _no_wait(_: float) -> None:
    return None


def test_the_settings_file_keeps_every_value_as_it_was() -> None:
    values = {
        "PLAIN": "abc",
        "QUOTE": "it's 'quoted'",
        "SPACES": "a b  c",
        "DOLLAR": "$HOME `id` $(id)",
        "EMPTY": "",
        "EQUALS": "a=b=c",
    }
    text = env_file([f"{k}={v}" for k, v in values.items()])
    script = text + "".join(f'printf "%s\\0" "${k}"\n' for k in values)
    out = subprocess.run(
        ["bash", "-c", script], capture_output=True, check=True
    ).stdout.decode()
    assert out.split("\0")[:-1] == list(values.values())


def test_the_machine_id_is_the_boxes_own() -> None:
    assert machine_id_of("simeon-box-" + "0f" * 16) == "0f" * 16
    other = machine_id_of("something-else")
    assert len(other) == 32
    assert other != machine_id_of("something-else")


# --- the settings ------------------------------------------------------------------


class TestEntries:
    def test_kinds_users_and_idle_time(self, mocker: MockerFixture) -> None:
        mocker.patch.object(
            settings,
            "BOX_HOSTS",
            '[{"name": "us-west-1", "docker_host": "tcp://box2:2376"},'
            ' {"name": "e2b-1", "kind": "e2b", "users": "A@x.com, b@y.com",'
            '  "idle_minutes": 10, "max_running": 100},'
            ' {"name": "e2b-2", "kind": "E2B", "template": "t2", "users": ["c@z.com"]}]',
        )
        docker, first, second = box_host_entries()
        assert (docker.kind, docker.users, docker.idle_minutes) == ("docker", (), None)
        assert first.kind == "e2b"
        assert first.users == ("a@x.com", "b@y.com")
        assert (first.idle_minutes, first.max_running, first.docker_host) == (
            10.0,
            100,
            "",
        )
        assert (second.kind, second.template, second.users) == (
            "e2b",
            "t2",
            ("c@z.com",),
        )

    def test_a_docker_server_still_needs_its_daemon(
        self, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "BOX_HOSTS", '[{"name": "x"}]')
        with pytest.raises(BoxHostUnavailable, match="docker_host"):
            box_host_entries()
        mocker.patch.object(settings, "BOX_HOSTS", '[{"name": "x", "kind": "vm"}]')
        with pytest.raises(BoxHostUnavailable, match="kind"):
            box_host_entries()


@pytest.mark.asyncio
async def test_the_fleet_builds_e2b_servers(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "BOX_HOST_PROVIDER", "docker")
    mocker.patch.object(
        settings,
        "BOX_HOSTS",
        '[{"name": "e2b-1", "kind": "e2b", "users": ["a@x.com"], "idle_minutes": 10}]',
    )
    mocker.patch.object(settings, "E2B_TEMPLATE", "simeon-box")
    mocker.patch.object(box_hosts, "load_host_bundle", return_value=BUNDLE)
    mocker.patch.object(box_hosts, "_fleet_cache", None)
    (host,) = await box_hosts.resolve_box_hosts()
    assert isinstance(host, E2BBoxHost)
    assert (host.name, host.template, host.users) == (
        "e2b-1",
        "simeon-box",
        ("a@x.com",),
    )
    assert host.idle_after == timedelta(minutes=10)
    assert host.bundle is BUNDLE
    assert host.keeps_files is False


# --- behind the broker -----------------------------------------------------------


@pytest.fixture
def e2b() -> FakeE2B:
    return FakeE2B()


@pytest.fixture
def dials() -> Iterator[list[tuple[str, dict[str, str]]]]:
    """Every health check the broker makes: the URL and the extra headers."""
    seen: list[tuple[str, dict[str, str]]] = []

    async def healthy(url: str, token: str, headers: Any = None) -> bool:
        seen.append((url, dict(headers or {})))
        return True

    box_service.set_health_check_for_tests(healthy)
    yield seen
    box_service.set_health_check_for_tests(None)


@pytest.fixture
def fleet(e2b: FakeE2B, user: User) -> Iterator[tuple[FakeBoxHost, E2BBoxHost]]:
    """box2 as it is today, and an E2B server for the founder only."""
    docker = FakeBoxHost("us-west-1")
    cloud = _host(e2b, users=(user.email.lower(),), idle_after=timedelta(minutes=10))
    box_hosts.set_box_host_for_tests([docker, cloud])
    yield docker, cloud
    box_hosts.set_box_host_for_tests(None)


@pytest.mark.asyncio
class TestOnE2B:
    async def test_a_listed_person_gets_a_frozen_computer_reached_with_its_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
    ) -> None:
        docker, cloud = fleet
        access, _ = await _signed_in(client, session, user)
        response = await _ensure(client, access)
        assert response.status_code == 200, response.text
        box = await _box_of(session, user)
        assert box.provider == "e2b-1"
        assert box.provider_box_id == "sbx1"
        assert box.host_meta == {"kind": "e2b", "traffic_token": "traffic-sbx1"}
        assert broker.internal_url(box, 1340) == "https://1340-sbx1.e2b.app"
        assert broker.internal_url(box, 6080) == "https://6080-sbx1.e2b.app"
        assert dial_headers(box) == {"e2b-traffic-access-token": "traffic-sbx1"}
        # The readiness check went to E2B's address with the token.
        assert (
            "https://1340-sbx1.e2b.app",
            {"e2b-traffic-access-token": "traffic-sbx1"},
        ) in dials
        # The app is told the API's own proxy, never E2B's address.
        body = response.json()
        assert "e2b.app" not in str(body)

        # Somebody else, not listed, stays on Docker.
        other, _ = await _signed_in(client, session, user_second)
        assert (await _ensure(client, other)).status_code == 200
        assert len(docker.created) == 1
        assert len(e2b.created) == 1
        assert (await _box_of(session, user_second)).host_meta == {}

    async def test_a_listed_persons_computer_moves_over_through_its_backup(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        backups: Any,
    ) -> None:
        docker, cloud = fleet
        cloud.users = ()
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        before = await _box_of(session, user)
        assert before.provider == "us-west-1"
        old = before.provider_box_id

        # Listed on E2B: the next EnsureSandBox moves the computer.
        cloud.users = (user.email.lower(),)
        assert (await _ensure(client, access)).status_code == 200
        session.expunge_all()
        after = await _box_of(session, user)
        assert after.id == before.id
        assert after.provider == "e2b-1"
        assert after.provider_box_id == "sbx1"
        # The backup was brought up to date first, and the new computer
        # copies it in.
        assert backups.flushes
        env = e2b.boxes["sbx1"]["files"]["/run/simeon/box.env"][0]
        assert "export SIMEON_BOX_STORE_RESTORE='always'" in env
        # The Docker computer is stopped, not removed: its files stay there.
        assert docker.boxes[old]["running"] is False
        assert docker.removed == []

        # Steady: no second move, no second computer.
        assert (await _ensure(client, access)).status_code == 200
        assert len(e2b.created) == 1

    async def test_a_move_that_fails_leaves_a_working_computer_where_it_was(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        backups: Any,
    ) -> None:
        """16 October 2026: listed on E2B before its template was built.
        Asking for the new computer's credential replaced the old one's, so
        the old computer is made again on box2, on its own files, and the
        move is not tried again at once."""
        docker, cloud = fleet
        cloud.users = ()
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        before = await _box_of(session, user)
        old = before.provider_box_id
        old_credential = before.credential_session_id

        cloud.users = (user.email.lower(),)
        e2b.create_error = SandboxNotFoundException("template simeon-box not found")
        assert (await _ensure(client, access)).status_code == 200
        session.expunge_all()
        after = await _box_of(session, user)
        assert after.provider == "us-west-1"
        assert after.provider_box_id != old
        assert after.credential_session_id not in (None, old_credential)
        assert (old, []) in docker.removed
        assert len(docker.created) == 2
        assert docker.created[1].workspace_volume == docker.created[0].workspace_volume
        assert e2b.boxes == {}

        # Held: the next EnsureSandBox does not try E2B again.
        e2b.create_error = None
        assert (await _ensure(client, access)).status_code == 200
        assert e2b.created == []
        box_service._move_held.clear()

    async def test_no_move_without_an_up_to_date_backup(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        backups: Any,
    ) -> None:
        docker, cloud = fleet
        cloud.users = ()
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        cloud.users = (user.email.lower(),)
        backups.flushed = False
        assert (await _ensure(client, access)).status_code == 200
        assert (await _box_of(session, user)).provider == "us-west-1"
        assert e2b.created == []
        assert all(box["running"] for box in docker.boxes.values())

    async def test_a_sleeping_computer_on_an_old_template_is_woken_backed_up_and_replaced(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        backups: Any,
    ) -> None:
        _, cloud = fleet
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        box = await _box_of(session, user)
        await broker.hibernate(session, cloud, box, force=True)
        assert e2b.boxes["sbx1"]["state"] == "paused"

        cloud.template = "simeon-box-v2"
        assert (await _ensure(client, access)).status_code == 200
        # Woken first, so its backup could be brought up to date.
        assert ("connect", "sbx1") in e2b.calls
        assert backups.flushes
        assert "sbx1" not in e2b.boxes
        assert e2b.created[-1]["template"] == "simeon-box-v2"
        session.expunge_all()
        replaced = await _box_of(session, user)
        assert replaced.provider_box_id == "sbx2"
        assert replaced.host_meta["traffic_token"] == "traffic-sbx2"
        env = e2b.boxes["sbx2"]["files"]["/run/simeon/box.env"][0]
        assert "export SIMEON_BOX_STORE_RESTORE='always'" in env

    async def test_an_old_computer_whose_backup_fails_is_kept(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        backups: Any,
    ) -> None:
        _, cloud = fleet
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        cloud.template = "simeon-box-v2"
        backups.flushed = False
        assert (await _ensure(client, access)).status_code == 200
        # Its files live only on its own disk: it stays until they are safe.
        assert list(e2b.boxes) == ["sbx1"]
        assert len(e2b.created) == 1

    async def test_the_sleeper_keeps_it_awake_then_freezes_it_after_its_own_idle_time(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        fleet: tuple[FakeBoxHost, E2BBoxHost],
        e2b: FakeE2B,
        dials: list[tuple[str, dict[str, str]]],
        health: Any,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        box = await _box_of(session, user)
        repository = SandBoxRepository.from_session(session)

        # Five minutes idle, under the server's ten: awake, its E2B timeout
        # pushed out so E2B does not pause it on its own.
        box.last_active_at = utc_now() - timedelta(minutes=5)
        await repository.update(box, flush=True)
        assert await broker.hibernate_idle(session, redis) == []
        assert ("set_timeout", "sbx1") in e2b.calls

        # Eleven: frozen, well before the 30 minutes Docker computers wait.
        box.last_active_at = utc_now() - timedelta(minutes=11)
        await repository.update(box, flush=True)
        assert await broker.hibernate_idle(session, redis) == [box.id]
        assert e2b.boxes["sbx1"]["state"] == "paused"
        assert box.state == "hibernated"

        # And back in one call.
        assert await broker.wake(session, user.id) == "woken"
        assert e2b.boxes["sbx1"]["state"] == "running"


@pytest.mark.asyncio
async def test_the_proxy_dials_e2b_with_the_boxes_traffic_token(
    client: httpx.AsyncClient,
    session: AsyncSession,
    user: User,
    fleet: tuple[FakeBoxHost, E2BBoxHost],
    dials: list[tuple[str, dict[str, str]]],
) -> None:
    access, _ = await _signed_in(client, session, user)
    box_json = (await _ensure(client, access)).json()
    seen: list[dict[str, Any]] = []

    async def e2b_proxy(scope: Any, receive: Any, send: Any) -> None:
        seen.append(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.ASGITransport(app=e2b_proxy))
    )
    try:
        response = await client.get(
            f"/sand-box/{box_json['podId']}/p/1340/health",
            headers={"x-anyrun-network-token": box_json["networkToken"]},
        )
    finally:
        box_proxy.set_client_factory_for_tests(None)
    assert response.status_code == 200, response.text
    (scope,) = seen
    headers = {k.decode(): v.decode() for k, v in scope["headers"]}
    assert (scope["scheme"], scope["path"]) == ("https", "/health")
    assert headers["e2b-traffic-access-token"] == "traffic-sbx1"
    # The API's own host never reaches E2B's proxy, which routes by it.
    assert headers["host"] == "1340-sbx1.e2b.app"
