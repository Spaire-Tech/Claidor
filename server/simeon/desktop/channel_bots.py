"""An agent's own Discord or Slack bot, listened to from Simeon Labs' server
(26 October 2026, the computer as a worker).

Until now the person's computer held each bot's connection (Discord's
Gateway, Slack's Socket Mode), so while it slept the bot heard nothing. Now
the computer hands the bots' tokens here, the cloud runner (`runner/`, one
process that is always up) holds the connections, and what a bot hears
waits in the inbox for the computer (`chats.py`), which is woken to answer.
The computer keeps sending the replies itself, with the same tokens.

- `POST /desktop/api/channels/sync`, from the computer: its whole list of
  bots, each with a fingerprint of its tokens and, when they changed or the
  server lacks them, the tokens. Answers whether the server holds them
  (`held`) and each bot's state as the runner last reported it; a bot whose
  state is not fresh (`FRESH_FOR`) is one the computer keeps listening to
  itself, so a runner that is down costs nothing.
- `POST /maty/runner/channels`, from the runner (its own token): the bots to
  hold, with their tokens when the runner's copy is not current.
- `POST /maty/runner/channels/report`, from the runner: each bot's state,
  and what the bots heard, which goes to the inbox (kind `channel`) and
  wakes the computer.

Tokens are kept sealed (`simeon.kit.sealed`, purpose `channel-bot`) and
never logged. `SIMEON_CHANNELS_ON_SERVER=false` (or no runner token) keeps
none: the computer is told nothing is held, and listens itself, as before.
Delete Account removes the bots (`account_repository.py`).
"""

from __future__ import annotations

import json
import math
from datetime import timedelta
from typing import Any, Literal
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.config import settings
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.maty.auth import authenticate_runner
from simeon.maty.tokens import RUNNER_PATH_PREFIX
from simeon.models import DesktopChannelBot, DesktopSession
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.sand.notify import publish

