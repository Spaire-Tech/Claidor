"""The notify bus: `GET /sand/notify` (25 September 2026).

The box's host opens one server-sent-events stream per box
(`desktop/source/host/extensions/notify-bus/notify-bus-client.ts`) and
reads frames of the form `data: {"kind":"connected"}` then
`data: {"kind":"notify","topic":"automation-fires"}`; a topic tells it
to drain the matching relay queue now instead of at the next poll. The
three topics are the client's own table: `automation-fires`,
`listener-events`, `xuser-events`. Its stall watchdog aborts a stream
that goes silent, so this one writes a comment line every twenty
seconds; any bytes kick the watchdog.

Fan-out is Redis pub/sub on one channel per person, so an API instance
that took a Slack event can wake a box connected to another instance.
`publish()` is what the listener relay and the sharing relay call.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse

from polar.desktop.auth import get_desktop_or_box_session
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.redis import Redis, get_redis
from polar.routing import APIRouter

NotifyTopic = Literal["automation-fires", "listener-events", "xuser-events"]
NOTIFY_TOPICS: tuple[NotifyTopic, ...] = (
    "automation-fires",
    "listener-events",
    "xuser-events",
)

HEARTBEAT_SECONDS = 20.0

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)


def channel_of(user_id: object) -> str:
    return f"sand:notify:{user_id}"


async def publish(redis: Redis, user_id: object, topic: NotifyTopic) -> None:
    """Wake every stream the person holds. A lost publish is covered by
    the box's periodic drains, so this never raises."""
    try:
        await redis.publish(channel_of(user_id), json.dumps({"kind": "notify", "topic": topic}))
    except Exception:
        return


def frame(payload: dict[str, object]) -> bytes:
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n".encode()


async def stream_frames(redis: Redis, user_id: object, request: Request) -> AsyncIterator[bytes]:
    yield frame({"kind": "connected"})
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel_of(user_id))
    try:
        while True:
            if await request.is_disconnected():
                return
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=HEARTBEAT_SECONDS),
                    timeout=HEARTBEAT_SECONDS + 1,
                )
            except TimeoutError:
                message = None
            if message is None:
                yield b": ping\n\n"
                continue
            data = message.get("data")
            if isinstance(data, bytes):
                data = data.decode("utf-8", "replace")
            if not isinstance(data, str):
                continue
            try:
                payload = json.loads(data)
            except ValueError:
                continue
            if isinstance(payload, dict) and payload.get("kind") == "notify" and payload.get("topic") in NOTIFY_TOPICS:
                yield frame(payload)
    finally:
        try:
            await pubsub.unsubscribe(channel_of(user_id))
            await pubsub.aclose()
        except Exception:
            pass


@router.get("/sand/notify")
async def notify_stream(
    request: Request,
    session: DesktopSession = Depends(get_desktop_or_box_session),
    redis: Redis = Depends(get_redis),
) -> StreamingResponse:
    """The box calls this with its own credential, so the box's token is
    accepted (the host runs in the box, not on the Mac)."""
    return StreamingResponse(
        stream_frames(redis, session.user_id, request),
        media_type="text/event-stream",
        headers={"cache-control": "no-store", "x-accel-buffering": "no"},
    )
