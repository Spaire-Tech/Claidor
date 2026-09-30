"""`DockerBoxHost` against a fake Docker Engine API (25 September 2026).

The fake answers the seven calls the provider makes the way a daemon
does: create (404 until the image is pulled, 409 on a name in use), the
image pull stream, the archive upload, start, inspect, stop, remove.
What is asserted is that the container the provider asks for is the
one the Mac asks for in `local-docker-host-connector.ts`: the image,
the environment, the labels, the two volumes, the published ports, the
platform, and the host bundle at the two bind-mount paths.
"""

from __future__ import annotations

import io
import tarfile
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.sand import box_hosts
from simeon.sand.box_hosts import (
    BOX_HOST_BUNDLE_ROOT,
    BoxHostError,
    BoxSpec,
    DockerBoxHost,
    HostBundle,
    box_image_reference,
    docker_client_from_settings,
)


@pytest.fixture(autouse=True)
def _fresh_bundle_cache() -> Any:
    # The provider remembers which host folders it filled, per process.
    box_hosts._installed_bundle_dirs.clear()
    yield
    box_hosts._installed_bundle_dirs.clear()


class FakeDaemon:
    def __init__(self) -> None:
        self.app = FastAPI()
        self.images: set[str] = set()
        self.containers: dict[str, dict[str, Any]] = {}
        self.archives: list[tuple[str, str, bytes]] = []
        # The helper binds /bundle, which Docker makes; the box image has
        # /home/box/box-exec-daemon and no /home/box/sand-host.
        self.existing_dirs = {"/", "/bundle", "/home/box/box-exec-daemon"}
        self.volumes_removed: list[str] = []
        self.pulls: list[dict[str, str]] = []
        self.serial = 0
        self._install()

    def _install(self) -> None:
        app = self.app

        @app.post("/images/create")
        async def pull(request: Request) -> Response:
            params = dict(request.query_params)
            self.pulls.append(params)
            image = params["fromImage"] + (
                f":{params['tag']}" if "tag" in params else ""
            )
            self.images.add(image)
            return Response(
                content=b'{"status":"Pulling"}\n{"status":"Done"}\n',
                media_type="application/json",
            )

        @app.post("/containers/create")
        async def create(request: Request) -> Response:
            body = await request.json()
            name = request.query_params["name"]
            if body["Image"] not in self.images:
                return JSONResponse({"message": "No such image"}, status_code=404)
            if any(c["Name"] == name for c in self.containers.values()):
                return JSONResponse({"message": "Conflict"}, status_code=409)
            self.serial += 1
            container_id = f"{self.serial:064x}"
            self.containers[container_id] = {
                "Id": container_id,
                "Name": name,
                "Image": "sha256:" + "ab" * 32,
                "Config": {
                    "Image": body["Image"],
                    "Env": body.get("Env", []),
                    "Labels": body["Labels"],
                },
                "HostConfig": body["HostConfig"],
                "State": {"Running": False},
                "platform": request.query_params.get("platform"),
            }
            return JSONResponse({"Id": container_id, "Warnings": []}, status_code=201)

        @app.put("/containers/{container_id}/archive")
        async def archive(container_id: str, request: Request) -> Response:
            path = request.query_params["path"]
            # Docker refuses a target directory the container does not
            # have (404 "Could not find the file"); the box image has no
            # /home/box/sand-host.
            if path not in self.existing_dirs:
                return JSONResponse(
                    {"message": f"Could not find the file {path} in container"},
                    status_code=404,
                )
            data = await request.body()
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as tar:
                for member in tar.getmembers():
                    extracted = tar.extractfile(member)
                    self.archives.append(
                        (
                            container_id,
                            f"{path.rstrip('/')}/{member.name}",
                            extracted.read() if extracted else b"",
                        )
                    )
            return Response(status_code=200)

        @app.post("/containers/{container_id}/start")
        async def start(container_id: str) -> Response:
            container = self.containers[container_id]
            container["State"]["Running"] = True
            ports = {}
            for index, key in enumerate(container["HostConfig"]["PortBindings"]):
                ports[key] = [{"HostIp": "0.0.0.0", "HostPort": str(32768 + index)}]
            container["NetworkSettings"] = {"Ports": ports}
            return Response(status_code=204)

        @app.post("/containers/{container_id}/stop")
        async def stop(container_id: str) -> Response:
            self.containers[container_id]["State"]["Running"] = False
            return Response(status_code=204)

        @app.get("/containers/{container_id}/json")
        async def inspect(container_id: str) -> Response:
            found = self.containers.get(container_id) or next(
                (c for c in self.containers.values() if c["Name"] == container_id), None
            )
            if found is None:
                return JSONResponse({"message": "No such container"}, status_code=404)
            return JSONResponse(found)

        @app.delete("/containers/{container_id}")
        async def remove(container_id: str) -> Response:
            found = self.containers.get(container_id) or next(
                (c for c in self.containers.values() if c["Name"] == container_id), None
            )
            if found is None:
                return Response(status_code=404)
            del self.containers[found["Id"]]
            return Response(status_code=204)

        @app.delete("/volumes/{name}")
        async def remove_volume(name: str) -> Response:
            self.volumes_removed.append(name)
            return Response(status_code=204)


