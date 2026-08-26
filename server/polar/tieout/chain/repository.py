"""The fact store's queries, and nothing else in front of them.

The one access rule, stated once: **facts are reachable only through
membership of the deal their document belongs to.** Every read here
either takes the artifact (whose deal the router has already checked)
or joins out to it so the router can check. A fact id is a capability
to ask, never a capability to see.
"""

from uuid import UUID

from sqlalchemy import select

from polar.kit.repository import RepositoryBase
from polar.models.tieout import Artifact

from .store import ChainFact, ChainRefusal


class ChainFactRepository(RepositoryBase[ChainFact]):
    model = ChainFact

    async def get(self, fact_id: UUID) -> tuple[ChainFact, Artifact] | None:
        """The fact and the document version it is true of, together.

        The artifact rides along because serving a fact requires its
        lineage (the approved schema's `document_id`) and the router
        requires its `dossier_id` for the membership check — one query,
        no lazy loads.
        """
        statement = (
            select(ChainFact, Artifact)
            .join(Artifact, Artifact.id == ChainFact.artifact_id)
            .where(ChainFact.id == fact_id, ChainFact.deleted_at.is_(None))
        )
        row = (await self.session.execute(statement)).one_or_none()
        return (row[0], row[1]) if row is not None else None

    async def list_for_artifact(self, artifact_id: UUID) -> list[ChainFact]:
        """Every fact of one document version, in reading order."""
        statement = (
            select(ChainFact)
            .where(
                ChainFact.artifact_id == artifact_id,
                ChainFact.deleted_at.is_(None),
            )
            .order_by(ChainFact.page, ChainFact.top, ChainFact.x0)
        )
        return list((await self.session.execute(statement)).scalars().all())

    async def list_for_dossier(
        self, dossier_id: UUID
    ) -> list[tuple[ChainFact, Artifact]]:
        """Every fact in one deal, each with its document version.

        The link proposal's candidate pool: a typed model number may be
        sourced from any extracted document on the same deal, so the
        matcher sees them all and the labels decide.
        """
        statement = (
            select(ChainFact, Artifact)
            .join(Artifact, Artifact.id == ChainFact.artifact_id)
            .where(
                Artifact.dossier_id == dossier_id,
                ChainFact.deleted_at.is_(None),
                Artifact.deleted_at.is_(None),
            )
            .order_by(ChainFact.artifact_id, ChainFact.page, ChainFact.top)
        )
        return [
            (row[0], row[1]) for row in (await self.session.execute(statement)).all()
        ]


class ChainRefusalRepository(RepositoryBase[ChainRefusal]):
    model = ChainRefusal

    async def list_for_artifact(self, artifact_id: UUID) -> list[ChainRefusal]:
        statement = (
            select(ChainRefusal)
            .where(
                ChainRefusal.artifact_id == artifact_id,
                ChainRefusal.deleted_at.is_(None),
            )
            .order_by(ChainRefusal.page)
        )
        return list((await self.session.execute(statement)).scalars().all())
