"""Sharing: `/sand/xuser/*`, `/sand/share-rooms/*`, `/sand/share-state`
(25 September 2026).

The app's cross-user sharing (`desktop/source/host/extensions/cross-user-sharing/`,
complete since the reconstruction) spoke Cursor's relay; this module is
that relay on Simeon Labs' server, route for route and field for field
(`docs/product/cursor-dependencies-map.md` §8, `docs/product/sharing-served.md`).
The service runs in the box, so every route takes the box's credential
(`get_desktop_or_box_session`). Plain JSON in, plain JSON out; a body the
relay cannot act on (not a member, not the host, a malformed link) is
404, which the app's `SandXuserRelayHttpError` carries as a message and
its departure flush treats as "already gone".

The logic is `sharing_service.SharingRelay`, the queries
`sharing_repository`. Every write that another person should see lands
in their event queue and publishes `xuser-events` on the notify bus.
"""

from __future__ import annotations

from typing import Any

from fastapi import Body, Depends, HTTPException
from fastapi.responses import JSONResponse

from polar.desktop.auth import get_desktop_or_box_session
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.redis import Redis, get_redis
from polar.routing import APIRouter

from .sharing_service import SharingRelay

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)

Json = dict[str, Any]


def relay_of(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> SharingRelay:
    return SharingRelay(session, redis, desktop_session.user)


def body_of(body: Any) -> Json:
    return body if isinstance(body, dict) else {}


def answer(result: Json | None) -> JSONResponse:
    if result is None:
        raise HTTPException(status_code=404, detail="Not a room you are in.")
    return JSONResponse(result)


@router.post("/sand/xuser/poll")
async def xuser_poll(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return JSONResponse(await relay.poll(body_of(body).get("ackIds")))


@router.post("/sand/xuser/send")
async def xuser_send(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.send(body_of(body)))


@router.post("/sand/share-rooms/from-agent")
async def share_room_from_agent(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.from_agent(body_of(body)))


@router.post("/sand/share-rooms")
async def share_room_create(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return JSONResponse(await relay.create(body_of(body)))


@router.post("/sand/share-rooms/invite-links")
async def share_room_invite_link(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.invite_link(body_of(body)))


@router.post("/sand/share-rooms/join")
async def share_room_join(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return JSONResponse(await relay.join(body_of(body)))


@router.post("/sand/share-rooms/join/respond")
async def share_room_join_respond(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.respond(body_of(body)))


@router.post("/sand/share-rooms/agents/add")
async def share_room_add_agent(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.add_agent(body_of(body)))


@router.post("/sand/share-rooms/agents/remove")
async def share_room_remove_agent(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.remove_agent(body_of(body)))


@router.post("/sand/share-rooms/agents/remove-deleted")
async def share_room_remove_deleted_agent(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return JSONResponse(await relay.remove_deleted_agent(body_of(body)))


@router.post("/sand/share-rooms/picture")
async def share_room_picture(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.set_picture(body_of(body)))


@router.post("/sand/share-rooms/leave")
async def share_room_leave(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return answer(await relay.leave(body_of(body)))


@router.post("/sand/share-state")
async def share_state(
    body: Any = Body(default=None), relay: SharingRelay = Depends(relay_of)
) -> JSONResponse:
    return JSONResponse(await relay.share_state())
