"""The cloud box's sleep, wake and capacity (28 September 2026).

Measured against the contract the upstream app's client states: the host's
`/health` (`isBusy`, `busyOnlyAwaitingApproval`, `lastBusyAtMs`),
`AdminHibernateSandBox`'s busy refusal unless forced,
`SAND_BOX_RUN_STATE_HIBERNATED` for a stopped box, EnsureSandBox starting
it again, and the SAND_BOX_BLOCKED hold with `retry-after` that
`BrokeredHostConnector.connect` reads when the host is full.
"""

from __future__ import annotations

import base64
from datetime import timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.kit.utils import utc_now
from simeon.models import SandBox, User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_service, notify
from simeon.sand.box_hosts import BoxSpec
from simeon.sand.box_repository import SandBoxRepository
from simeon.sand.box_service import (
    CAPACITY_BLOCK_DETAIL,
    CAPACITY_BLOCK_TITLE,
    RUN_STATE_HIBERNATED,
    RUN_STATE_RUNNING,
    BoxHealth,
    broker,
    mark_attached,
)
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import RUN_STATE, FakeBoxHost, _ensure, host

__all__ = ["host"]


@pytest.fixture
def health() -> Any:
    """What the box's `/health` says; tests change it."""
    state: dict[str, BoxHealth] = {"now": BoxHealth(reachable=True)}

    async def report(url: str, token: str) -> BoxHealth:
        return state["now"]

    box_service.set_health_report_for_tests(report)
    yield state
    box_service.set_health_report_for_tests(None)


async def _box_of(session: AsyncSession, user: User) -> SandBox:
    box = await SandBoxRepository.from_session(session).get_by_user(user.id)
    assert box is not None
    return box


