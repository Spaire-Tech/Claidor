"""Why a computer stays awake (12 November 2026). The founder switched on
`BOX_SLEEPS_WITH_APP_OPEN` and the cloud computer still never slept with the
Mac app open, and no line said why. The sleeper now says it
(`sand.box.awake`, once every ten minutes per box and reason): `busy` with
what the box says it works on, `attached` with the connection that holds
it, `idle` with how long and the limit. A box being put to sleep reads as
asleep in the broker's record at once, and the hands' ping does not wake a
box asleep."""

from __future__ import annotations

from collections.abc import MutableMapping
from datetime import timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_proxy, box_service
from simeon.sand.box_service import (
    RUN_STATE_HIBERNATED,
    RUN_STATE_RUNNING,
    BoxHealth,
    broker,
    health_from_body,
)
from tests.sand.test_box_broker import FakeBoxHost, backups, host
from tests.sand.test_box_lets_sleep import _send
from tests.sand.test_box_proxy_replaced import (
    BOX,
    GONE,
    _box,
    _proxied,
    _request,
    world,
)
from tests.sand.test_box_sleep import _age, _awake_box, health

__all__ = ["backups", "health", "host", "world"]


def _awake_lines(
    logs: list[MutableMapping[str, Any]],
) -> list[MutableMapping[str, Any]]:
    return [line for line in logs if line["event"] == "sand.box.awake"]


def test_health_says_what_holds_the_box_and_an_older_engine_says_nothing() -> None:
    said = health_from_body(
        {
            "isBusy": True,
            "busyReasons": ["turn", "background-shell"],
            "quietBackgroundShell": False,
        }
    )
    assert said.busy_reasons == ("turn", "background-shell")
    assert said.busy_words == "turn,background-shell"
    assert said.quiet_background_shell is False
    older = health_from_body({"isBusy": True})
    assert older.busy_reasons is None
    assert older.busy_words == "unknown"
    assert older.quiet_background_shell is None
    assert health_from_body({"isBusy": False, "busyReasons": []}).busy_words == "none"


def test_each_connection_through_the_proxy_has_a_kind() -> None:
    kind = box_proxy.connection_kind
    assert kind(1340, "events") == "events"
    assert kind(1340, "/local-exec/requests") == "local-exec"
    assert kind(1340, "local-exec/responses") == "local-exec"
    assert kind(1340, "webauthn/requests") == "webauthn"
    assert kind(1340, "api/listAgents") == "command"
    assert kind(1340, "avatars/sage") == "avatar"
    assert kind(1340, "health") == "health"
    assert kind(1340, "") == "other"
    assert kind(6080, "websockify") == "screen"
    assert kind(6081, "websockify") == "screen"
    assert kind(8790, "") == "tunnel"


