"""Several box servers (29 September 2026): a new computer is made on the
accepting server with the most room and stays there; the sleeper and the
waker follow each box to its own server. Against two in-memory servers
(`FakeBoxHost`), the same broker path the app calls (`EnsureSandBox`).
"""

from __future__ import annotations

import base64
from collections.abc import Iterator

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_hosts
from simeon.sand.box_hosts import BoxHostEntry, BoxHostUnavailable, box_host_entries
from simeon.sand.box_service import CAPACITY_BLOCK_REASON, broker
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_user
from tests.sand.test_box_broker import FakeBoxHost, _ensure
from tests.sand.test_box_sleep import _age, _awake_box, _box_of, health  # noqa: F401


@pytest.fixture
def fleet() -> Iterator[tuple[FakeBoxHost, FakeBoxHost]]:
    first, second = FakeBoxHost("box-eu", max_running=2), FakeBoxHost("box-us", 2)
    box_hosts.set_box_host_for_tests([first, second])

    async def healthy(url: str, token: str) -> bool:
        return True

    from simeon.sand import box_service

    box_service.set_health_check_for_tests(healthy)
    yield first, second
    box_hosts.set_box_host_for_tests(None)
    box_service.set_health_check_for_tests(None)


@pytest.mark.asyncio
class TestPlacement:
    async def test_new_computers_spread_and_each_stays_on_its_server(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
    ) -> None:
        first, second = fleet
        people = [await create_user(save_fixture) for _ in range(4)]
        for person in people:
            await _awake_box(client, session, person)
        # Two each: every new box goes where the larger share is free.
        assert (len(first.created), len(second.created)) == (2, 2)
        boxes = [await _box_of(session, person) for person in people]
        assert {box.provider for box in boxes} == {"box-eu", "box-us"}
        for box in boxes:
            server = first if box.provider == "box-eu" else second
            assert box.provider_box_id in server.boxes

        # A second EnsureSandBox finds each box where it was made.
        access, _ = await _signed_in(client, session, people[0])
        assert (await _ensure(client, access)).status_code == 200
        assert len(first.created) + len(second.created) == 4

    async def test_a_full_or_draining_server_is_skipped(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
    ) -> None:
        first, second = fleet
        first.accepting = False
        await _awake_box(client, session, user)
        await _awake_box(client, session, user_second)
        assert (len(first.created), len(second.created)) == (0, 2)

    async def test_when_every_server_is_full_the_app_gets_the_blocked_hold(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
    ) -> None:
        people = [await create_user(save_fixture) for _ in range(5)]
        for person in people[:4]:
            await _awake_box(client, session, person)
        access, _ = await _signed_in(client, session, people[4])
        response = await _ensure(client, access)
        # The same hold a full single server gave (test_box_sleep.py).
        assert response.status_code == 429, response.text
        assert response.headers["x-automation-failure-hint"] == "SAND_BOX_BLOCKED"
        assert response.headers["retry-after"] == "60"
        decoded = base64.b64decode(response.json()["details"][0]["value"])
        assert CAPACITY_BLOCK_REASON.encode() in decoded
        first, second = fleet
        assert len(first.created) + len(second.created) == 4

    async def test_a_box_whose_server_is_full_waits_rather_than_moves(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        redis: Redis,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
        health: object,  # noqa: F811
    ) -> None:
        # Its files live on its server: a sleeping box on a full server is
        # deferred, never re-made on the server with room.
        first, second = fleet
        second.accepting = False
        sleeper, *others = [await create_user(save_fixture) for _ in range(3)]
        _, box = await _awake_box(client, session, sleeper)
        await broker.hibernate(session, first, box, force=True)
        for person in others:
            await _awake_box(client, session, person)
        assert await broker.wake(session, sleeper.id) == "deferred"
        second.accepting = True
        assert len(second.created) == 0

    async def test_the_sleeper_visits_every_server(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        redis: Redis,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
        health: object,  # noqa: F811
    ) -> None:
        first, second = fleet
        _, one = await _awake_box(client, session, user)
        _, two = await _awake_box(client, session, user_second)
        assert {one.provider, two.provider} == {"box-eu", "box-us"}
        await _age(session, one, 31)
        await _age(session, two, 31)
        slept = await broker.hibernate_idle(session, redis)
        assert set(slept) == {one.id, two.id}
        assert not any(box["running"] for box in first.boxes.values())
        assert not any(box["running"] for box in second.boxes.values())

    async def test_a_box_on_a_server_no_longer_configured_is_made_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fleet: tuple[FakeBoxHost, FakeBoxHost],
    ) -> None:
        first, second = fleet
        second.accepting = False
        _, box = await _awake_box(client, session, user)
        assert box.provider == "box-eu"
        box_hosts.set_box_host_for_tests([second])
        second.accepting = True
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        session.expunge_all()
        assert (await _box_of(session, user)).provider == "box-us"


class TestConfiguration:
    def test_without_a_list_it_is_the_one_server_named_docker(
        self, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "BOX_HOSTS", "")
        mocker.patch.object(settings, "BOX_DOCKER_HOST", "tcp://box1.example:2376")
        assert box_host_entries() == [
            BoxHostEntry(name="docker", docker_host="tcp://box1.example:2376")
        ]

    def test_a_list_names_each_server_and_its_limits(
        self, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(
            settings,
            "BOX_HOSTS",
            '[{"name": "docker", "docker_host": "tcp://box1.example:2376"},'
            ' {"name": "us-east-1", "docker_host": "tcp://box2.example:2376",'
            ' "max_running": 12, "address": "10.0.0.2", "accepting": false}]',
        )
        assert box_host_entries() == [
            BoxHostEntry(name="docker", docker_host="tcp://box1.example:2376"),
            BoxHostEntry(
                name="us-east-1",
                docker_host="tcp://box2.example:2376",
                address="10.0.0.2",
                max_running=12,
                accepting=False,
            ),
        ]

    @pytest.mark.parametrize(
        "raw",
        [
            "not json",
            "[]",
            '[{"name": "a"}]',
            '[{"name": "a", "docker_host": "x"}, {"name": "a", "docker_host": "y"}]',
        ],
    )
    def test_a_bad_list_is_one_sentence(self, raw: str, mocker: MockerFixture) -> None:
        mocker.patch.object(settings, "BOX_HOSTS", raw)
        with pytest.raises(BoxHostUnavailable):
            box_host_entries()


@pytest.mark.asyncio
async def test_a_restart_recorded_by_one_worker_streams_from_another(
    redis: Redis,
) -> None:
    # Several API workers: the one that records a recreate and the one that
    # serves the app's WatchSandBoxMigration share only Redis.
    from uuid import uuid4

    from simeon.sand.box_service import PHASE_CREATING, PHASE_DONE, MigrationLog

    recorder, streamer = MigrationLog(), MigrationLog()
    streamer.idle = 0.05
    box_id = uuid4()
    await recorder.record(redis, box_id, "op", PHASE_CREATING, "Replacing")
    await recorder.record(redis, box_id, "op", PHASE_DONE, "Back")
    events = [event async for event in streamer.watch(redis, box_id, "", True)]
    assert [(e["phase"], e["offsetKey"]) for e in events] == [
        (PHASE_CREATING, "1"),
        (PHASE_DONE, "2"),
    ]
    after_first = [e async for e in streamer.watch(redis, box_id, "1", True)]
    assert [e["offsetKey"] for e in after_first] == ["2"]
    unfinished = [e async for e in streamer.watch(redis, box_id, "", False)]
    assert [e["phase"] for e in unfinished] == [PHASE_CREATING]
