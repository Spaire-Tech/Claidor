"""The queries behind the Simeon Network (`network.py`, 10 November 2026)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, or_, select, update

from simeon.kit.repository import RepositoryBase
from simeon.kit.utils import utc_now
from simeon.models import (
    DesktopNetwork,
    DesktopNetworkMember,
    DesktopNetworkMessage,
    DesktopNetworkSession,
    User,
)


class DesktopNetworkRepository(RepositoryBase[DesktopNetwork]):
    model = DesktopNetwork

    async def get(self, network_id: UUID) -> DesktopNetwork | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(DesktopNetwork.id == network_id)
        )

    async def remove_if_empty(self, network_id: UUID) -> bool:
        """The network, gone when no one is left on it (its messages go
        with it). Answers whether it went."""
        left = await self.session.execute(
            select(func.count()).where(DesktopNetworkMember.network_id == network_id)
        )
        if int(left.scalar_one()) > 0:
            return False
        await self.session.execute(
            delete(DesktopNetwork).where(DesktopNetwork.id == network_id)
        )
        return True

    async def remove_empty_made_by(self, user_id: UUID) -> int:
        """Delete Account: the networks this person made that no one is on."""
        statement = (
            delete(DesktopNetwork)
            .where(
                DesktopNetwork.created_by == user_id,
                ~DesktopNetwork.id.in_(select(DesktopNetworkMember.network_id)),
            )
            .returning(DesktopNetwork.id)
        )
        return len((await self.session.execute(statement)).all())


class DesktopNetworkMemberRepository(RepositoryBase[DesktopNetworkMember]):
    model = DesktopNetworkMember

    async def of_user(self, user_id: UUID) -> DesktopNetworkMember | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(DesktopNetworkMember.user_id == user_id)
        )

    async def on_network(
        self, network_id: UUID
    ) -> list[tuple[DesktopNetworkMember, User]]:
        """Everyone on the network, in the order they joined, with their
        account."""
        statement = (
            select(DesktopNetworkMember, User)
            .join(User, User.id == DesktopNetworkMember.user_id)
            .where(DesktopNetworkMember.network_id == network_id)
            .order_by(DesktopNetworkMember.created_at, DesktopNetworkMember.id)
        )
        return [
            (member, user)
            for member, user in (await self.session.execute(statement)).unique().all()
        ]

    async def handles(self, network_id: UUID) -> set[str]:
        statement = select(DesktopNetworkMember.handle).where(
            DesktopNetworkMember.network_id == network_id
        )
        return set((await self.session.execute(statement)).scalars().all())

    async def remove_user(self, user_id: UUID) -> int:
        statement = (
            delete(DesktopNetworkMember)
            .where(DesktopNetworkMember.user_id == user_id)
            .returning(DesktopNetworkMember.id)
        )
        return len((await self.session.execute(statement)).all())


class DesktopNetworkSessionRepository(RepositoryBase[DesktopNetworkSession]):
    model = DesktopNetworkSession

    async def of_user(
        self, user_id: UUID, session_id: UUID
    ) -> DesktopNetworkSession | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(
                DesktopNetworkSession.id == session_id,
                DesktopNetworkSession.user_id == user_id,
            )
        )

    async def seen_since(
        self, user_ids: Sequence[UUID], since: datetime
    ) -> list[DesktopNetworkSession]:
        """These people's sessions seen since `since`, newest first."""
        if not user_ids:
            return []
        statement = (
            self.get_base_statement()
            .where(
                DesktopNetworkSession.user_id.in_(list(user_ids)),
                DesktopNetworkSession.last_seen_at >= since,
            )
            .order_by(DesktopNetworkSession.last_seen_at.desc())
        )
        return list(await self.get_all(statement))

    async def of_person(self, user_id: UUID) -> list[DesktopNetworkSession]:
        """All the person's sessions, newest first."""
        statement = (
            self.get_base_statement()
            .where(DesktopNetworkSession.user_id == user_id)
            .order_by(DesktopNetworkSession.last_seen_at.desc())
        )
        return list(await self.get_all(statement))

    async def last_of_client(
        self, user_id: UUID, client_id: str | None
    ) -> DesktopNetworkSession | None:
        """The person's session last seen through this OAuth client: where a
        bot that keeps no session id lands."""
        statement = (
            self.get_base_statement()
            .where(
                DesktopNetworkSession.user_id == user_id,
                DesktopNetworkSession.client_id == client_id,
            )
            .order_by(DesktopNetworkSession.last_seen_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)

    async def touch(self, network_session: DesktopNetworkSession) -> None:
        network_session.last_seen_at = utc_now()
        self.session.add(network_session)

    async def remove_older_than(self, user_id: UUID, before: datetime) -> int:
        statement = (
            delete(DesktopNetworkSession)
            .where(
                DesktopNetworkSession.user_id == user_id,
                DesktopNetworkSession.last_seen_at < before,
            )
            .returning(DesktopNetworkSession.id)
        )
        return len((await self.session.execute(statement)).all())

    async def remove_user(self, user_id: UUID) -> int:
        statement = (
            delete(DesktopNetworkSession)
            .where(DesktopNetworkSession.user_id == user_id)
            .returning(DesktopNetworkSession.id)
        )
        return len((await self.session.execute(statement)).all())


class DesktopNetworkMessageRepository(RepositoryBase[DesktopNetworkMessage]):
    model = DesktopNetworkMessage

    async def unread_for(
        self, session_id: UUID, limit: int
    ) -> list[DesktopNetworkMessage]:
        """Messages for this session not read yet, oldest first."""
        statement = (
            self.get_base_statement()
            .where(
                DesktopNetworkMessage.to_session_id == session_id,
                DesktopNetworkMessage.read_at.is_(None),
            )
            .order_by(DesktopNetworkMessage.created_at, DesktopNetworkMessage.id)
            .limit(limit)
        )
        return list(await self.get_all(statement))

    async def sent_by(
        self, user_id: UUID, message_id: UUID
    ) -> DesktopNetworkMessage | None:
        """One message the person's side sent (`message_status`); another
        person's ids are not found."""
        statement = self.get_base_statement().where(
            DesktopNetworkMessage.id == message_id,
            DesktopNetworkMessage.from_user_id == user_id,
        )
        return await self.get_one_or_none(statement)

    async def count_unread(self, session_id: UUID) -> int:
        statement = select(func.count()).where(
            DesktopNetworkMessage.to_session_id == session_id,
            DesktopNetworkMessage.read_at.is_(None),
        )
        return int((await self.session.execute(statement)).scalar_one())

    async def mark_read(self, ids: Sequence[UUID]) -> None:
        if not ids:
            return
        await self.session.execute(
            update(DesktopNetworkMessage)
            .where(DesktopNetworkMessage.id.in_(list(ids)))
            .values(read_at=utc_now())
        )

    async def open_to_agents(
        self, session_id: UUID, since: datetime
    ) -> list[DesktopNetworkMessage]:
        """What this session asked Simeon agents since `since` whose
        answers are still read from their chats, oldest first."""
        statement = (
            self.get_base_statement()
            .where(
                DesktopNetworkMessage.from_session_id == session_id,
                DesktopNetworkMessage.to_agent_id.is_not(None),
                DesktopNetworkMessage.closed.is_(False),
                DesktopNetworkMessage.created_at >= since,
            )
            .order_by(DesktopNetworkMessage.created_at, DesktopNetworkMessage.id)
        )
        return list(await self.get_all(statement))

    async def count_to_agents_of(
        self, from_user_id: UUID, to_user_id: UUID, since: datetime
    ) -> int:
        """How many messages this person's agents sent another person's
        Simeon agents since `since` (each wakes a computer and runs a turn
        on the other person's plan)."""
        statement = select(func.count()).where(
            DesktopNetworkMessage.from_user_id == from_user_id,
            DesktopNetworkMessage.to_user_id == to_user_id,
            DesktopNetworkMessage.to_agent_id.is_not(None),
            DesktopNetworkMessage.created_at >= since,
        )
        return int((await self.session.execute(statement)).scalar_one())

    async def count_from_agent(
        self, from_user_id: UUID, agent_id: str, since: datetime
    ) -> int:
        """How many messages one of this person's Simeon agents sent on the
        network since `since`."""
        statement = select(func.count()).where(
            DesktopNetworkMessage.from_user_id == from_user_id,
            DesktopNetworkMessage.from_agent_id == agent_id,
            DesktopNetworkMessage.created_at >= since,
        )
        return int((await self.session.execute(statement)).scalar_one())

    async def remove_older_than(self, user_id: UUID, before: datetime) -> int:
        statement = (
            delete(DesktopNetworkMessage)
            .where(
                DesktopNetworkMessage.to_user_id == user_id,
                DesktopNetworkMessage.created_at < before,
            )
            .returning(DesktopNetworkMessage.id)
        )
        return len((await self.session.execute(statement)).all())

    async def remove_user(self, user_id: UUID) -> int:
        statement = (
            delete(DesktopNetworkMessage)
            .where(
                or_(
                    DesktopNetworkMessage.from_user_id == user_id,
                    DesktopNetworkMessage.to_user_id == user_id,
                )
            )
            .returning(DesktopNetworkMessage.id)
        )
        return len((await self.session.execute(statement)).all())