@pytest.mark.asyncio
class TestAwakeSays:
    async def test_a_busy_box_says_what_it_works_on_once_in_ten_minutes(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
    ) -> None:
        _, box = await _awake_box(client, session, user)
        health["now"] = BoxHealth(
            reachable=True, is_busy=True, busy_reasons=("background-shell",)
        )
        with capture_logs() as logs:
            assert await broker.hibernate_idle(session, redis) == []
            assert await broker.hibernate_idle(session, redis) == []
        lines = _awake_lines(logs)
        assert len(lines) == 1, "once, not every minute"
        assert {
            "box": str(box.id),
            "reason": "busy",
            "busy": "background-shell",
            "sleeps_with_app_open": False,
        }.items() <= lines[0].items()
        # An engine older than the reasons says only that it is busy.
        await redis.delete(box_service.awake_said_key(box.id, "busy"))
        health["now"] = BoxHealth(reachable=True, is_busy=True)
        with capture_logs() as logs:
            await broker.hibernate_idle(session, redis)
        assert _awake_lines(logs)[0]["busy"] == "unknown"

    async def test_an_attached_box_says_which_connection_holds_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 11)
        # An app open since before the switch: its stream says nothing.
        await box_service.mark_attached(
            redis, box.id, by="events", path="events", header_sent=False
        )
        with capture_logs() as logs:
            assert await broker.hibernate_idle(session, redis) == []
        line = _awake_lines(logs)[0]
        assert {
            "reason": "attached",
            "attached_by": "events",
            "path": "events",
            "header_sent": False,
            "sleeps_with_app_open": True,
        }.items() <= line.items()
        # A mark written before the kinds were kept says it does not know.
        await redis.set(box_service.attached_key(box.id), "1", ex=60)
        assert (await box_service.attachment_of(redis, box.id)).by == "unknown"

    async def test_an_idle_box_says_how_long_and_the_limit(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
        health: dict[str, BoxHealth],
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        _, box = await _awake_box(client, session, user)
        await _age(session, box, 4)
        health["now"] = BoxHealth(reachable=True, quiet_background_shell=True)
        with capture_logs() as logs:
            assert await broker.hibernate_idle(session, redis) == []
        line = _awake_lines(logs)[0]
        assert line["reason"] == "idle"
        assert 4 * 60 - 5 <= line["idle_seconds"] <= 4 * 60 + 5
        assert line["idle_after_seconds"] == 600
        assert line["quiet_background_shell"] is True
        # Past the limit it sleeps, and says a quiet command was left running.
        await _age(session, box, 11)
        with capture_logs() as logs:
            assert await broker.hibernate_idle(session, redis) == [box.id]
        slept = next(line for line in logs if line["event"] == "sand.box.sleep")
        assert slept["quiet_background_shell"] is True

    async def test_the_proxy_marks_what_held_the_box(
        self, world: Any, redis: Redis, mocker: MockerFixture
    ) -> None:
        world.row = _box("new")
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        assert await _send(redis, {}) is True
        held = await box_service.attachment_of(redis, BOX)
        assert (held.by, held.path, held.header_sent) == (
            "command",
            "api/sendPrompt",
            False,
        )
        # The header sent and the box marked anyway: the API's switch is off.
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", False)
        assert await _send(redis, {"x-simeon-lets-sleep": "1"}) is True
        assert (await box_service.attachment_of(redis, BOX)).header_sent is True


@pytest.mark.asyncio
class TestGoingToSleep:
    async def test_the_record_says_asleep_while_the_box_is_being_stopped(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
        host: FakeBoxHost,
    ) -> None:
        _, box = await _awake_box(client, session, user)
        assert await broker.recorded_run_state(session, user.id, redis) == (
            RUN_STATE_RUNNING
        )
        # The sleeper's word, before its own write is committed.
        said = utc_now() + timedelta(seconds=1)
        await redis.set(
            box_service.sleeping_key(box.id), str(int(said.timestamp() * 1000)), ex=60
        )
        assert box.state == "running"
        assert await broker.recorded_run_state(session, user.id, redis) == (
            RUN_STATE_HIBERNATED
        )
        # Without Redis the record is what the row says.
        assert await broker.recorded_run_state(session, user.id) == RUN_STATE_RUNNING
        # Woken since (an ensure, a wake): running again.
        box.last_active_at = said + timedelta(seconds=5)
        await session.flush()
        assert await broker.recorded_run_state(session, user.id, redis) == (
            RUN_STATE_RUNNING
        )

    async def test_the_sleeper_says_it_before_it_stops_the_box(
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
        seen: list[bool] = []
        stop = host.stop

        async def stopping(provider_box_id: str) -> None:
            seen.append(bool(await redis.exists(box_service.sleeping_key(box.id))))
            await stop(provider_box_id)

        host.stop = stopping  # type: ignore[method-assign]
        assert await broker.hibernate_idle(session, redis) == [box.id]
        assert seen == [True]


PING = b'{"providerId":"p","frames":[{"kind":"ping","supervised":true}]}'


@pytest.mark.asyncio
class TestPingDoesNotWake:
    async def test_the_hands_ping_does_not_wake_a_box_asleep(self, world: Any) -> None:
        world.live = set()
        world.wakes = [("woken", "old")]
        status, body = await _proxied(_request(body=PING), "local-exec/responses")
        assert (status, body) == (502, GONE)
        assert world.woke == 0


def test_only_a_batch_of_pings_and_hellos_answers_nothing() -> None:
    answers = box_proxy.carries_an_answer
    assert not answers(PING)
    assert not answers(b'{"frames":[{"kind":"hello"},{"kind":"ping"}]}')
    assert answers(b'{"frames":[{"kind":"ping"},{"kind":"exit","requestId":"r"}]}')
    assert answers(b'{"frames":[]}')
    assert answers(b"")
    assert answers(None)
    assert answers(b"not json")
