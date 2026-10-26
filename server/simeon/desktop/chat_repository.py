"""The queries behind the copy of the agents and their chats
(`chats.py`, 26 October 2026)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from simeon.kit.repository import RepositoryBase
from simeon.kit.utils import generate_uuid, utc_now
from simeon.models import DesktopChatAgent, DesktopChatLine


@dataclass(frozen=True)
class IncomingLine:
    entry_id: str
    #: The line's own time (`timestampMs`), when it has one.
    at_ms: int | None
    entry: dict[str, Any]


class DesktopChatAgentRepository(RepositoryBase[DesktopChatAgent]):
    model = DesktopChatAgent

    async def list_by_user(self, user_id: UUID) -> Sequence[DesktopChatAgent]:
        statement = (
            self.get_base_statement()
            .where(DesktopChatAgent.user_id == user_id)
            .order_by(DesktopChatAgent.agent_id)
        )
        return await self.get_all(statement)

    async def replace_all(
        self, user_id: UUID, rows: dict[str, dict[str, Any]]
    ) -> set[str]:
        """The person's list made exactly `rows` (agent id → row): new
        agents added, known ones rewritten when they changed, the others
        removed. Answers the ids removed."""
        held = {agent.agent_id: agent for agent in await self.list_by_user(user_id)}
        for agent_id, row in rows.items():
            found = held.get(agent_id)
            if found is None:
                await self.create(
                    DesktopChatAgent(user_id=user_id, agent_id=agent_id, row=row)
                )
            elif found.row != row:
                await self.update(found, update_dict={"row": row})
        removed = set(held) - set(rows)
        if removed:
            await self.session.execute(
                delete(DesktopChatAgent).where(
                    DesktopChatAgent.user_id == user_id,
                    DesktopChatAgent.agent_id.in_(removed),
                )
            )
        await self.session.flush()
        return removed


class DesktopChatLineRepository(RepositoryBase[DesktopChatLine]):
    model = DesktopChatLine

    async def upsert(
        self, user_id: UUID, agent_id: str, lines: Sequence[IncomingLine]
    ) -> None:
        """Each line written as sent, a known one replaced in place. A line
        without its own time keeps the time it first came with, or now."""
        if not lines:
            return
        found = await self.session.execute(
            select(DesktopChatLine.entry_id, DesktopChatLine.at_ms).where(
                DesktopChatLine.user_id == user_id,
                DesktopChatLine.agent_id == agent_id,
                DesktopChatLine.entry_id.in_([line.entry_id for line in lines]),
            )
        )
        known: dict[str, int] = {entry_id: at_ms for entry_id, at_ms in found.all()}
        now = utc_now()
        now_ms = int(now.timestamp() * 1000)
        # The last copy of a line sent twice in one batch is the one kept.
        latest = {line.entry_id: line for line in lines}
        values = [
            {
                "id": generate_uuid(),
                "created_at": now,
                "user_id": user_id,
                "agent_id": agent_id,
                "entry_id": line.entry_id,
                "at_ms": line.at_ms
                if line.at_ms is not None
                else known.get(line.entry_id, now_ms),
                "entry": line.entry,
            }
            for line in latest.values()
        ]
        statement = insert(DesktopChatLine).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[
                DesktopChatLine.user_id,
                DesktopChatLine.agent_id,
                DesktopChatLine.entry_id,
            ],
            set_={
                "entry": statement.excluded.entry,
                "at_ms": statement.excluded.at_ms,
                "modified_at": now,
            },
        )
        await self.session.execute(statement)

    async def remove(
        self, user_id: UUID, agent_id: str, entry_ids: Iterable[str]
    ) -> None:
        ids = list(entry_ids)
        if not ids:
            return
        await self.session.execute(
            delete(DesktopChatLine).where(
                DesktopChatLine.user_id == user_id,
                DesktopChatLine.agent_id == agent_id,
                DesktopChatLine.entry_id.in_(ids),
            )
        )

    async def clear(self, user_id: UUID, agent_ids: Iterable[str]) -> None:
        """Every line of these agents' chats (a chat cleared, an agent gone)."""
        ids = list(agent_ids)
        if not ids:
            return
        await self.session.execute(
            delete(DesktopChatLine).where(
                DesktopChatLine.user_id == user_id,
                DesktopChatLine.agent_id.in_(ids),
            )
        )

    async def prune(self, user_id: UUID, agent_id: str, keep: int) -> None:
        """Only the chat's newest `keep` lines stay."""
        older = (
            select(DesktopChatLine.id)
            .where(
                DesktopChatLine.user_id == user_id, DesktopChatLine.agent_id == agent_id
            )
            .order_by(DesktopChatLine.at_ms.desc(), DesktopChatLine.created_at.desc())
            .offset(keep)
        )
        await self.session.execute(
            delete(DesktopChatLine).where(DesktopChatLine.id.in_(older))
        )

    async def newest(
        self, user_id: UUID, agent_id: str, limit: int
    ) -> tuple[list[DesktopChatLine], bool]:
        """The chat's newest `limit` lines, oldest first, and whether older
        ones are held too."""
        statement = (
            self.get_base_statement()
            .where(
                DesktopChatLine.user_id == user_id, DesktopChatLine.agent_id == agent_id
            )
            .order_by(DesktopChatLine.at_ms.desc(), DesktopChatLine.created_at.desc())
            .limit(limit + 1)
        )
        rows = list(await self.get_all(statement))
        return list(reversed(rows[:limit])), len(rows) > limit

    async def newest_ids(self, user_id: UUID) -> dict[str, str]:
        """Each chat's newest line held (agent id → line id): what the
        computer compares with its own before sending a chat again."""
        statement = (
            select(DesktopChatLine.agent_id, DesktopChatLine.entry_id)
            .where(DesktopChatLine.user_id == user_id)
            .distinct(DesktopChatLine.agent_id)
            .order_by(
                DesktopChatLine.agent_id,
                DesktopChatLine.at_ms.desc(),
                DesktopChatLine.created_at.desc(),
            )
        )
        found = await self.session.execute(statement)
        return {agent_id: entry_id for agent_id, entry_id in found.all()}

    async def count_lines(self, user_id: UUID, agent_id: str) -> int:
        statement = select(func.count()).where(
            DesktopChatLine.user_id == user_id, DesktopChatLine.agent_id == agent_id
        )
        return int((await self.session.execute(statement)).scalar_one())
