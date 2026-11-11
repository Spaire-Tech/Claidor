"""Settings › External Agents (11 November 2026, the founder, with another
app's Bots as the reference: each bot a row, "Last used" under a connected
one and a gear whose one item is Disconnect).

The bots a person let in through the MCP server's sign-in (`mcp.py`): every
OAuth client holding a live token with the `agents` scope for them, one row
per kind of bot (Grok Bot, Dots, Muse, Claude Code…: `network.kind_of`),
since a hosted bot can register again for a new conversation and is still
the one bot. A row's last use is its newest network session's (each tool
call touches it), else its newest token's.

Disconnect revokes the row's tokens (the bot's next call is answered 401 and
it must be allowed again), removes the grants (so the consent asks again)
and its network sessions, with what was sent to them.
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete
from sqlalchemy.orm import joinedload

from simeon.auth.scope import Scope
from simeon.kit.repository import RepositoryBase
from simeon.models import DesktopSession, OAuth2Grant, OAuth2Token
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .auth import get_desktop_session
from .network import HOSTED, kind_of, label_of, ms, redirect_kind
from .network_repository import DesktopNetworkSessionRepository

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

#: A row's id for a bot whose kind isn't known: its OAuth client.
CLIENT_PREFIX = "client:"


class ExternalAgentTokenRepository(RepositoryBase[OAuth2Token]):
    model = OAuth2Token

    async def live_for(self, user_id: UUID) -> list[OAuth2Token]:
        """The person's tokens that still let a bot in with the `agents`
        scope: a refresh token not used up, or an access token not revoked
        and not expired."""
        statement = (
            self.get_base_statement()
            .where(
                OAuth2Token.user_id == user_id,
                OAuth2Token.access_token_revoked_at == 0,
            )
            .options(joinedload(OAuth2Token.client))
            .order_by(OAuth2Token.issued_at.desc())
        )
        now = int(time.time())
        tokens = list(await self.get_all(statement))
        return [
            token
            for token in tokens
            if Scope.agents.value in (token.scope or "").split()
            and token.access_token_revoked_at == 0
            and (
                (token.refresh_token and token.refresh_token_revoked_at == 0)
                or token.issued_at + token.expires_in > now
            )
        ]

    async def revoke(self, tokens: Sequence[OAuth2Token]) -> None:
        now = int(time.time())
        for token in tokens:
            token.access_token_revoked_at = now
            token.refresh_token_revoked_at = now
            self.session.add(token)

    async def remove_grants(self, user_id: UUID, client_ids: Sequence[str]) -> int:
        if not client_ids:
            return 0
        statement = (
            delete(OAuth2Grant)
            .where(
                OAuth2Grant.user_id == user_id,
                OAuth2Grant.client_id.in_(list(client_ids)),
            )
            .returning(OAuth2Grant.id)
        )
        return len((await self.session.execute(statement)).all())


def _client_name(token: OAuth2Token) -> str | None:
    client = token.client
    if client is None:
        return None
    name = str(client.client_metadata.get("client_name") or "").strip()
    return name or None


async def connected(session: AsyncSession, user_id: UUID) -> list[dict[str, Any]]:
    """Each connected bot: its row's id, kind, name, when it was last used
    and when it was let in (ms), newest use first, with the OAuth clients and
    tokens behind it (`clients`, `tokens`, not sent to the app).

    A row is a kind of bot, read from the network sessions its sign-ins
    opened: Grok Bot signs in with Cursor's registration, so one client can
    be two kinds, and a hosted bot that registered again for a conversation
    leaves its older sign-in without a session, which joins the row of a
    client registered under the same name."""
    tokens = await ExternalAgentTokenRepository.from_session(session).live_for(user_id)
    by_client: dict[str, list[OAuth2Token]] = {}
    for token in tokens:
        by_client.setdefault(token.client_id, []).append(token)
    sessions = await DesktopNetworkSessionRepository.from_session(session).of_clients(
        user_id, list(by_client)
    )
    rows: dict[str, dict[str, Any]] = {}

    def join(key: str, kind: str, client_id: str, used: list[int]) -> None:
        held = by_client[client_id]
        first = min(t.issued_at for t in held) * 1000
        last = max(used + [t.issued_at * 1000 for t in held])
        row = rows.get(key)
        if row is None:
            rows[key] = {
                "id": key,
                "kind": kind,
                "name": label_of(kind)
                if kind != "agent"
                else (_client_name(held[0]) or "A bot"),
                "lastUsedAt": last,
                "connectedAt": first,
                "clients": [client_id],
                "tokens": list(held),
                "names": {_client_name(held[0])},
            }
            return
        row["lastUsedAt"] = max(row["lastUsedAt"], last)
        row["connectedAt"] = min(row["connectedAt"], first)
        if client_id not in row["clients"]:
            row["clients"].append(client_id)
            row["tokens"] += held
            row["names"].add(_client_name(held[0]))

    def key_of(kind: str, client_id: str) -> str:
        return kind if kind != "agent" else f"{CLIENT_PREFIX}{client_id}"

    def known(kind: str, client_id: str) -> str:
        # A session named before its bot was known: Grok Bot added at `/mcp`
        # signs in as Cursor, and its session was kept as `cursor` (11
        # November 2026: External Agents said Cursor). Where its sign-in
        # returned says which bot it is, as it does for a new session.
        if kind in HOSTED:
            return kind
        returned = redirect_kind(by_client[client_id][0].redirect_uri)
        return (
            returned.kind if returned is not None and returned.kind in HOSTED else kind
        )

    alone: list[str] = []
    for client_id in by_client:
        mine = [s for s in sessions if s.client_id == client_id]
        if not mine:
            alone.append(client_id)
            continue
        for kind in {known(s.kind, client_id) for s in mine}:
            join(
                key_of(kind, client_id),
                kind,
                client_id,
                [ms(s.last_seen_at) for s in mine if known(s.kind, client_id) == kind],
            )
    for client_id in alone:
        newest = by_client[client_id][0]  # Newest first.
        name = _client_name(newest)
        twin = next(
            (r for r in rows.values() if name is not None and name in r["names"]),
            None,
        )
        if twin is not None:
            join(twin["id"], twin["kind"], client_id, [])
            continue
        kind = kind_of(name, redirect_uri=newest.redirect_uri).kind
        join(key_of(kind, client_id), kind, client_id, [])
    return sorted(rows.values(), key=lambda r: -int(r["lastUsedAt"]))


def shown(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: row[key] for key in ("id", "kind", "name", "lastUsedAt", "connectedAt")
    }


async def disconnect(session: AsyncSession, user_id: UUID, row_id: str) -> bool:
    """A row's bot let out: its tokens revoked, its grants and sessions
    gone. False when no such bot is connected."""
    row = next(
        (r for r in await connected(session, user_id) if r["id"] == row_id), None
    )
    if row is None:
        return False
    tokens = ExternalAgentTokenRepository.from_session(session)
    await tokens.revoke(row["tokens"])
    grants = await tokens.remove_grants(user_id, row["clients"])
    sessions = await DesktopNetworkSessionRepository.from_session(
        session
    ).remove_clients(user_id, row["clients"])
    log.info(
        "desktop.external_agents.disconnected",
        user_id=str(user_id),
        kind=row["kind"],
        clients=len(row["clients"]),
        tokens=len(row["tokens"]),
        grants=grants,
        sessions=sessions,
    )
    return True


# MARK: The apps' routes


class DisconnectBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=200)


@router.get("/api/external-agents", name="desktop:external_agents")
async def external_agents_list(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    rows = await connected(session, desktop_session.user_id)
    return JSONResponse({"code": 0, "data": {"agents": [shown(r) for r in rows]}})


@router.post(
    "/api/external-agents/disconnect", name="desktop:external_agents_disconnect"
)
async def external_agents_disconnect(
    body: DisconnectBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    done = await disconnect(session, desktop_session.user_id, body.id)
    if not done:
        return JSONResponse(
            {"code": 1, "message": "This bot isn't connected."}, status_code=404
        )
    rows = await connected(session, desktop_session.user_id)
    return JSONResponse({"code": 0, "data": {"agents": [shown(r) for r in rows]}})
