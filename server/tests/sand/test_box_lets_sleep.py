"""The computer used only for runs (26 October 2026, step 4 of the computer
as a worker): with `BOX_SLEEPS_WITH_APP_OPEN` on, an app that says it lets
the box sleep (`x-simeon-lets-sleep: 1`) no longer keeps it awake by being
open, the box sleeps `BOX_IDLE_AFTER_RUN` after its last run, and the app
waits for it with the broker's record of it. Off, nothing changes; an app
built before keeps the box awake either way."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from starlette.requests import Request

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand import box_proxy, box_service
from simeon.sand.box_repository import SandBoxRepository
from simeon.sand.box_service import (
    RUN_STATE_ABSENT,
    RUN_STATE_HIBERNATED,
    RUN_STATE_RUNNING,
    BoxHealth,
    broker,
    mark_attached,
)
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import ENSURE, RUN_STATE, FakeBoxHost, backups, host
from tests.sand.test_box_proxy_replaced import BOX, PROMPT, _box, _sessions, world
from tests.sand.test_box_sleep import _age, _awake_box, health

__all__ = ["backups", "health", "host", "world"]


def _request(redis: Redis, headers: dict[str, str]) -> Request:
    sent = False

    async def receive() -> dict[str, Any]:
        nonlocal sent
        chunk = b"" if sent else PROMPT
        sent = True
        return {"type": "http.request", "body": chunk, "more_body": False}

    fields = {
        "x-anyrun-network-token": "n",
        "content-length": str(len(PROMPT)),
        **headers,
    }
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": f"/sand-box/{BOX}/p/1340/api/sendPrompt",
            "query_string": b"",
            "headers": [(k.encode(), v.encode()) for k, v in fields.items()],
            "state": {"redis": redis},
        },
        receive,
    )


async def _send(redis: Redis, headers: dict[str, str]) -> bool:
    """One request through the proxy; whether it left the box marked in use."""
    await redis.delete(box_service.attached_key(BOX))
    response = await box_proxy._proxy_http(
        _request(redis, headers), BOX, 1340, "api/sendPrompt", _sessions
    )
    body = getattr(response, "body_iterator", None)
    if body is not None:
        async for _ in body:
            pass
    return bool(await redis.exists(box_service.attached_key(BOX)))


@pytest.mark.asyncio
class TestLetsSleep:
    async def test_only_an_app_that_lets_it_sleep_leaves_it_unmarked_and_only_when_on(
        self, world: Any, redis: Redis, mocker: MockerFixture
    ) -> None:
        world.row = _box("new")
        sleeps = {"x-simeon-lets-sleep": "1"}
        # Off: every app keeps it awake, as before.
        assert await _send(redis, sleeps) is True
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        assert await _send(redis, sleeps) is False
        # An app built before keeps it awake either way.
        assert await _send(redis, {}) is True

    async def test_on_a_box_sleeps_soon_after_its_last_run_unless_an_older_app_is_open(
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
        await _age(session, box, 11)
        # Off: eleven idle minutes are not thirty.
        assert await broker.hibernate_idle(session, redis) == []
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        await mark_attached(redis, box.id)
        assert await broker.hibernate_idle(session, redis) == [], (
            "an older app holds it"
        )
        await redis.delete(box_service.attached_key(box.id))
        await _age(session, box, 9)
        assert await broker.hibernate_idle(session, redis) == []
        await _age(session, box, 11)
        assert await broker.hibernate_idle(session, redis) == [box.id]

    async def test_the_app_is_told_and_waits_on_the_record(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        mocker: MockerFixture,
    ) -> None:
        access, box = await _awake_box(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        assert (await client.post(ENSURE, json={}, headers=headers)).json()[
            "letsSleep"
        ] is False
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        assert (await client.post(ENSURE, json={}, headers=headers)).json()[
            "letsSleep"
        ] is True
        # Recorded asleep, running on its server: the record answers without asking it.
        current = await SandBoxRepository.from_session(session).get_by_user(user.id)
        assert current is not None
        assert current.id == box.id
        current.state = "hibernated"
        await session.flush()
        recorded = await client.post(
            RUN_STATE, json={"fromRecord": True}, headers=headers
        )
        assert recorded.json()["state"] == RUN_STATE_HIBERNATED
        assert recorded.json()["letsSleep"] is True
        # Removed since: asleep too, as its next task makes it again (the account is not new).
        current.state = "absent"
        await session.flush()
        removed = await client.post(
            RUN_STATE, json={"fromRecord": True}, headers=headers
        )
        assert removed.json()["state"] == RUN_STATE_HIBERNATED
        asked = await client.post(RUN_STATE, json={}, headers=headers)
        assert asked.json()["state"] == RUN_STATE_RUNNING

    async def test_a_new_account_has_no_computer_until_its_first_task(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        recorded = await client.post(
            RUN_STATE, json={"fromRecord": True}, headers=headers
        )
        assert recorded.json() == {
            "state": RUN_STATE_ABSENT,
            "imageUpdateAvailable": False,
            "letsSleep": True,
        }
        # Asking made nothing: the app's first task does (EnsureSandBox).
        assert host.created == []
