from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import contains_eager

from simeon.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from simeon.kit.utils import utc_now
from simeon.models import Member, MemberSession
from simeon.models.customer import Customer


class MemberSessionRepository(
    RepositorySoftDeletionIDMixin[MemberSession, UUID],
    RepositorySoftDeletionMixin[MemberSession],
    RepositoryBase[MemberSession],
):
    model = MemberSession

    async def get_by_token_hash(
        self, token_hash: str, *, expired: bool = False
    ) -> MemberSession | None:
        statement = (
            select(MemberSession)
            .join(MemberSession.member)
            .join(Member.customer)
            .where(
                MemberSession.token == token_hash,
                MemberSession.deleted_at.is_(None),
                Member.deleted_at.is_(None),
            )
            .options(
                contains_eager(MemberSession.member)
                .contains_eager(Member.customer)
                .joinedload(Customer.organization)
            )
        )
        if not expired:
            statement = statement.where(MemberSession.expires_at > utc_now())

        result = await self.session.execute(statement)
        return result.unique().scalar_one_or_none()

    async def delete_expired(self) -> None:
        statement = delete(MemberSession).where(MemberSession.expires_at < utc_now())
        await self.session.execute(statement)
