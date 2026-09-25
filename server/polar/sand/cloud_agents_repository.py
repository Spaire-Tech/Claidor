"""The cloud agents, queried (25 September 2026).

Every read here has the owner in the query: a `bc_id` is the name of
one person's work, and somebody else's answers « not found » from the
same statement as an id that never existed. Deleted agents are left out
the same way.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select

from polar.kit.repository import RepositoryBase, RepositoryIDMixin
from polar.models import MatyJob, SandCloudAgent


class SandCloudAgentRepository(
    RepositoryIDMixin[SandCloudAgent, UUID], RepositoryBase[SandCloudAgent]
):
    model = SandCloudAgent

    def _for_user(self, user_id: UUID) -> Select[tuple[SandCloudAgent]]:
        return self.get_base_statement().where(
            SandCloudAgent.user_id == user_id, SandCloudAgent.deleted_at.is_(None)
        )

    async def get_by_bc_id(self, user_id: UUID, bc_id: str) -> SandCloudAgent | None:
        return await self.get_one_or_none(
            self._for_user(user_id).where(SandCloudAgent.bc_id == bc_id)
        )

    async def get_by_job_id(self, job_id: UUID) -> SandCloudAgent | None:
        """The agent whose latest turn is this job, if any. Called from the
        runner's side, where there is no person: a job id is not
        guessable and names one row."""
        return await self.get_one_or_none(
            self.get_base_statement().where(
                SandCloudAgent.job_id == job_id, SandCloudAgent.deleted_at.is_(None)
            )
        )

    async def list_for_user(
        self, user_id: UUID, *, include_archived: bool, limit: int
    ) -> Sequence[SandCloudAgent]:
        statement = self._for_user(user_id).order_by(SandCloudAgent.created_at.desc())
        if not include_archived:
            statement = statement.where(SandCloudAgent.is_archived.is_(False))
        return await self.get_all(statement.limit(limit))


class CloudAgentJobRepository(
    RepositoryIDMixin[MatyJob, UUID], RepositoryBase[MatyJob]
):
    """The jobs of a cloud agent, read by id. `polar.maty.repository`
    owns the queue's own queries; this one only ever reads a row an agent
    points at."""

    model = MatyJob
