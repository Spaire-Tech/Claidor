"""All tie-out database access, scoped by deal membership.

Every read here goes through ``DossierMember``, the same rule the rest of
the workspace follows: a deal is closed by default and organization
membership grants nothing. A banker who is not on the deal gets the same
answer as a stranger — not found.

One class rather than six, matching ``DossierRepository`` next door, which
carries documents, questions, citations and agent tasks together. The
sections below follow the chain: artifacts, then what was read out of
them, then the links, then the findings.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Select, delete, func, select

from polar.kit.repository import RepositoryBase
from polar.models import (
    Artifact,
    ArtifactKind,
    ArtifactStatus,
    CheckKind,
    CheckRun,
    CheckStatus,
    DossierMember,
    Figure,
    FigureLink,
    Finding,
    FindingState,
    LinkState,
    ModelCell,
)


class TieOutRepository(RepositoryBase[Artifact]):
    model = Artifact

    # --- access ---------------------------------------------------------

    def _member_of(self, dossier_id: UUID, user_id: UUID) -> Select[tuple[UUID]]:
        return select(DossierMember.dossier_id).where(
            DossierMember.dossier_id == dossier_id,
            DossierMember.user_id == user_id,
            DossierMember.deleted_at.is_(None),
        )

    async def is_member(self, dossier_id: UUID, user_id: UUID) -> bool:
        statement = self._member_of(dossier_id, user_id)
        return (await self.session.execute(statement)).first() is not None

    # --- artifacts ------------------------------------------------------

    async def next_version(self, dossier_id: UUID, lineage_id: UUID) -> int:
        """The version number this upload takes.

        Versions are per lineage, not per deal: two different models in one
        deal each count from one.
        """
        statement = select(func.coalesce(func.max(Artifact.version), 0)).where(
            Artifact.lineage_id == lineage_id,
            Artifact.dossier_id == dossier_id,
            Artifact.deleted_at.is_(None),
        )
        return int((await self.session.execute(statement)).scalar_one()) + 1

    async def find_lineage(self, dossier_id: UUID, filename: str) -> UUID | None:
        """The lineage a file with this name already belongs to.

        Same name, same document — which is how a banker thinks about
        re-uploading « the model » and is good enough until they rename it.
        """
        statement = (
            select(Artifact.lineage_id)
            .where(
                Artifact.dossier_id == dossier_id,
                Artifact.filename == filename,
                Artifact.deleted_at.is_(None),
            )
            .order_by(Artifact.version.desc())
            .limit(1)
        )
        return (await self.session.execute(statement)).scalars().first()

    async def create_artifact(
        self,
        *,
        dossier_id: UUID,
        kind: ArtifactKind,
        filename: str,
        uploaded_by_id: UUID,
        file_id: UUID | None = None,
    ) -> Artifact:
        lineage_id = await self.find_lineage(dossier_id, filename) or uuid4()
        version = await self.next_version(dossier_id, lineage_id)
        artifact = Artifact(
            dossier_id=dossier_id,
            kind=kind,
            filename=filename,
            uploaded_by_id=uploaded_by_id,
            file_id=file_id,
            lineage_id=lineage_id,
            version=version,
            status=ArtifactStatus.processing,
            counts={},
        )
        self.session.add(artifact)
        await self.session.flush()
        return artifact

    async def get_artifact(self, artifact_id: UUID) -> Artifact | None:
        statement = select(Artifact).where(
            Artifact.id == artifact_id, Artifact.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def list_artifacts(self, dossier_id: UUID) -> Sequence[Artifact]:
        """Every artifact in the deal, newest version of each first."""
        statement = (
            select(Artifact)
            .where(Artifact.dossier_id == dossier_id, Artifact.deleted_at.is_(None))
            .order_by(Artifact.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def current_artifacts(self, dossier_id: UUID) -> list[Artifact]:
        """The latest ready version of each lineage — what a check reads."""
        artifacts = await self.list_artifacts(dossier_id)
        latest: dict[UUID, Artifact] = {}
        for artifact in artifacts:
            if artifact.status is not ArtifactStatus.ready:
                continue
            seen = latest.get(artifact.lineage_id)
            if seen is None or artifact.version > seen.version:
                latest[artifact.lineage_id] = artifact
        return list(latest.values())

    # --- what was read out of them --------------------------------------

    async def replace_figures(
        self, artifact_id: UUID, figures: Sequence[Figure]
    ) -> None:
        await self.session.execute(
            delete(Figure).where(Figure.artifact_id == artifact_id)
        )
        self.session.add_all(figures)
        await self.session.flush()

    async def replace_cells(
        self, artifact_id: UUID, cells: Sequence[ModelCell]
    ) -> None:
        await self.session.execute(
            delete(ModelCell).where(ModelCell.artifact_id == artifact_id)
        )
        self.session.add_all(cells)
        await self.session.flush()

    async def figures_of(self, artifact_id: UUID) -> Sequence[Figure]:
        statement = (
            select(Figure)
            .where(Figure.artifact_id == artifact_id, Figure.deleted_at.is_(None))
            .order_by(Figure.page, Figure.id)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def cells_of(self, artifact_id: UUID) -> Sequence[ModelCell]:
        statement = select(ModelCell).where(
            ModelCell.artifact_id == artifact_id, ModelCell.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalars().all()

    # --- links ----------------------------------------------------------

    async def links_of(self, dossier_id: UUID) -> Sequence[FigureLink]:
        statement = (
            select(FigureLink)
            .where(FigureLink.dossier_id == dossier_id, FigureLink.deleted_at.is_(None))
            .order_by(FigureLink.confidence.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_link(self, link_id: UUID) -> FigureLink | None:
        statement = select(FigureLink).where(
            FigureLink.id == link_id, FigureLink.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def decide_link(
        self, link: FigureLink, *, state: LinkState, user_id: UUID
    ) -> FigureLink:
        """Confirm or reject. Confirming is the moment a guess becomes data."""
        link.state = state
        if state is LinkState.confirmed:
            link.confirmed_by_id = user_id
            link.confirmed_at = datetime.now(UTC)
        else:
            link.confirmed_by_id = None
            link.confirmed_at = None
        self.session.add(link)
        await self.session.flush()
        return link

    async def replace_proposals(
        self, dossier_id: UUID, links: Sequence[FigureLink]
    ) -> None:
        """Swap the proposals, leaving anything a person decided alone.

        A re-run must never undo a confirmation or resurrect a rejection —
        those are the only facts in the table.
        """
        await self.session.execute(
            delete(FigureLink).where(
                FigureLink.dossier_id == dossier_id,
                FigureLink.state == LinkState.proposed,
            )
        )
        self.session.add_all(links)
        await self.session.flush()

    async def decided_pairs(self, dossier_id: UUID) -> set[tuple[UUID, UUID]]:
        """Figure/cell pairs a person has already ruled on."""
        statement = select(FigureLink.figure_id, FigureLink.cell_id).where(
            FigureLink.dossier_id == dossier_id,
            FigureLink.state.in_([LinkState.confirmed, LinkState.rejected]),
            FigureLink.deleted_at.is_(None),
        )
        rows = (await self.session.execute(statement)).all()
        return {(row[0], row[1]) for row in rows}

    # --- check runs -----------------------------------------------------

    async def start_run(
        self,
        *,
        dossier_id: UUID,
        kind: CheckKind,
        artifact_ids: Sequence[UUID],
        requested_by_id: UUID | None,
    ) -> CheckRun:
        run = CheckRun(
            dossier_id=dossier_id,
            kind=kind,
            status=CheckStatus.running,
            artifact_ids=[str(one) for one in artifact_ids],
            summary={},
            started_at=datetime.now(UTC),
            requested_by_id=requested_by_id,
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def finish_run(
        self,
        run: CheckRun,
        *,
        summary: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> CheckRun:
        run.status = CheckStatus.failed if error else CheckStatus.done
        run.summary = summary or {}
        run.error = error
        run.finished_at = datetime.now(UTC)
        self.session.add(run)
        await self.session.flush()
        return run

    async def latest_run(
        self, dossier_id: UUID, kind: CheckKind | None = None
    ) -> CheckRun | None:
        statement = (
            select(CheckRun)
            .where(CheckRun.dossier_id == dossier_id, CheckRun.deleted_at.is_(None))
            .order_by(CheckRun.created_at.desc())
            .limit(1)
        )
        if kind is not None:
            statement = statement.where(CheckRun.kind == kind)
        return (await self.session.execute(statement)).scalars().first()

    # --- findings -------------------------------------------------------

    async def dismissed_fingerprints(self, dossier_id: UUID) -> set[str]:
        statement = select(Finding.fingerprint).where(
            Finding.dossier_id == dossier_id,
            Finding.state == FindingState.dismissed,
            Finding.deleted_at.is_(None),
        )
        return set((await self.session.execute(statement)).scalars().all())

    async def replace_findings(
        self, dossier_id: UUID, kind: CheckKind, findings: Sequence[Finding]
    ) -> None:
        """Swap this checker's findings, and let dismissals survive.

        A dismissed finding that comes back is the fastest way to lose a
        user, so the new rows inherit the state of any older row with the
        same fingerprint. Only the findings of *this* kind are cleared —
        an audit re-run must not wipe the tie-out's.
        """
        dismissed = await self.dismissed_fingerprints(dossier_id)
        mapping = {
            CheckKind.tieout: ("drift", "stale"),
            CheckKind.audit: ("audit", "reference"),
            CheckKind.crosscheck: ("contradiction",),
        }[kind]
        await self.session.execute(
            delete(Finding).where(
                Finding.dossier_id == dossier_id, Finding.kind.in_(mapping)
            )
        )
        for finding in findings:
            if finding.fingerprint in dismissed:
                finding.state = FindingState.dismissed
        self.session.add_all(findings)
        await self.session.flush()

    async def findings_of(
        self, dossier_id: UUID, *, artifact_id: UUID | None = None
    ) -> Sequence[Finding]:
        statement = (
            select(Finding)
            .where(Finding.dossier_id == dossier_id, Finding.deleted_at.is_(None))
            .order_by(
                Finding.one_tick,
                Finding.severity,
                Finding.page,
                Finding.printed,
            )
        )
        if artifact_id is not None:
            statement = statement.where(Finding.artifact_id == artifact_id)
        return (await self.session.execute(statement)).scalars().all()

    async def get_finding(self, finding_id: UUID) -> Finding | None:
        statement = select(Finding).where(
            Finding.id == finding_id, Finding.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def set_finding_state(
        self, finding: Finding, *, state: FindingState, user_id: UUID
    ) -> Finding:
        finding.state = state
        if state is FindingState.dismissed:
            finding.dismissed_by_id = user_id
            finding.dismissed_at = datetime.now(UTC)
        else:
            finding.dismissed_by_id = None
            finding.dismissed_at = None
        self.session.add(finding)
        await self.session.flush()
        return finding


__all__ = ["TieOutRepository"]
