"""Simeon's cloud computer on Azure Container Apps Sandboxes (12 November 2026).

`AzureBoxHost` against a stand-in Azure: Microsoft's sign-in and the sandbox
group's data plane, answered by httpx's `MockTransport` from a dict of
sandboxes, every call recorded. Alone first, then behind the broker path the
app calls (`EnsureSandBox`), the sleeper and the proxy. Nothing reaches
Microsoft.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from pytest_mock import MockerFixture
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_azure, box_hosts, box_proxy, box_service
from simeon.sand.box_azure import (
    API_VERSION,
    DATA_SCOPES,
    ENV_FILE,
    MODE_PRIVATE,
    MODE_SCRIPT,
    PORT_SCOPE,
    READY_FILE,
    RESOURCES,
    RESUME_ASK_AGAIN_S,
    RESUME_DEADLINE_S,
    SEED_FILE,
    VM_INIT,
    AzureBoxHost,
    AzureCredential,
    is_label_value,
    joined_sha,
    label_value,
    split_sha,
)
from simeon.sand.box_e2b import (
    ENGINE_NEXT_SUFFIX,
    ENGINE_UPDATE_SCRIPT,
    EXEC_DAEMON_MAIN,
    HOST_MAIN,
    TMP_ON_DISK,
    env_file,
    machine_id_of,
)
from simeon.sand.box_hosts import (
    BOX_PORTS,
    HOST_COMPANIONS,
    BoxBlocked,
    BoxHostError,
    BoxHostUnavailable,
    BoxSpec,
    HostBundle,
    box_host_entries,
)
from simeon.sand.box_repository import SandBoxRepository
from simeon.sand.box_service import BOX_AUTH_HEADER, broker, dial_headers
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import FakeBoxHost, _ensure, backups
from tests.sand.test_box_sleep import _box_of, health

__all__ = ["backups", "health"]

WORKERS = {name: f"// {name}".encode() for name in HOST_COMPANIONS}
BUNDLE = HostBundle(b"// host", b"// exec daemon", WORKERS)
NEXT_BUNDLE = HostBundle(b"// host 2", b"// exec daemon 2", WORKERS)

SUBSCRIPTION = "sub-0000"
TENANT = "tenant-0000"
CLIENT = "client-0000"
#: A stand-in's, not a real secret.
CLIENT_SECRET = "stand-in-secret"
SERVER_OBJECT = "object-0000"
REGION = "westus3"
DATA_HOST = f"management.{REGION}.azuredevcompute.io"
GROUP_PATH = (
    f"/subscriptions/{SUBSCRIPTION}/resourceGroups/simeon-computers"
    "/sandboxGroups/simeon-computers"
)


def _port_url(sandbox_id: str, port: int) -> str:
    return f"https://{sandbox_id}--{port}.{REGION}.adcproxy.io"


class Clock:
    """Time as the host reads it, moved only by its own pauses."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    async def pause(self, seconds: float) -> None:
        self.now += seconds


