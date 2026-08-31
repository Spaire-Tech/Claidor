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

from .link import ChainLink, LinkState
from .store import ChainFact, ChainRefusal
from .terms import ChainTerm


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


class ChainLinkRepository(RepositoryBase[ChainLink]):
    """D4's confirmed links. Every read is scoped by the deal.

    Same access rule as the facts, and for a stronger reason: a link is
    a person's statement about a deal, so a link id must never be a
    capability to see one. Every method here either takes the
    `dossier_id` the router has already checked membership of, or
    returns it so the router can.
    """

    model = ChainLink

    async def get_in_dossier(self, dossier_id: UUID, link_id: UUID) -> ChainLink | None:
        """One link, only if it belongs to the deal the caller named."""
        statement = self.get_base_statement().where(
            ChainLink.id == link_id,
            ChainLink.dossier_id == dossier_id,
            ChainLink.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def list_for_dossier(
        self, dossier_id: UUID, *, state: LinkState | None = None
    ) -> list[ChainLink]:
        """The deal's links, newest confirmation first.

        `state` filters to one kind — the screen that asks « what is
        broken on this deal » is the reason the composite index exists.
        """
        statement = self.get_base_statement().where(
            ChainLink.dossier_id == dossier_id, ChainLink.deleted_at.is_(None)
        )
        if state is not None:
            statement = statement.where(ChainLink.state == state)
        statement = statement.order_by(ChainLink.confirmed_at.desc())
        return list(await self.get_all(statement))

    async def list_for_model_version(
        self, dossier_id: UUID, model_version_id: UUID
    ) -> list[ChainLink]:
        """Every link confirmed against one upload of the workbook.

        This is what a re-check iterates: the links whose model side
        pointed at the version being superseded.
        """
        statement = (
            self.get_base_statement()
            .where(
                ChainLink.dossier_id == dossier_id,
                ChainLink.model_version_id == model_version_id,
                ChainLink.deleted_at.is_(None),
            )
            .order_by(ChainLink.cell_name)
        )
        return list(await self.get_all(statement))

    async def find_pair(
        self, dossier_id: UUID, cell_id: UUID, fact_id: UUID
    ) -> ChainLink | None:
        """The existing link for this exact pair, if a person made one.

        Used before writing, so confirming the same pair twice updates
        one row instead of growing two contradictory ones — and so a
        pair a person already *rejected* is not put to them again.
        """
        statement = self.get_base_statement().where(
            ChainLink.dossier_id == dossier_id,
            ChainLink.cell_id == cell_id,
            ChainLink.fact_id == fact_id,
            ChainLink.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)


class ChainTermRepository(RepositoryBase[ChainTerm]):
    """The deal's terms table. Every read is scoped by the deal.

    Same access rule as links, for the same reason: a term is a
    person's statement about a deal, so a term id must never be a
    capability to see one.
    """

    model = ChainTerm

    async def get_in_dossier(self, dossier_id: UUID, term_id: UUID) -> ChainTerm | None:
        """One term, only if it belongs to the deal the caller named."""
        statement = self.get_base_statement().where(
            ChainTerm.id == term_id,
            ChainTerm.dossier_id == dossier_id,
            ChainTerm.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def get_for_user(self, term_id: UUID) -> ChainTerm | None:
        """One term by id alone — the router still checks its deal."""
        statement = self.get_base_statement().where(
            ChainTerm.id == term_id, ChainTerm.deleted_at.is_(None)
        )
        return await self.get_one_or_none(statement)

    async def list_for_dossier(self, dossier_id: UUID) -> list[ChainTerm]:
        """The deal's whole table, in the order the documents state it:
        by document, then page, then when it was put on the record —
        superseded rows included, because a superseded term is history
        a reviewer may need, not a deleted one."""
        statement = (
            self.get_base_statement()
            .where(ChainTerm.dossier_id == dossier_id, ChainTerm.deleted_at.is_(None))
            .order_by(ChainTerm.document_id, ChainTerm.page, ChainTerm.created_at)
        )
        return list(await self.get_all(statement))

    async def find_for_fact(self, dossier_id: UUID, fact_id: UUID) -> ChainTerm | None:
        """The existing term picked from this fact, if a person made one.

        Picking the same figure twice updates the one row rather than
        growing two — the confirm-once precedent, applied to picking.
        """
        statement = self.get_base_statement().where(
            ChainTerm.dossier_id == dossier_id,
            ChainTerm.fact_id == fact_id,
            ChainTerm.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)