from .auth import get_desktop_or_box_session
from .channel_repository import DesktopChannelBotRepository
from .chat_repository import DesktopChatInboxRepository
from .chats import WAITING_MAX

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`).
router = APIRouter(include_in_schema=False)
# Mounted at the root, behind the runner's own token.
runner_router = APIRouter(
    prefix=f"{RUNNER_PATH_PREFIX}/channels",
    include_in_schema=False,
    dependencies=[Depends(authenticate_runner)],
)

SEAL_PURPOSE = "channel-bot"
PLATFORMS = ("discord", "slack")
#: A state the runner reported longer ago than this is not trusted: the
#: computer listens to that bot itself.
FRESH_FOR = timedelta(minutes=3)
BOTS_MAX = 200
SECRET_MAX = 4096
ENVELOPE_MAX_BYTES = 128 * 1024
REPORT_MAX = 200


def held_on_server() -> bool:
    """Whether bots are listened to from the server: switched on, and a
    runner that can take them."""
    return settings.CHANNELS_ON_SERVER and bool(settings.MATY_RUNNER_TOKEN)


# --- the computer ------------------------------------------------------------


class SyncedBot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=200)
    platform: Literal["discord", "slack"]
    fingerprint: str = Field(min_length=1, max_length=128)
    #: The bot's tokens by field (`token`, and `botToken` for Slack), sent
    #: only when they changed or the server said it lacks them.
    secrets: dict[str, str] | None = None


class SyncBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    channels: list[SyncedBot] = Field(default_factory=list, max_length=BOTS_MAX)


def _fresh(bot: DesktopChannelBot) -> bool:
    return bot.status_at is not None and utc_now() - bot.status_at <= FRESH_FOR


def _sealed(secrets: dict[str, str]) -> str | None:
    if any(len(value) > SECRET_MAX or "\x00" in value for value in secrets.values()):
        return None
    return seal(json.dumps(secrets, sort_keys=True), purpose=SEAL_PURPOSE)


@router.post("/api/channels/sync", name="desktop:channels_sync")
async def channels_sync(
    body: SyncBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    bots = DesktopChannelBotRepository.from_session(session)
    user_id = desktop_session.user_id
    if not held_on_server():
        # Nothing is kept while the server listens to no bot.
        removed = await bots.remove_for_user(user_id)
        if removed:
            log.info("desktop.channels.dropped", user_id=str(user_id), removed=removed)
        return JSONResponse({"code": 0, "data": {"held": False, "channels": []}})
    held = {
        (bot.agent_id, bot.platform): bot for bot in await bots.list_by_user(user_id)
    }
    answers: list[dict[str, Any]] = []
    changed = 0
    for wanted in body.channels:
        key = (wanted.agentId, wanted.platform)
        bot = held.pop(key, None)
        if wanted.secrets is not None and (
            bot is None or bot.fingerprint != wanted.fingerprint
        ):
            sealed = _sealed(wanted.secrets)
            if sealed is not None:
                if bot is None:
                    bot = await bots.create(
                        DesktopChannelBot(
                            user_id=user_id,
                            agent_id=wanted.agentId,
                            platform=wanted.platform,
                            fingerprint=wanted.fingerprint,
                            secrets=sealed,
                        ),
                        flush=True,
                    )
                else:
                    # New tokens: what the runner said of the old ones no longer holds.
                    await bots.update(
                        bot,
                        update_dict={
                            "fingerprint": wanted.fingerprint,
                            "secrets": sealed,
                            "status": None,
                            "detail": None,
                            "status_at": None,
                        },
                    )
                changed += 1
        current = bot is not None and bot.fingerprint == wanted.fingerprint
        answers.append(
            {
                "agentId": wanted.agentId,
                "platform": wanted.platform,
                # The server lacks these tokens: the computer sends them next time.
                "missing": not current,
                "status": bot.status if current and bot is not None else None,
                "detail": bot.detail if current and bot is not None else None,
                "fresh": current and bot is not None and _fresh(bot),
            }
        )
    # A bot the computer no longer lists is no longer listened to.
    gone = [bot.id for bot in held.values()]
    await bots.remove(gone)
    if changed or gone:
        log.info(
            "desktop.channels.synced",
            user_id=str(user_id),
            bots=len(body.channels),
            changed=changed,
            removed=len(gone),
        )
    return JSONResponse({"code": 0, "data": {"held": True, "channels": answers}})


# --- the runner --------------------------------------------------------------


class HeldBot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=64)
    fingerprint: str = Field(min_length=1, max_length=128)


class HoldBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    have: list[HeldBot] = Field(default_factory=list, max_length=10_000)


@runner_router.post("", name="runner:channels")
async def runner_channels(
    body: HoldBody, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    """Every bot to listen to; the tokens only of those the runner does not
    hold as they are now. A bot it holds that is not in the answer is one
    to let go."""
    if not held_on_server():
        return JSONResponse({"bots": []})
    have = {held.id: held.fingerprint for held in body.have}
    answer: list[dict[str, Any]] = []
    for bot in await DesktopChannelBotRepository.from_session(session).list_all():
        entry: dict[str, Any] = {
            "id": str(bot.id),
            "platform": bot.platform,
            "fingerprint": bot.fingerprint,
        }
        if have.get(str(bot.id)) != bot.fingerprint:
            opened = unseal(bot.secrets, purpose=SEAL_PURPOSE)
            if opened is None:
                # Sealed under another SECRET: the computer sends them again.
                continue
            entry["secrets"] = json.loads(opened)
        answer.append(entry)
    return JSONResponse({"bots": answer})


class ReportedStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=64)
    status: Literal["connecting", "connected", "error"]
    #: What the computer shows beside it, as a sentence key of its own
    #: (`say`) and its values; the computer says it in the person's language.
    detail: dict[str, Any] | None = None


class ReportedInbound(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=64)
    messageId: str = Field(min_length=1, max_length=200)
    envelope: dict[str, Any]


class ReportBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    statuses: list[ReportedStatus] = Field(default_factory=list, max_length=REPORT_MAX)
    inbound: list[ReportedInbound] = Field(default_factory=list, max_length=REPORT_MAX)


def _uuid(value: str) -> UUID | None:
    try:
        return UUID(value)
    except ValueError:
        return None


def _clean(value: Any) -> Any:
    """The envelope with no NUL in it (PostgreSQL's JSONB refuses one)."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_clean(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    return value


def kept_envelope(envelope: dict[str, Any], message_id: str) -> dict[str, Any] | None:
    """What a bot heard, as the computer's channel runtime reads it
    (`ChannelInbound`); None for one that is not that shape."""
    address = envelope.get("address")
    if not isinstance(address, dict):
        return None
    if address.get("platform") not in PLATFORMS or not isinstance(
        address.get("chat"), str
    ):
        return None
    if not isinstance(envelope.get("sender"), str) or not isinstance(
        envelope.get("text"), str
    ):
        return None
    stamp = envelope.get("timestampMs")
    if (
        not isinstance(stamp, int | float)
        or isinstance(stamp, bool)
        or not math.isfinite(stamp)
    ):
        return None
    kept = _clean({**envelope, "messageId": message_id})
    if len(json.dumps(kept).encode()) > ENVELOPE_MAX_BYTES:
        return None
    return kept


@runner_router.post("/report", name="runner:channels_report")
async def runner_channels_report(
    body: ReportBody,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    bots = DesktopChannelBotRepository.from_session(session)
    raw_ids = [status.id for status in body.statuses] + [
        heard.id for heard in body.inbound
    ]
    wanted = [_uuid(raw) for raw in raw_ids]
    known = await bots.get_many([bot_id for bot_id in wanted if bot_id is not None])
    now = utc_now()
    for status in body.statuses:
        bot_id = _uuid(status.id)
        bot = known.get(bot_id) if bot_id is not None else None
        if bot is None:
            continue
        await bots.update(
            bot,
            update_dict={
                "status": status.status,
                "detail": _clean(status.detail) if status.detail else None,
                "status_at": now,
            },
        )
    inbox = DesktopChatInboxRepository.from_session(session)
    waiting: dict[UUID, int] = {}
    woken: set[UUID] = set()
    queued = 0
    dropped = 0
    for heard in body.inbound:
        bot_id = _uuid(heard.id)
        bot = known.get(bot_id) if bot_id is not None else None
        if bot is None:
            continue
        envelope = kept_envelope(heard.envelope, heard.messageId)
        if envelope is None or envelope["address"]["platform"] != bot.platform:
            dropped += 1
            continue
        if bot.user_id not in waiting:
            waiting[bot.user_id] = await inbox.count_waiting(bot.user_id)
        if waiting[bot.user_id] >= WAITING_MAX:
            # A computer that has not taken 200 messages: a flood is not kept.
            dropped += 1
            continue
        added = await inbox.add(
            bot.user_id,
            agent_id=bot.agent_id,
            nonce=f"channel:{bot.platform}:{bot.id}:{heard.messageId}"[:200],
            kind="channel",
            message=envelope,
        )
        if added:
            queued += 1
            waiting[bot.user_id] += 1
            woken.add(bot.user_id)
    for user_id in woken:
        await publish(redis, user_id, "chat-inbox")
    if queued or dropped:
        log.info(
            "desktop.channels.inbound",
            queued=queued,
            dropped=dropped,
            people=len(woken),
        )
    return JSONResponse({"ok": True})