def _spec(**overrides: Any) -> BoxSpec:
    values: dict[str, Any] = {
        "name": "simeon-box-abc",
        "gateway_token": "gw",
        "renewal_credential": "simeon_db_x",
        "backend_url": "https://api.simeonlabs.com",
        "image": box_image_reference(),
        "workspace_volume": "simeon-box-abc-workspace",
        "data_volume": "simeon-box-abc-data",
    }
    values.update(overrides)
    return BoxSpec(**values)


def _bundle_tar() -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, data in (
            ("host/host-main.cjs", b"host"),
            ("box-exec-daemon/main.cjs", b"daemon"),
            ("host/other.txt", b"x"),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_the_docker_provider_runs_the_macs_docker_run_with_the_bundle_mounted() -> (
    None
):
    daemon = FakeDaemon()
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=daemon.app), base_url="http://docker"
    )
    host = DockerBoxHost(
        client, host_address="box.example", bundle=HostBundle.from_tar(_bundle_tar())
    )
    spec = _spec()
    provisioned = await host.create(spec)
    # Pulled once (the image was not there), by the pinned digest (the
    # 16 September build the Mac runs), for amd64.
    assert daemon.pulls == [
        {
            "platform": "linux/amd64",
            # The Mac's form, tag and digest (localDockerBoxImageReference);
            # Docker pulls by the digest.
            "fromImage": "public.ecr.aws/k0i0n2g5/cursorenvironments/universal"
            ":sand-box-latest"
            "@sha256:322c3a9031d61e210a05400dd74c82bbb1fdb42db315a8cf5ab39368c2f0c1c8",
        }
    ]
    container = daemon.containers[provisioned.provider_box_id]
    assert container["platform"] == "linux/amd64"
    assert container["Config"]["Image"] == box_image_reference()
    env = dict(line.split("=", 1) for line in container["Config"]["Env"])
    assert env["SAND_SUPERVISOR_ENABLED"] == "1"
    assert env["SAND_BOX_AUTO_UPDATE"] == "0"
    assert env["SAND_USE_EXISTING_BOX_EXEC_DAEMON"] == "1"
    assert env["SAND_GATEWAY_BIND_HOST"] == "0.0.0.0"
    assert env["SAND_HOST_PORT"] == "1340"
    assert env["SAND_GATEWAY_TOKEN"] == "gw"
    assert env["SAND_BACKEND_URL"] == "https://api.simeonlabs.com"
    assert env["SAND_INFERENCE_RENEWAL_CREDENTIAL"] == "simeon_db_x"
    assert env["SAND_INFERENCE_PROVIDER"] == "simeon"
    assert env["SAND_DISABLE_TELEMETRY"] == "1"
    assert env["SAND_DISABLE_ANALYTICS"] == "1"
    assert env["SAND_BOX_LOG_SHIP_DISABLED"] == "1"
    assert "SAND_DEV_INFERENCE_TOKEN_FILE" not in env
    assert container["Config"]["Labels"]["com.simeonlabs.box"] == "1"
    assert container["Config"]["Labels"]["com.simeonlabs.box.schema-version"] == "10"
    assert container["HostConfig"]["RestartPolicy"] == {"Name": "unless-stopped"}
    assert env["SAND_DATA_ROOT"] == "/home/box/sand-data"
    # The Mac's layout: the host program and the exec daemon's folder
    # mounted read-only from the box host's disk, with their fingerprints.
    bundle = host.bundle
    assert bundle is not None
    folder = f"{BOX_HOST_BUNDLE_ROOT}/{bundle.key}"
    assert container["HostConfig"]["Binds"] == [
        "simeon-box-abc-workspace:/workspace",
        "simeon-box-abc-data:/home/box/sand-data",
        f"{folder}/host-main.cjs:/home/box/sand-host/host-main.cjs:ro",
        f"{folder}/box-exec-daemon:/home/box/box-exec-daemon:ro",
    ]
    labels = container["Config"]["Labels"]
    assert labels["com.simeonlabs.box.host-sha256"] == bundle.host_sha256
    assert (
        labels["com.simeonlabs.box.box-exec-daemon-sha256"]
        == bundle.box_exec_daemon_sha256
    )
    assert provisioned.host_sha256 == bundle.host_sha256
    assert host.expected_host_sha256 == bundle.host_sha256
    # A box made before the labels were renamed keeps its host version, so
    # the rename alone does not replace it.
    for key in list(labels):
        if key.startswith("com.simeonlabs.box"):
            labels["com.grok-bot.local-vm" + key.removeprefix("com.simeonlabs.box")] = (
                labels.pop(key)
            )
    legacy = await host.inspect(provisioned.provider_box_id)
    assert legacy is not None
    assert legacy.host_sha256 == bundle.host_sha256
    assert set(container["HostConfig"]["PortBindings"]) == {
        "1340/tcp",
        "6080/tcp",
        "6081/tcp",
        "8790/tcp",
    }
    # The bundle went to the box host's disk through a helper container
    # that binds the folder, was never started, and is gone.
    uploaded = {(path, data) for _, path, data in daemon.archives}
    assert uploaded == {
        ("/bundle/host-main.cjs", b"host"),
        ("/bundle/box-exec-daemon/main.cjs", b"daemon"),
    }
    helper_ids = {cid for cid, _, _ in daemon.archives}
    assert helper_ids.isdisjoint(daemon.containers)
    assert not any(
        c["Name"].startswith("simeon-host-bundle-") for c in daemon.containers.values()
    )
    # Published ports were read back, and the address is the VM's.
    assert provisioned.host_address == "box.example"
    assert set(provisioned.ports) == {1340, 6080, 6081, 8790}
    assert provisioned.image_digest == "ab" * 32
    assert await host.run_state(provisioned.provider_box_id) == "running"

    await host.stop(provisioned.provider_box_id)
    assert await host.run_state(provisioned.provider_box_id) == "stopped"
    await host.start(provisioned.provider_box_id)
    assert await host.run_state(provisioned.provider_box_id) == "running"

    # A name left behind by a lost row is replaced, not an error.
    again = await host.create(spec)
    assert again.provider_box_id != provisioned.provider_box_id
    assert provisioned.provider_box_id not in daemon.containers

    await host.remove(
        again.provider_box_id,
        volumes=["simeon-box-abc-workspace", "simeon-box-abc-data"],
    )
    assert await host.run_state(again.provider_box_id) is None
    assert daemon.volumes_removed == ["simeon-box-abc-workspace", "simeon-box-abc-data"]
    await client.aclose()


