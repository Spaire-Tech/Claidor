"""The fleet against real Docker Engines (29 September 2026): EnsureSandBox
through the API, with the real database, places each person's computer on a
different engine, mounts the host bundle on each engine it lands on, and
answers the blocked hold when both are full.

Opt-in, because it needs engines and an image: set

    SIMEON_E2E_DOCKER_HOSTS='[{"name":"one","docker_host":"unix:///tmp/dk1/sock",
        "address":"127.0.0.1"}, {"name":"two","docker_host":"unix:///tmp/dk2/sock",
        "address":"127.0.0.1"}]'
    SIMEON_E2E_BOX_IMAGE=simeon-test/box:latest   # present on every engine
    SIMEON_E2E_BUNDLE_URL=http://127.0.0.1:8765/b.tgz  # a host bundle tar

Each engine's containers are removed afterwards.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
import pytest_asyncio
from pytest_mock import MockerFixture

from polar.config import settings
from polar.postgres import AsyncSession
from polar.sand import box_hosts, box_service
from polar.sand.box_hosts import OWNER_LABEL, docker_client_from_settings
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_user
from tests.sand.test_box_broker import _ensure

HOSTS = os.environ.get("SIMEON_E2E_DOCKER_HOSTS", "")
pytestmark = pytest.mark.skipif(
    not HOSTS, reason="set SIMEON_E2E_DOCKER_HOSTS to run against real engines"
)


def _engines() -> list[dict[str, Any]]:
    return list(json.loads(HOSTS)) if HOSTS else []


async def _ours(engine: dict[str, Any]) -> list[dict[str, Any]]:
    client = docker_client_from_settings(engine["docker_host"])
    try:
        listed = await client.get(
            "/containers/json",
            params={"all": "true", "filters": json.dumps({"label": [OWNER_LABEL]})},
        )
        containers: list[dict[str, Any]] = listed.json()
        return [
            (await client.get(f"/containers/{c['Id']}/json")).json()
            for c in containers
        ]
    finally:
        await client.aclose()


@pytest_asyncio.fixture
async def engines(mocker: MockerFixture) -> AsyncIterator[list[dict[str, Any]]]:
    entries = [{**engine, "max_running": 1} for engine in _engines()]
    mocker.patch.object(settings, "BOX_HOST_PROVIDER", "docker")
    mocker.patch.object(settings, "BOX_HOSTS", json.dumps(entries))
    mocker.patch.object(settings, "BOX_IMAGE", os.environ["SIMEON_E2E_BOX_IMAGE"])
    mocker.patch.object(settings, "BOX_IMAGE_DIGEST", "")
    mocker.patch.object(
        settings, "BOX_HOST_BUNDLE_URL", os.environ["SIMEON_E2E_BUNDLE_URL"]
    )
    mocker.patch.object(settings, "BOX_MEMORY_LIMIT_MB", 0)
    mocker.patch.object(settings, "BOX_CPU_LIMIT", 0.0)
    box_hosts._installed_bundle_dirs.clear()
    box_hosts._fleet_cache = None

    async def healthy(url: str, token: str) -> bool:
        return True

    box_service.set_health_check_for_tests(healthy)
    yield entries
    box_service.set_health_check_for_tests(None)
    for engine in entries:
        client = docker_client_from_settings(engine["docker_host"])
        try:
            for container in await _ours(engine):
                await client.delete(
                    f"/containers/{container['Id']}", params={"force": "true"}
                )
        finally:
            await client.aclose()
    box_hosts._fleet_cache = None


@pytest.mark.asyncio
async def test_two_people_land_on_two_engines_and_a_third_is_held(
    client: httpx.AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    engines: list[dict[str, Any]],
) -> None:
    people = [await create_user(save_fixture) for _ in range(3)]
    for person in people[:2]:
        access, _ = await _signed_in(client, session, person)
        response = await _ensure(client, access)
        assert response.status_code == 200, response.text

    bundle = await box_hosts.load_host_bundle(settings.BOX_HOST_BUNDLE_URL)
    assert bundle is not None
    folder = f"{box_hosts.BOX_HOST_BUNDLE_ROOT}/{bundle.key}"
    for engine in engines:
        containers = await _ours(engine)
        # One computer on each engine, with our host mounted read-only and
        # its fingerprint on the label: the bundle reached both engines.
        assert len(containers) == 1, engine["name"]
        mounts = {m["Destination"]: m for m in containers[0]["Mounts"]}
        host_mount = mounts["/home/box/sand-host/host-main.cjs"]
        assert host_mount["Source"] == f"{folder}/host-main.cjs"
        assert host_mount["RW"] is False
        labels = containers[0]["Config"]["Labels"]
        assert labels[f"{OWNER_LABEL}.host-sha256"] == bundle.host_sha256

    access, _ = await _signed_in(client, session, people[2])
    held = await _ensure(client, access)
    assert held.status_code == 429, held.text
    assert held.headers["x-automation-failure-hint"] == "SAND_BOX_BLOCKED"
