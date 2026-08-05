from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, select

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.models import MasterclassArchitectAnalysis, UserOrganization


class MasterclassArchitectAnalysisRepository(
    RepositorySoftDeletionIDMixin[MasterclassArchitectAnalysis, UUID],
    RepositorySoftDeletionMixin[MasterclassArchitectAnalysis],
    RepositoryBase[MasterclassArchitectAnalysis],
):
    model = MasterclassArchitectAnalysis

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[MasterclassArchitectAnalysis]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            statement = statement.where(
                MasterclassArchitectAnalysis.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == auth_subject.subject.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                MasterclassArchitectAnalysis.organization_id == auth_subject.subject.id
            )
        return statement

    async def get_readable_by_id(
        self,
        auth_subject: AuthSubject[User | Organization],
        analysis_id: UUID,
    ) -> MasterclassArchitectAnalysis | None:
        statement = self.get_readable_statement(auth_subject).where(
            MasterclassArchitectAnalysis.id == analysis_id
        )
        return await self.get_one_or_none(statement)

    async def get_latest_for_channel(
        self,
        organization_id: UUID,
        external_channel_id: str,
        *,
        since: datetime,
    ) -> MasterclassArchitectAnalysis | None:
        """Newest non-deleted analysis of this channel for this org inside
        the reuse window — the duplicate-paste / quota guard."""
        statement = (
            self.get_base_statement()
            .where(
                MasterclassArchitectAnalysis.organization_id == organization_id,
                MasterclassArchitectAnalysis.external_channel_id == external_channel_id,
                MasterclassArchitectAnalysis.created_at >= since,
            )
            .order_by(MasterclassArchitectAnalysis.created_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)