@pytest.mark.asyncio
async def test_without_a_bundle_the_image_is_trusted_to_carry_the_host() -> None:
    daemon = FakeDaemon()
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=daemon.app), base_url="http://docker"
    )
    host = DockerBoxHost(client, host_address="box.example", bundle=None)
    await host.create(_spec(image="ghcr.io/simeonlabs/box@sha256:" + "cd" * 32))
    assert daemon.archives == []
    assert daemon.pulls == [
        {
            "platform": "linux/amd64",
            "fromImage": "ghcr.io/simeonlabs/box@sha256:" + "cd" * 32,
        }
    ]
    await client.aclose()


@pytest.mark.asyncio
async def test_the_memory_and_cpu_caps_reach_the_engine() -> None:
    daemon = FakeDaemon()
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=daemon.app), base_url="http://docker"
    )
    host = DockerBoxHost(client, host_address="box.example", bundle=None)
    capped = await host.create(_spec(memory_mb=4096, cpus=2.0))
    config = daemon.containers[capped.provider_box_id]["HostConfig"]
    assert config["Memory"] == 4096 * 1024 * 1024
    assert config["MemorySwap"] == 4096 * 1024 * 1024
    assert config["NanoCpus"] == 2_000_000_000
    # Nothing else of the Mac's line moves.
    assert config["RestartPolicy"] == {"Name": "unless-stopped"}
    uncapped = await host.create(_spec(name="simeon-box-def"))
    config = daemon.containers[uncapped.provider_box_id]["HostConfig"]
    assert "Memory" not in config
    assert "NanoCpus" not in config
    await client.aclose()


def test_a_bundle_missing_a_file_is_refused_with_the_build_command() -> None:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        info = tarfile.TarInfo("host/host-main.cjs")
        info.size = 1
        tar.addfile(info, io.BytesIO(b"x"))
    with pytest.raises(BoxHostError, match="box-exec-daemon/main.cjs"):
        HostBundle.from_tar(buffer.getvalue())


@pytest.mark.asyncio
async def test_an_unreachable_daemon_is_one_sentence_not_a_500(
    mocker: MockerFixture,
) -> None:
    """The first real run failed 129 times as an unhandled 500 on a TLS
    refusal; the reason now reaches the app and the log as a sentence."""
    mocker.patch.object(settings, "BOX_DOCKER_HOST", "tcp://box.example:2376")
    mocker.patch.object(settings, "BOX_DOCKER_TLS_CERT", "")
    client = docker_client_from_settings()

    async def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(
            "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
            "CA cert does not include key usage extension",
            request=request,
        )

    inner = client._transport
    inner.inner = httpx.MockTransport(refuse)  # type: ignore[attr-defined]
    host = DockerBoxHost(client, host_address="box.example", bundle=None)
    with pytest.raises(BoxHostError) as raised:
        await host.run_state("abc")
    assert "tcp://box.example:2376 could not be reached" in str(raised.value)
    assert "key usage extension" in str(raised.value)
    await client.aclose()