class FakeAzure:
    """Microsoft's sign-in and a sandbox group's data plane, over a dict."""

    def __init__(self) -> None:
        self.sandboxes: dict[str, dict[str, Any]] = {}
        self.created: list[dict[str, Any]] = []
        #: Every file written: (sandbox, path) → (bytes, mode as sent).
        self.files: dict[tuple[str, str], tuple[bytes, str]] = {}
        #: The paths written, in order.
        self.writes: list[str] = []
        self.execs: list[tuple[str, str]] = []
        self.calls: list[tuple[str, str]] = []
        self.sign_ins: list[str] = []
        self.disk_images = [{"id": "di-0001", "name": "simeon-box"}]
        self.refuse_sign_in = False
        #: The data plane takes only the older audience's token.
        self.older_audience_only = False
        #: What the data plane answers instead, by "<METHOD> <last segment>".
        self.forced: dict[str, httpx.Response] = {}
        #: The resume that hangs (#1869): "resuming" stays resuming,
        #: "unanswered" never answers, "refused" answers 500 and stays asleep.
        self.resume_hangs: str | None = None
        #: The image holds the host's workers (box2's image does).
        self.image_workers = False
        self.tmp_answer = "tmp=moved"
        self.engine_answer = "engine=restarted"
        #: Sandboxes listed one per page, to follow `nextLink`.
        self.one_per_page = False
        self._next = 0

    # --- the transport ---------------------------------------------------------

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "login.microsoftonline.com":
            return self._sign_in(request)
        assert request.url.host == DATA_HOST, request.url
        assert request.url.params["api-version"] == API_VERSION
        wanted = DATA_SCOPES[1] if self.older_audience_only else DATA_SCOPES[0]
        if request.headers.get("authorization") != f"Bearer token:{wanted}":
            return httpx.Response(
                401, json={"error": {"code": "InvalidAuthenticationToken"}}
            )
        assert request.url.path.startswith(GROUP_PATH), request.url.path
        path = request.url.path[len(GROUP_PATH) :]
        self.calls.append((request.method, path))
        forced = self.forced.get(f"{request.method} {path.rsplit('/', 1)[-1]}")
        if forced is not None:
            return forced
        parts = path.strip("/").split("/")
        if parts[0] == "diskimages":
            return self._disk_image(parts)
        if parts == ["sandboxes"] and request.method == "POST":
            return self._create(json.loads(request.content))
        if parts == ["sandboxes"]:
            return self._list(request)
        sandbox = self.sandboxes.get(parts[1])
        verb = parts[2] if len(parts) > 2 else ""
        if sandbox is None:
            return httpx.Response(404, json={"error": {"code": "NotFound"}})
        if request.method == "GET":
            return httpx.Response(200, json=self._read(sandbox))
        if request.method == "DELETE":
            del self.sandboxes[parts[1]]
            return httpx.Response(202)
        if verb == "files":
            return self._file(parts[1], request)
        if verb == "executeShellCommand":
            return self._exec(parts[1], json.loads(request.content))
        if verb == "stop":
            sandbox["state"] = "Stopping"
            return httpx.Response(200, json={"id": "snap-1"})
        if verb == "resume":
            return self._resume(sandbox)
        if verb == "enable":
            sandbox.pop("stateDetails", None)
            return httpx.Response(200, json={})
        raise AssertionError(f"unexpected call {request.method} {path}")

    def _sign_in(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/{TENANT}/oauth2/v2.0/token"
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        assert form["grant_type"] == "client_credentials"
        assert (form["client_id"], form["client_secret"]) == (CLIENT, CLIENT_SECRET)
        self.sign_ins.append(form["scope"])
        if self.refuse_sign_in:
            return httpx.Response(
                401,
                json={
                    "error": "invalid_client",
                    "error_description": "AADSTS7000215: Invalid client secret.",
                },
            )
        return httpx.Response(
            200,
            json={"access_token": f"token:{form['scope']}", "expires_in": 3599},
        )

    def _disk_image(self, parts: list[str]) -> httpx.Response:
        if len(parts) == 2:
            for image in self.disk_images:
                if image["id"] == parts[1]:
                    return httpx.Response(200, json=image)
            return httpx.Response(404, json={"error": {"code": "NotFound"}})
        return httpx.Response(200, json={"value": self.disk_images})

    def _create(self, body: dict[str, Any]) -> httpx.Response:
        # As Azure does (12 November 2026): a label that breaks Kubernetes' rule is refused.
        if not all(
            is_label_value(key) and is_label_value(value)
            for key, value in body.get("labels", {}).items()
        ):
            return httpx.Response(
                400,
                json={
                    "error": {
                        "code": "InvalidRequest",
                        "message": "The request is invalid or malformed.",
                    }
                },
            )
        self._next += 1
        sandbox_id = f"sb{self._next}"
        self.created.append(body)
        self.sandboxes[sandbox_id] = {
            "id": sandbox_id,
            "state": "Creating",
            "labels": dict(body["labels"]),
            "region": REGION,
        }
        return httpx.Response(201, json={"id": sandbox_id, "state": "Creating"})

    def _read(self, sandbox: dict[str, Any]) -> dict[str, Any]:
        answer = {
            **sandbox,
            "ports": [
                {"port": port, "url": _port_url(sandbox["id"], port) + "/"}
                for port in BOX_PORTS
            ],
        }
        # Each read moves a box on, as the service does in a second or two.
        moves = {"Creating": "Running", "Stopping": "Stopped"}
        if self.resume_hangs != "resuming":
            moves["Resuming"] = "Running"
        sandbox["state"] = moves.get(sandbox["state"], sandbox["state"])
        return answer

    def _list(self, request: httpx.Request) -> httpx.Response:
        key, _, value = request.url.params["labels"].partition("=")
        found = [
            {"id": sandbox_id}
            for sandbox_id, sandbox in self.sandboxes.items()
            if sandbox["labels"].get(key) == value
        ]
        if not self.one_per_page:
            return httpx.Response(200, json={"value": found})
        start = int(request.url.params.get("skipToken") or 0)
        body: dict[str, Any] = {"value": found[start : start + 1]}
        if start + 1 < len(found):
            body["nextLink"] = (
                f"https://{DATA_HOST}{GROUP_PATH}/sandboxes?skipToken={start + 1}"
            )
        return httpx.Response(200, json=body)

    def _file(self, sandbox_id: str, request: httpx.Request) -> httpx.Response:
        params = request.url.params
        assert params["createDirs"] == "true"
        assert request.headers["content-type"] == "application/octet-stream"
        self.files[(sandbox_id, params["path"])] = (request.content, params["mode"])
        self.writes.append(params["path"])
        return httpx.Response(201)

    def _exec(self, sandbox_id: str, body: dict[str, Any]) -> httpx.Response:
        assert (body["shell"], body["user"]) == ("/bin/bash", "root")
        command = body["command"]
        self.execs.append((sandbox_id, command))
        out = ""
        if "then echo image" in command:
            out = "image" if self.image_workers else "bundle"
        elif command == TMP_ON_DISK:
            out = self.tmp_answer
        elif command == f"bash {ENGINE_UPDATE_SCRIPT}":
            out = f"stopping\n{self.engine_answer}\n"
        return httpx.Response(200, json={"exitCode": 0, "stdout": out, "stderr": ""})

    def _resume(self, sandbox: dict[str, Any]) -> httpx.Response:
        if self.resume_hangs == "unanswered":
            raise httpx.ReadTimeout("no answer")
        if self.resume_hangs == "refused":
            return httpx.Response(500, json={"error": {"code": "InternalError"}})
        if sandbox["state"] == "Stopping":
            # The freeze still holds it.
            return httpx.Response(
                409, json={"title": "Conflict", "errorCode": "ResourceLocked"}
            )
        sandbox["state"] = "Resuming"
        return httpx.Response(200, json={})

    # --- what the tests read -------------------------------------------------

    def asked(self, verb: str) -> list[tuple[str, str]]:
        return [call for call in self.calls if call[1].endswith(f"/{verb}")]


def _signer(azure: FakeAzure) -> AzureCredential:
    return AzureCredential(
        tenant_id=TENANT,
        client_id=CLIENT,
        client_secret=CLIENT_SECRET,
        transport=azure.transport(),
    )


def _host(
    azure: FakeAzure,
    clock: Clock | None = None,
    *,
    name: str = "azure-1",
    bundle: HostBundle | None = BUNDLE,
    **kw: Any,
) -> AzureBoxHost:
    clock = clock or Clock()
    return AzureBoxHost(
        name=name,
        disk_image="simeon-box",
        bundle=bundle,
        subscription_id=SUBSCRIPTION,
        resource_group="simeon-computers",
        sandbox_group="simeon-computers",
        region=REGION,
        tenant_id=TENANT,
        server_object_id=SERVER_OBJECT,
        signer=_signer(azure),
        transport=azure.transport(),
        pause=clock.pause,
        clock=clock,
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


# --- Microsoft's sign-in -----------------------------------------------------------


@pytest.mark.asyncio
class TestSignIn:
    async def test_one_sign_in_per_audience_kept_until_it_ends(self) -> None:
        azure = FakeAzure()
        signer = _signer(azure)
        assert await signer.token(PORT_SCOPE) == f"token:{PORT_SCOPE}"
        assert await signer.token(PORT_SCOPE) == f"token:{PORT_SCOPE}"
        assert await signer.token(DATA_SCOPES[0]) == f"token:{DATA_SCOPES[0]}"
        assert azure.sign_ins == [PORT_SCOPE, DATA_SCOPES[0]]

        # Five minutes before it ends, a token is asked for again.
        signer._tokens[PORT_SCOPE].expires_at -= 3599 - 299
        await signer.token(PORT_SCOPE)
        assert azure.sign_ins == [PORT_SCOPE, DATA_SCOPES[0], PORT_SCOPE]

    async def test_a_refused_sign_in_names_the_settings_never_the_secret(
        self,
    ) -> None:
        azure = FakeAzure()
        azure.refuse_sign_in = True
        with capture_logs() as logs, pytest.raises(BoxHostUnavailable) as raised:
            await _signer(azure).token(PORT_SCOPE)
        assert "invalid_client" in str(raised.value)
        assert "SIMEON_AZURE_CLIENT_SECRET" in str(raised.value)
        assert CLIENT_SECRET not in str(raised.value)
        (line,) = [e for e in logs if e["event"] == "sand.box.azure.sign_in_refused"]
        assert CLIENT_SECRET not in str(line)

    async def test_without_the_identity_nothing_is_asked(self) -> None:
        azure = FakeAzure()
        signer = AzureCredential(
            tenant_id=TENANT,
            client_id="",
            client_secret="",
            transport=azure.transport(),
        )
        with pytest.raises(BoxHostUnavailable, match="SIMEON_AZURE_CLIENT_ID"):
            await signer.token(PORT_SCOPE)
        assert azure.sign_ins == []

    async def test_the_data_plane_falls_back_to_the_older_audience_once(
        self,
    ) -> None:
        azure = FakeAzure()
        azure.older_audience_only = True
        host = _host(azure)
        azure.sandboxes["sb9"] = {"id": "sb9", "state": "Running", "labels": {}}
        assert await host.run_state("sb9") == "running"
        assert await host.run_state("sb9") == "running"
        # Asked with the new audience, refused, then the older one, kept.
        assert azure.sign_ins == list(DATA_SCOPES)


# --- the host alone ---------------------------------------------------------------


@pytest.mark.asyncio
class TestAzureHost:
    async def test_a_new_computer_is_made_locked_and_started(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        spec = _spec()
        made = await host.create(spec)

        (body,) = azure.created
        assert body["sourcesRef"] == {"diskImage": {"id": "di-0001", "isPublic": False}}
        assert (
            body["resources"]
            == RESOURCES
            == {
                "cpu": "2000m",
                "memory": "4096Mi",
                "disk": "40Gi",
            }
        )
        assert body["entrypoint"] == [VM_INIT]
        # The sleeper decides when it sleeps; Azure never does on its own.
        assert body["lifecycle"] == {
            "autoSuspendPolicy": {"enabled": False, "mode": "Memory"},
            "autoDeletePolicy": {"enabled": False},
        }
        assert body["labels"] == {
            "simeon_box": spec.name,
            "disk_image": "simeon-box",
            "host_sha256_a": BUNDLE.folder_sha256[:32],
            "host_sha256_b": BUNDLE.folder_sha256[32:],
            "box_store": "1",
        }
        # Azure refuses a box whose labels break Kubernetes' rule (12 November
        # 2026: "400 InvalidRequest" for "azure:…" and a 64-character value).
        for key, value in body["labels"].items():
            assert is_label_value(key), key
            assert is_label_value(value), (key, value)
        # Every port asks for Microsoft's sign-in and admits only the server.
        assert [port["port"] for port in body["ports"]] == list(BOX_PORTS)
        for port in body["ports"]:
            assert port["activationMode"] == "Manual"
            assert port["auth"] == {
                "anonymous": False,
                "entraId": {
                    "enabled": True,
                    "tenantIds": [TENANT],
                    "objectIds": [SERVER_OBJECT],
                },
            }

        # The person's settings and randomness for the owner only, the
        # machine's own id, the engine, then the mark that starts the stack.
        files = azure.files
        assert files[("sb1", ENV_FILE)] == (
            env_file(spec.environment()).encode(),
            str(MODE_PRIVATE),
        )
        seed, seed_mode = files[("sb1", SEED_FILE)]
        assert (len(seed), seed_mode) == (64, "384")
        assert (
            files[("sb1", "/etc/machine-id")][0]
            == (machine_id_of(spec.name) + "\n").encode()
        )
        assert files[("sb1", HOST_MAIN)] == (b"// host", "420")
        assert files[("sb1", EXEC_DAEMON_MAIN)][0] == b"// exec daemon"
        assert azure.writes[-1] == READY_FILE
        commands = [command for _, command in azure.execs]
        assert TMP_ON_DISK in commands
        assert any(command.startswith("date -u -s @") for command in commands)

        # What the broker keeps: the region's proxy and each port's address.
        assert made.provider_box_id == "sb1"
        assert made.host_address == f"{REGION}.adcproxy.io"
        assert made.image == "azure:simeon-box"
        assert made.host_sha256 == BUNDLE.folder_sha256
        assert made.box_store == "1"
        assert made.host_meta == {
            "kind": "azure",
            "region": REGION,
            **{f"url_{port}": _port_url("sb1", port) for port in BOX_PORTS},
        }

    async def test_the_disk_image_is_found_by_its_name_once(self) -> None:
        azure = FakeAzure()
        azure.disk_images = [
            {"id": "di-0000", "name": "older"},
            {"id": "di-0002", "name": "simeon-box"},
        ]
        host = _host(azure)
        await host.create(_spec())
        await host.create(_spec(name="simeon-box-" + "cd" * 16))
        assert [b["sourcesRef"]["diskImage"]["id"] for b in azure.created] == [
            "di-0002",
            "di-0002",
        ]
        assert azure.calls.count(("GET", "/diskimages")) == 1

    async def test_a_missing_disk_image_names_the_build(self) -> None:
        azure = FakeAzure()
        azure.disk_images = []
        with pytest.raises(BoxHostUnavailable, match="box/azure/build.sh"):
            await _host(azure).create(_spec())
        assert azure.created == []

    async def test_a_computer_that_does_not_boot_is_removed(self) -> None:
        azure = FakeAzure()
        azure.forced["POST files"] = httpx.Response(
            500, json={"error": {"code": "InternalError", "message": "disk"}}
        )
        with pytest.raises(BoxHostError, match="could not write a file"):
            await _host(azure).create(_spec())
        assert azure.sandboxes == {}
        assert ("DELETE", "/sandboxes/sb1") in azure.calls

    async def test_a_computer_that_fails_to_start_is_removed(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        original = azure._create

        def failing(body: dict[str, Any]) -> httpx.Response:
            answer = original(body)
            azure.sandboxes["sb1"]["state"] = "Failed"
            return answer

        azure._create = failing  # type: ignore[method-assign]
        with pytest.raises(BoxHostError, match="did not start"):
            await host.create(_spec())
        assert azure.sandboxes == {}

    async def test_without_the_bundle_or_the_identity_nothing_is_made(self) -> None:
        azure = FakeAzure()
        with pytest.raises(BoxHostUnavailable, match="SIMEON_BOX_HOST_BUNDLE_URL"):
            await _host(azure, bundle=None).create(_spec())
        host = _host(azure)
        host.server_object_id = ""
        with pytest.raises(BoxHostUnavailable, match="SIMEON_AZURE_SERVER_OBJECT_ID"):
            await host.create(_spec())
        assert azure.created == []

    async def test_on_box2s_image_only_the_engine_is_written(self) -> None:
        azure = FakeAzure()
        azure.image_workers = True
        await _host(azure).create(_spec())
        assert not any(path.endswith(HOST_COMPANIONS[0]) for path in azure.writes)
        assert HOST_MAIN in azure.writes

    async def test_states_map_onto_running_stopped_and_gone(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        for state, expected in [
            ("Running", "running"),
            ("Creating", "running"),
            ("Resuming", "running"),
            ("Stopped", "stopped"),
            ("Idle", "stopped"),
            ("Suspended", "stopped"),
            ("Stopping", "stopped"),
            ("Failed", None),
            ("Deleting", None),
        ]:
            azure.sandboxes["sb9"] = {"id": "sb9", "state": state, "labels": {}}
            azure.resume_hangs = "resuming"  # no read moves it on
            assert await host.run_state("sb9") == expected, state
        assert await host.run_state("gone") is None
        assert await host.inspect("gone") is None

    async def test_sleep_waits_for_the_freeze_and_wake_sets_the_clock(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        await host.create(_spec())
        azure.execs.clear()

        await host.stop("sb1")
        assert azure.sandboxes["sb1"]["state"] == "Stopped"
        assert await host.run_state("sb1") == "stopped"

        await host.start("sb1")
        assert azure.sandboxes["sb1"]["state"] == "Running"
        assert len(azure.asked("resume")) == 1
        ((_, command),) = azure.execs
        assert command.startswith("date -u -s @")

        # A box already awake is not asked to wake.
        await host.start("sb1")
        assert len(azure.asked("resume")) == 1

        # Asleep and gone are both fine to put to sleep, and gone to remove.
        await host.stop("sb1")
        await host.remove("sb1", volumes=[])
        await host.stop("sb1")
        await host.remove("sb1", volumes=[])
        assert azure.sandboxes == {}

    async def test_a_freeze_that_fails_is_an_error(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        azure.sandboxes["sb9"] = {"id": "sb9", "state": "StopFailed", "labels": {}}
        azure.forced["POST stop"] = httpx.Response(200, json={})
        with pytest.raises(BoxHostError, match="put to sleep"):
            await host.stop("sb9")

    async def test_a_disabled_computer_is_enabled_before_it_wakes(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        azure.sandboxes["sb9"] = {
            "id": "sb9",
            "state": "Stopped",
            "labels": {},
            "stateDetails": {"stoppedReason": "Disabled"},
        }
        await host.start("sb9")
        assert [verb for _, verb in azure.calls if verb.startswith("/sandboxes/sb9/")][
            :2
        ] == ["/sandboxes/sb9/enable", "/sandboxes/sb9/resume"]
        assert azure.sandboxes["sb9"]["state"] == "Running"

    async def test_a_wake_held_by_another_operation_is_waited_out(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        azure.sandboxes["sb9"] = {"id": "sb9", "state": "Stopped", "labels": {}}
        azure.forced["POST resume"] = httpx.Response(
            409, json={"title": "Conflict", "errorCode": "ResourceLocked"}
        )
        original = azure._read
        reads = {"n": 0}

        def read(sandbox: dict[str, Any]) -> dict[str, Any]:
            # The lock lifts after three reads; the next ask wakes it.
            reads["n"] += 1
            if reads["n"] == 3:
                azure.forced.pop("POST resume")
            return original(sandbox)

        azure._read = read  # type: ignore[method-assign]
        await host.start("sb9")
        assert azure.sandboxes["sb9"]["state"] == "Running"
        assert len(azure.asked("resume")) == 2

    async def test_a_wake_during_a_freeze_asks_again_as_soon_as_it_ends(
        self,
    ) -> None:
        azure = FakeAzure()
        clock = Clock()
        host = _host(azure, clock)
        azure.sandboxes["sb9"] = {"id": "sb9", "state": "Stopping", "labels": {}}
        original = azure._read
        reads = {"n": 0}

        def read(sandbox: dict[str, Any]) -> dict[str, Any]:
            # Still freezing after the first look: the first wake is refused.
            reads["n"] += 1
            answer = original(sandbox)
            if reads["n"] == 1:
                sandbox["state"] = "Stopping"
            return answer

        azure._read = read  # type: ignore[method-assign]
        await host.start("sb9")
        assert azure.sandboxes["sb9"]["state"] == "Running"
        assert len(azure.asked("resume")) == 2
        # Not the ten seconds a box that stays asleep waits.
        assert clock.now < RESUME_ASK_AGAIN_S

    @pytest.mark.parametrize("hang", ["resuming", "unanswered", "refused"])
    async def test_a_wake_that_hangs_removes_the_computer(self, hang: str) -> None:
        """Azure's open bug #1869: some resumes never end. After
        `RESUME_DEADLINE_S` the box is removed and the app's next try makes
        a new one from the backup."""
        azure = FakeAzure()
        clock = Clock()
        host = _host(azure, clock)
        azure.sandboxes["sb9"] = {"id": "sb9", "state": "Stopped", "labels": {}}
        azure.resume_hangs = hang
        with capture_logs() as logs, pytest.raises(BoxHostError, match="backup"):
            await host.start("sb9")
        assert clock.now == RESUME_DEADLINE_S
        assert azure.sandboxes == {}
        (line,) = [e for e in logs if e["event"] == "sand.box.azure.resume_failed"]
        assert line["waited_s"] == RESUME_DEADLINE_S
        asks = len([c for c in azure.calls if c == ("POST", "/sandboxes/sb9/resume")])
        if hang == "resuming":
            # It said it was waking: asked once, then waited.
            assert asks == 1
        else:
            # Still asleep: asked again every ten seconds.
            assert asks == 1 + int(RESUME_DEADLINE_S // RESUME_ASK_AGAIN_S)

    async def test_a_wake_into_a_computer_that_is_gone(self) -> None:
        azure = FakeAzure()
        with pytest.raises(BoxHostError, match="gone"):
            await _host(azure).start("sb404")

    async def test_azures_limits_hold_the_app_and_refusals_say_what_to_fix(
        self,
    ) -> None:
        azure = FakeAzure()
        host = _host(azure)
        for answer in [
            httpx.Response(429, json={"error": {"code": "TooManyRequests"}}),
            httpx.Response(
                400,
                json={
                    "title": "QuotaExceeded",
                    "detail": "Exceeded the cores quota for the region",
                },
            ),
        ]:
            azure.forced["POST sandboxes"] = answer
            with pytest.raises(BoxBlocked):
                await host.create(_spec())
        azure.forced["POST sandboxes"] = httpx.Response(
            403, json={"error": {"code": "AuthorizationFailed"}}
        )
        with pytest.raises(BoxHostUnavailable, match="SandboxGroup Data Owner"):
            await host.create(_spec())
        azure.forced["POST sandboxes"] = httpx.Response(
            400, json={"error": {"code": "InvalidPort", "message": "port 1340"}}
        )
        with pytest.raises(BoxHostError, match="InvalidPort: port 1340") as raised:
            await host.create(_spec())
        assert not isinstance(raised.value, BoxHostUnavailable)

        # A token refused on both audiences.
        azure.forced = {"GET sb9": httpx.Response(401, json={})}
        with pytest.raises(BoxHostUnavailable, match="SIMEON_AZURE_CLIENT_ID"):
            await _host(azure).run_state("sb9")

    async def test_a_name_is_looked_up_by_its_label_across_pages(self) -> None:
        azure = FakeAzure()
        azure.one_per_page = True
        host = _host(azure)
        name = "simeon-box-" + "ef" * 16
        for sandbox_id in ("sb7", "sb8"):
            azure.sandboxes[sandbox_id] = {
                "id": sandbox_id,
                "state": "Running",
                "labels": {"simeon_box": name},
            }
        azure.sandboxes["sb6"] = {
            "id": "sb6",
            "state": "Running",
            "labels": {"simeon_box": "someone else"},
        }
        await host.remove(name, volumes=["w", "d"])
        assert set(azure.sandboxes) == {"sb6"}

    async def test_a_new_engine_goes_onto_the_running_computer(self) -> None:
        azure = FakeAzure()
        host = _host(azure)
        await host.create(_spec())
        host.bundle = NEXT_BUNDLE
        azure.writes.clear()
        assert await host.update_in_place("sb1") == {"workers": "bundle"}
        assert azure.files[("sb1", f"{HOST_MAIN}{ENGINE_NEXT_SUFFIX}")][0] == (
            b"// host 2"
        )
        assert azure.files[("sb1", ENGINE_UPDATE_SCRIPT)][1] == str(MODE_SCRIPT)
        assert azure.writes[-1] == ENGINE_UPDATE_SCRIPT
        assert ("sb1", f"bash {ENGINE_UPDATE_SCRIPT}") in azure.execs

        azure.engine_answer = "engine=still-old"
        with pytest.raises(BoxHostError, match="still-old"):
            await host.update_in_place("sb1")


# --- the settings -----------------------------------------------------------------


def test_labels_follow_azures_rule() -> None:
    """Azure refused every box whose labels broke Kubernetes' rule (12 November 2026)."""
    assert not is_label_value("azure:simeon-box-9e492b56773b-202611122132")
    assert not is_label_value("a" * 64)
    assert is_label_value("simeon-box-9e492b56773b-202611122132")
    assert label_value("azure:simeon-box") == "azure-simeon-box"
    assert label_value("/x/" + "y" * 80) == "x-" + "y" * 60
    assert all(is_label_value(label_value(v)) for v in ["-a-", "a b", "é", "x" * 99])
    sha = BUNDLE.folder_sha256
    assert len(sha) == 64
    halves = split_sha(sha)
    assert all(is_label_value(v) and len(v) == 32 for v in halves.values())
    assert joined_sha(halves) == sha
    assert joined_sha({"host_sha256_a": sha[:32]}) is None


def test_a_box_made_from_another_disk_image_reads_as_that_image() -> None:
    """So a new disk image replaces the boxes made from the last one, and the current one's are kept."""
    host = _host(FakeAzure(), Clock())
    current = host._provisioned(
        {"id": "sb1", "labels": {"disk_image": label_value(host.disk_image)}}
    )
    older = host._provisioned(
        {"id": "sb2", "labels": {"disk_image": "simeon-box-older"}}
    )
    unlabelled = host._provisioned({"id": "sb3", "labels": {}})
    assert current.image == host.image_reference
    assert older.image == "azure:simeon-box-older"
    assert unlabelled.image == host.image_reference


class TestEntries:
    def test_an_azure_entry_takes_no_daemon_and_no_limit(
        self, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(
            settings,
            "BOX_HOSTS",
            '[{"name": "azure-1", "kind": "Azure", "users": ["*"],'
            '  "idle_minutes": 10, "template": "simeon-box-2"}]',
        )
        (entry,) = box_host_entries()
        assert (entry.kind, entry.template, entry.docker_host) == (
            "azure",
            "simeon-box-2",
            "",
        )
        assert entry.max_running is None
        mocker.patch.object(settings, "BOX_HOSTS", '[{"name": "x", "kind": "vm"}]')
        with pytest.raises(BoxHostUnavailable, match='"azure"'):
            box_host_entries()


@pytest.mark.asyncio
async def test_the_azure_provider_puts_everyone_on_one_server(
    mocker: MockerFixture,
) -> None:
    mocker.patch.object(settings, "BOX_HOST_PROVIDER", "azure")
    mocker.patch.object(settings, "BOX_HOSTS", "")
    mocker.patch.object(settings, "AZURE_DISK_IMAGE", "simeon-box")
    mocker.patch.object(box_hosts, "load_host_bundle", return_value=BUNDLE)
    mocker.patch.object(box_hosts, "_fleet_cache", None)
    (host,) = await box_hosts.resolve_box_hosts()
    assert isinstance(host, AzureBoxHost)
    assert (host.name, host.disk_image, host.image_reference) == (
        "azure",
        "simeon-box",
        "azure:simeon-box",
    )
    # No limit of ours: Azure's own show as the capacity hold.
    assert host.max_running == 0
    assert host.keeps_files is False
    assert host.bundle is BUNDLE


def test_the_settings_have_the_sandbox_group_and_no_secret_by_default() -> None:
    assert settings.AZURE_RESOURCE_GROUP == "simeon-computers"
    assert settings.AZURE_SANDBOX_GROUP == "simeon-computers"
    assert settings.AZURE_REGION == "westus3"
    assert settings.AZURE_CLIENT_SECRET == ""


# --- behind the broker -----------------------------------------------------------


@pytest.fixture
def azure() -> Iterator[FakeAzure]:
    fake = FakeAzure()
    box_azure.set_credential_for_tests(_signer(fake))
    yield fake
    box_azure.set_credential_for_tests(None)


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
def fleet(azure: FakeAzure, user: User) -> Iterator[tuple[FakeBoxHost, AzureBoxHost]]:
    """box2 as it is today, and an Azure server for the founder only."""
    docker = FakeBoxHost("us-west-1")
    cloud = _host(azure, users=(user.email.lower(),), idle_after=timedelta(minutes=10))
    box_hosts.set_box_host_for_tests([docker, cloud])
    yield docker, cloud
    box_hosts.set_box_host_for_tests(None)


PORT_TOKEN = {"authorization": f"Bearer token:{PORT_SCOPE}"}


@pytest.mark.asyncio
class TestOnAzure:
    async def test_a_listed_person_gets_a_computer_reached_with_the_servers_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, AzureBoxHost],
        azure: FakeAzure,
        dials: list[tuple[str, dict[str, str]]],
    ) -> None:
        docker, _ = fleet
        access, _ = await _signed_in(client, session, user)
        response = await _ensure(client, access)
        assert response.status_code == 200, response.text
        box = await _box_of(session, user)
        assert (box.provider, box.provider_box_id) == ("azure-1", "sb1")
        assert box.host_meta["kind"] == "azure"
        assert broker.internal_url(box, 1340) == _port_url("sb1", 1340)
        assert broker.internal_url(box, 6080) == _port_url("sb1", 6080)
        assert await dial_headers(box) == PORT_TOKEN
        # The readiness check went to the port's address with the token.
        assert (_port_url("sb1", 1340), PORT_TOKEN) in dials
        # The app is told the API's own proxy, never Azure's address.
        assert "adcproxy" not in str(response.json())
        assert docker.created == []

    async def test_the_sleeper_freezes_it_after_its_own_idle_time_and_it_wakes(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        fleet: tuple[FakeBoxHost, AzureBoxHost],
        azure: FakeAzure,
        dials: list[tuple[str, dict[str, str]]],
        health: Any,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        box = await _box_of(session, user)
        repository = SandBoxRepository.from_session(session)

        box.last_active_at = utc_now() - timedelta(minutes=5)
        await repository.update(box, flush=True)
        assert await broker.hibernate_idle(session, redis) == []
        assert azure.sandboxes["sb1"]["state"] == "Running"

        box.last_active_at = utc_now() - timedelta(minutes=11)
        await repository.update(box, flush=True)
        assert await broker.hibernate_idle(session, redis) == [box.id]
        assert azure.sandboxes["sb1"]["state"] == "Stopped"
        assert box.state == "hibernated"

        assert await broker.wake(session, user.id) == "woken"
        assert azure.sandboxes["sb1"]["state"] == "Running"

    async def test_a_failed_port_sign_in_is_an_unreachable_box_not_an_error(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, AzureBoxHost],
        azure: FakeAzure,
        dials: list[tuple[str, dict[str, str]]],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        box = await _box_of(session, user)
        box_azure.set_credential_for_tests(_signer(azure))
        azure.refuse_sign_in = True
        with capture_logs() as logs:
            assert await dial_headers(box) == {}
        assert "sand.box.azure.port_sign_in_failed" in [e["event"] for e in logs]


@pytest.mark.asyncio
async def test_the_proxy_dials_azure_with_the_servers_token_and_moves_ours_aside(
    client: httpx.AsyncClient,
    session: AsyncSession,
    user: User,
    fleet: tuple[FakeBoxHost, AzureBoxHost],
    dials: list[tuple[str, dict[str, str]]],
) -> None:
    access, _ = await _signed_in(client, session, user)
    box_json = (await _ensure(client, access)).json()
    seen: list[dict[str, Any]] = []

    async def azure_proxy(scope: Any, receive: Any, send: Any) -> None:
        seen.append(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.ASGITransport(app=azure_proxy))
    )
    try:
        response = await client.get(
            f"/sand-box/{box_json['podId']}/p/1340/health",
            headers={
                "x-anyrun-network-token": box_json["networkToken"],
                "authorization": "Bearer gw-password",
            },
        )
    finally:
        box_proxy.set_client_factory_for_tests(None)
    assert response.status_code == 200, response.text
    (scope,) = seen
    headers = {k.decode(): v.decode() for k, v in scope["headers"]}
    assert (scope["scheme"], scope["path"]) == ("https", "/health")
    # Microsoft's token for Azure's sign-in on the port; the gateway's own
    # password beside it, where the gateway reads it once Azure removed its.
    assert headers["authorization"] == PORT_TOKEN["authorization"]
    assert headers[BOX_AUTH_HEADER] == "Bearer gw-password"
    assert headers["host"] == f"sb1--1340.{REGION}.adcproxy.io"


# --- the image ---------------------------------------------------------------------

BOX_AZURE = Path(__file__).resolve().parents[3] / "box" / "azure"


def test_the_image_is_the_image_box2_runs_with_the_servers_paths() -> None:
    """box/azure/Dockerfile adds to the same image Docker runs on box2 and
    E2B runs as a template; its first process waits where the server writes
    (`box_azure.py`)."""
    dockerfile = (BOX_AZURE / "Dockerfile").read_text()
    image = f"{settings.BOX_IMAGE.split(':')[0]}@sha256:{settings.BOX_IMAGE_DIGEST}"
    assert f"FROM {image}\n" in dockerfile
    assert f'ENTRYPOINT ["{VM_INIT}"]' in dockerfile
    init = (BOX_AZURE / "simeon-vm-init").read_text()
    for path in (ENV_FILE, SEED_FILE, READY_FILE):
        directory, _, name = path.rpartition("/")
        assert f"STATE_DIR=${{SIMEON_STATE_DIR:-{directory}}}" in init
        assert f'"$STATE_DIR/{name}"' in init


def test_the_first_process_waits_for_the_server_then_starts_the_stack(
    tmp_path: Path,
) -> None:
    state, run, started = tmp_path / "state", tmp_path / "run", tmp_path / "started"
    start = tmp_path / "start"
    start.write_text(f"#!/usr/bin/env bash\ncat {run}/box.env > {started}\n")
    start.chmod(0o755)
    process = subprocess.Popen(
        ["bash", str(BOX_AZURE / "simeon-vm-init")],
        env={
            "PATH": os.environ["PATH"],
            "SIMEON_STATE_DIR": str(state),
            "SIMEON_RUN_DIR": str(run),
            "SIMEON_VM_START": str(start),
            "SIMEON_VM_INIT_POLL_S": "0.05",
        },
    )
    try:
        # Nothing starts before the mark, whatever is already written.
        deadline = time.monotonic() + 5
        while not (state / "init.log").exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        (state / "box.env").write_text("export SIMEON_X='1'\n")
        (state / "seed").write_bytes(b"r" * 64)
        time.sleep(0.3)
        assert process.poll() is None
        assert not started.exists()

        (state / "ready").write_text("1\n")
        assert process.wait(timeout=5) == 0
    finally:
        process.kill()
    assert started.read_text() == "export SIMEON_X='1'\n"
    assert oct((run / "box.env").stat().st_mode & 0o777) == "0o600"
    assert (run / "seed").read_bytes() == b"r" * 64
    assert not (state / "seed").exists(), "the randomness is used once"
    assert (state / "box.env").exists(), "the settings stay for a fresh start"
    assert "waiting for the server" in (state / "init.log").read_text()


def test_a_ready_mark_without_settings_starts_nothing(tmp_path: Path) -> None:
    state = tmp_path / "state"
    state.mkdir()
    (state / "ready").write_text("1\n")
    done = subprocess.run(
        ["bash", str(BOX_AZURE / "simeon-vm-init")],
        env={
            "PATH": os.environ["PATH"],
            "SIMEON_STATE_DIR": str(state),
            "SIMEON_RUN_DIR": str(tmp_path / "run"),
            "SIMEON_VM_START": "/bin/false",
        },
        timeout=10,
    )
    assert done.returncode == 64