async def _awake_box(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> tuple[str, SandBox]:
    access, _ = await _signed_in(client, session, user)
    response = await _ensure(client, access)
    assert response.status_code == 200, response.text
    return access, await _box_of(session, user)


async def _age(session: AsyncSession, box: SandBox, minutes: int) -> None:
    box.last_active_at = utc_now() - timedelta(minutes=minutes)
    await SandBoxRepository.from_session(session).update(box, flush=True)


@pytest.mark.asyncio
class TestSleep:
    async def test_an_idle_box_sleeps_and_ensure_wakes_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        access, box = await _awake_box(client, session, user)
        await _age(session, box, 31)

        slept = await broker.hibernate_idle(session, redis)

        assert slept == [box.id]
        assert host.boxes[box.provider_box_id]["running"] is False
        assert box.state == "hibernated"
        assert box.hibernated_at is not None
        # Stopped, not removed: the same container and its volumes.
        assert host.removed == []
        state = await client.post(
            RUN_STATE, json={}, headers={"Authorization": f"Bearer {access}"}
        )
        assert state.json()["state"] == RUN_STATE_HIBERNATED

        again = await _ensure(client, access)
        assert again.status_code == 200, again.text
        assert host.boxes[box.provider_box_id]["running"] is True
        assert len(host.created) == 1
        state = await client.post(
            RUN_STATE, json={}, headers={"Authorization": f"Bearer {access}"}
        )
        assert state.json()["state"] == RUN_STATE_RUNNING
        session.expunge_all()
        woken = await _box_of(session, user)
        assert (woken.state, woken.hibernated_at) == ("running", None)

    async def test_a_recent_box_stays_awake(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 29)
        assert await broker.hibernate_idle(session, redis) == []
        assert host.boxes[box.provider_box_id]["running"] is True

    async def test_a_busy_box_stays_awake_and_is_marked_active(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 120)
        health["now"] = BoxHealth(reachable=True, is_busy=True)

        assert await broker.hibernate_idle(session, redis) == []
        assert host.boxes[box.provider_box_id]["running"] is True
        assert box.last_active_at is not None
        assert utc_now() - box.last_active_at < timedelta(minutes=1)

    async def test_a_box_that_only_waits_on_an_approval_card_sleeps(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        # The host stops moving `lastBusyAtMs` for this case
        # (`SandHost.getHealth`), so idleness counts from before the card.
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 45)
        health["now"] = BoxHealth(
            reachable=True, is_busy=True, busy_only_awaiting_approval=True
        )
        assert await broker.hibernate_idle(session, redis) == [box.id]

    async def test_the_hosts_last_busy_time_counts(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 90)
        busy_ms = int((utc_now() - timedelta(minutes=5)).timestamp() * 1000)
        health["now"] = BoxHealth(reachable=True, last_busy_at_ms=busy_ms)

        assert await broker.hibernate_idle(session, redis) == []
        assert box.last_active_at is not None
        assert abs(box.last_active_at.timestamp() * 1000 - busy_ms) < 1000

    async def test_a_box_the_app_is_attached_to_stays_awake(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 90)
        await mark_attached(redis, box.id)
        assert await broker.hibernate_idle(session, redis) == []
        assert host.boxes[box.provider_box_id]["running"] is True

    async def test_an_unreachable_idle_box_sleeps(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 31)
        health["now"] = BoxHealth(reachable=False)
        assert await broker.hibernate_idle(session, redis) == [box.id]

    async def test_zero_means_never(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
        mocker: MockerFixture,
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 600)
        mocker.patch.object(settings, "BOX_IDLE_HIBERNATE_AFTER", timedelta(0))
        assert await broker.hibernate_idle(session, redis) == []

    async def test_hibernate_refuses_a_busy_box_unless_forced(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        health["now"] = BoxHealth(reachable=True, is_busy=True)
        refused = await broker.hibernate(session, host, box, force=False)
        assert (refused.started, refused.reason) == (False, "busy")
        assert host.boxes[box.provider_box_id]["running"] is True
        forced = await broker.hibernate(session, host, box, force=True)
        assert forced.started is True
        assert host.boxes[box.provider_box_id]["running"] is False

    async def test_a_box_stopped_outside_the_broker_is_recorded(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        host.boxes[box.provider_box_id]["running"] = False
        assert await broker.hibernate_idle(session, redis) == []
        assert box.state == "hibernated"


@pytest.mark.asyncio
class TestWake:
    async def test_wake_starts_a_sleeping_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        await broker.hibernate(session, host, box, force=True)

        assert await broker.wake(session, user.id) == "woken"
        assert host.boxes[box.provider_box_id]["running"] is True
        assert box.state == "running"
        assert box.hibernated_at is None
        assert await broker.wake(session, user.id) == "awake"

    async def test_wake_without_a_cloud_box(
        self, session: AsyncSession, user: User, host: FakeBoxHost
    ) -> None:
        assert await broker.wake(session, user.id) == "no-box"

    async def test_wake_waits_when_the_host_is_full(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_MAX_RUNNING", 1)
        _, box = await _awake_box(client, session, user)
        await broker.hibernate(session, host, box, force=True)
        await _awake_box(client, session, user_second)

        assert await broker.wake(session, user.id) == "deferred"
        assert host.boxes[box.provider_box_id]["running"] is False

    async def test_publishing_to_a_box_asks_for_a_wake(
        self, redis: Redis, user: User, mocker: MockerFixture
    ) -> None:
        enqueued = mocker.patch.object(notify, "enqueue_job")
        await notify.publish(redis, user.id, "automation-fires")
        # A burst asks once; one start is enough.
        await notify.publish(redis, user.id, "listener-events")
        enqueued.assert_called_once_with("sand.box.wake", user_id=str(user.id))
        await redis.delete(f"sand:box:wake-asked:{user.id}")
        await notify.publish(redis, user.id, "xuser-events")
        assert enqueued.call_count == 2


@pytest.mark.asyncio
class TestCapacity:
    async def test_a_full_host_refuses_with_the_blocked_hold(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        host: FakeBoxHost,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_MAX_RUNNING", 1)
        await _awake_box(client, session, user)
        access, _ = await _signed_in(client, session, user_second)

        response = await _ensure(client, access)

        assert response.status_code == 429, response.text
        assert response.headers["x-automation-failure-hint"] == "SAND_BOX_BLOCKED"
        assert response.headers["retry-after"] == "60"
        details = response.json()["details"][0]
        assert details["type"] == "aiserver.v1.ErrorDetails"
        decoded = base64.b64decode(details["value"])
        assert CAPACITY_BLOCK_TITLE.encode() in decoded
        assert CAPACITY_BLOCK_DETAIL.encode() in decoded
        assert b"sandBoxBlockReason" in decoded
        assert b"capacity" in decoded
        assert len(host.created) == 1

    async def test_the_same_person_is_never_refused_their_awake_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_MAX_RUNNING", 1)
        access, _ = await _awake_box(client, session, user)
        assert (await _ensure(client, access)).status_code == 200

    async def test_a_sleeping_box_frees_its_place(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_MAX_RUNNING", 1)
        _, box = await _awake_box(client, session, user)
        await broker.hibernate(session, host, box, force=True)
        access, _ = await _signed_in(client, session, user_second)
        assert (await _ensure(client, access)).status_code == 200

    async def test_zero_means_no_limit(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        host: FakeBoxHost,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_MAX_RUNNING", 0)
        await _awake_box(client, session, user)
        await _awake_box(client, session, user_second)
        assert len(host.created) == 2


def test_resource_limits_are_dockers_fields() -> None:
    spec = BoxSpec(
        name="b",
        gateway_token="t",
        renewal_credential="c",
        backend_url="https://api",
        image="i",
        workspace_volume="w",
        data_volume="d",
        memory_mb=4096,
        cpus=2.0,
    )
    assert spec.resource_limits() == {
        "Memory": 4096 * 1024 * 1024,
        "MemorySwap": 4096 * 1024 * 1024,
        "NanoCpus": 2_000_000_000,
    }
    unlimited = BoxSpec(
        name="b",
        gateway_token="t",
        renewal_credential="c",
        backend_url="https://api",
        image="i",
        workspace_volume="w",
        data_volume="d",
    )
    assert unlimited.resource_limits() == {}


@pytest.mark.asyncio
class TestLimits:
    async def test_a_new_box_carries_the_memory_and_cpu_caps(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
    ) -> None:
        await _awake_box(client, session, user)
        spec = host.created[0]
        assert (spec.memory_mb, spec.cpus) == (
            settings.BOX_MEMORY_LIMIT_MB,
            settings.BOX_CPU_LIMIT,
        )
