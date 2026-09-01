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
    Correction,
    CorrectionState,
    DealVisit,
    Dossier,
    DossierMember,
    Figure,
    FigureLink,
    Finding,
    FindingKind,
    FindingState,
    HouseRules,
    LinkState,
    ModelCell,
    OneOffCheck,
    User,
    UserOrganization,
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
        external_id: str | None = None,
        external_version: str | None = None,
        lineage_of: UUID | None = None,
    ) -> Artifact:
        """One version of one document, in the lineage it belongs to.

        **Which document this is, in the best terms available.** A caller
        that knows the store's own identity — a sync, which has a drive
        item id — passes the lineage it found by that id, and a rename is
        a rename rather than a second document. A hand upload has only the
        filename, which is a guess and has always been one, and keeps it.
        """
        lineage_id = (
            lineage_of or await self.find_lineage(dossier_id, filename) or uuid4()
        )
        version = await self.next_version(dossier_id, lineage_id)
        artifact = Artifact(
            dossier_id=dossier_id,
            kind=kind,
            filename=filename,
            uploaded_by_id=uploaded_by_id,
            file_id=file_id,
            external_id=external_id,
            external_version=external_version,
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

    async def previous_version(self, artifact: Artifact) -> Artifact | None:
        """The version of this document before the one given.

        The model page's whole reason to exist: what moved, and which deck
        figures went stale because of it.
        """
        statement = (
            select(Artifact)
            .where(
                Artifact.lineage_id == artifact.lineage_id,
                Artifact.dossier_id == artifact.dossier_id,
                Artifact.version < artifact.version,
                Artifact.status == ArtifactStatus.ready,
                Artifact.deleted_at.is_(None),
            )
            .order_by(Artifact.version.desc())
            .limit(1)
        )
        return (await self.session.execute(statement)).scalars().first()

    async def list_artifacts(self, dossier_id: UUID) -> Sequence[Artifact]:
        """Every artifact in the deal, newest first.

        Unbounded on purpose, and only for callers that genuinely need all
        of them — the check, and `current_artifacts` below. A *screen* asks
        `page_artifacts`, because a deal with three thousand files dropped
        into it is a normal deal.
        """
        statement = (
            select(Artifact)
            .where(Artifact.dossier_id == dossier_id, Artifact.deleted_at.is_(None))
            .order_by(Artifact.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def page_artifacts(
        self,
        dossier_id: UUID,
        *,
        query: str = "",
        kinds: Sequence[ArtifactKind] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[Sequence[Artifact], int]:
        """One page of the data room, and how many rows it is a page of.

        The total comes back with the page because « showing 100 of 3,003 »
        is a line the screen has to be able to write. A page without its
        total leaves a screen to either guess or keep quiet, and keeping
        quiet about how much it is not showing is the one thing no list
        here is allowed to do.

        **The newest version of each document, not every version.** Folded
        in SQL rather than in the client, which is where it used to happen:
        a client that pages *and* folds draws a short page whenever a
        document has several versions in it, and cannot say how many
        documents there really are.
        """
        newest = (
            select(
                Artifact.id,
                func.row_number()
                .over(
                    partition_by=Artifact.lineage_id,
                    order_by=Artifact.version.desc(),
                )
                .label("rank"),
            )
            .where(Artifact.dossier_id == dossier_id, Artifact.deleted_at.is_(None))
            .subquery()
        )
        where = [
            Artifact.dossier_id == dossier_id,
            Artifact.deleted_at.is_(None),
            Artifact.id.in_(select(newest.c.id).where(newest.c.rank == 1)),
        ]
        if query:
            where.append(Artifact.filename.ilike(f"%{query}%"))
        if kinds:
            where.append(Artifact.kind.in_(kinds))

        total = (
            await self.session.execute(
                select(func.count()).select_from(Artifact).where(*where)
            )
        ).scalar_one()
        rows = (
            (
                await self.session.execute(
                    select(Artifact)
                    .where(*where)
                    .order_by(Artifact.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return rows, total

    async def count_artifacts(self, dossier_id: UUID) -> tuple[int, int]:
        """How many artifacts, and how many documents they are.

        Two numbers because they answer different questions: « 3,003 files
        uploaded » is storage, « 2,998 documents » is what a person would
        count, and the gap between them is versions.
        """
        rows = (
            await self.session.execute(
                select(
                    func.count(Artifact.id),
                    func.count(func.distinct(Artifact.lineage_id)),
                ).where(
                    Artifact.dossier_id == dossier_id, Artifact.deleted_at.is_(None)
                )
            )
        ).one()
        return int(rows[0]), int(rows[1])

    async def mark_visited(self, dossier_id: UUID, user_id: UUID) -> None:
        """This person looked at this deal just now."""
        now = datetime.now(UTC)
        found = await self.session.execute(
            select(DealVisit).where(
                DealVisit.dossier_id == dossier_id, DealVisit.user_id == user_id
            )
        )
        visit = found.scalars().first()
        if visit is None:
            self.session.add(
                DealVisit(dossier_id=dossier_id, user_id=user_id, visited_at=now)
            )
        else:
            visit.visited_at = now
        await self.session.flush()

    async def visits_for(self, user_id: UUID) -> dict[UUID, "datetime"]:
        """When this person last looked at each deal, keyed by deal."""
        found = await self.session.execute(
            select(DealVisit).where(DealVisit.user_id == user_id)
        )
        return {one.dossier_id: one.visited_at for one in found.scalars().all()}

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

    async def deals_for(self, user_id: UUID) -> Sequence[Dossier]:
        """Every deal this person is on, across organizations.

        ``DossierRepository.list_for_user`` scopes to one organization,
        which is right for the dashboard's sidebar and wrong for the panel:
        a document is open in PowerPoint and nothing on screen says which
        organization it belongs to.
        """
        statement = (
            select(Dossier)
            .join(DossierMember, DossierMember.dossier_id == Dossier.id)
            .where(
                Dossier.deleted_at.is_(None),
                DossierMember.user_id == user_id,
                DossierMember.deleted_at.is_(None),
            )
            .order_by(Dossier.modified_at.desc().nullslast(), Dossier.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().unique().all()

    async def latest_of_lineage(self, lineage_id: UUID) -> Artifact | None:
        """The current version of a document, from the id that outlives it.

        A lineage id is what the panel stamps into a document, because the
        artifact id changes on every upload and the thing a banker means by
        « this deck » does not.
        """
        statement = (
            select(Artifact)
            .where(Artifact.lineage_id == lineage_id, Artifact.deleted_at.is_(None))
            .order_by(Artifact.version.desc())
            .limit(1)
        )
        return (await self.session.execute(statement)).scalars().first()

    async def uploaders(self, ids: Sequence[UUID]) -> dict[UUID, User]:
        """The people who put these files here, by id.

        One query for a page's worth of artifacts rather than one per row,
        which is the difference between a deal page and a deal page that
        gets slower every time somebody uploads.
        """
        if not ids:
            return {}
        statement = select(User).where(User.id.in_(list(set(ids))))
        rows = (await self.session.execute(statement)).scalars().unique().all()
        return {row.id: row for row in rows}

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

    async def get_figure(self, figure_id: UUID) -> Figure | None:
        statement = select(Figure).where(
            Figure.id == figure_id, Figure.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def get_cell(self, cell_id: UUID) -> ModelCell | None:
        statement = select(ModelCell).where(
            ModelCell.id == cell_id, ModelCell.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def search_cells(
        self, artifact_id: UUID, query: str, limit: int = 20
    ) -> Sequence[ModelCell]:
        """Named cells matching a few words, for « point it somewhere else ».

        Only named cells: a cell with no label around it is not something a
        banker can recognise in a list, whatever it holds.
        """
        statement = (
            select(ModelCell)
            .where(
                ModelCell.artifact_id == artifact_id,
                ModelCell.deleted_at.is_(None),
                ModelCell.name != "",
                ModelCell.name.ilike(f"%{query}%"),
            )
            .order_by(func.length(ModelCell.name), ModelCell.ref)
            .limit(limit)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def cells_of(self, artifact_id: UUID) -> Sequence[ModelCell]:
        """Every stored cell, as rows the session tracks.

        Use this only where a caller needs a cell's **identity** — a
        link points at a row, so grounding and the tie-out both do. For
        the callers that only rebuild the workbook, `cells_for_graph`
        below reads the same cells six times faster.
        """
        statement = (
            select(ModelCell)
            .where(ModelCell.artifact_id == artifact_id, ModelCell.deleted_at.is_(None))
            #: Row-major within each sheet, always. Without an order the
            #: database returns the rows however it likes, the rebuilt
            #: workbook's dict iterates in that order, and every pass
            #: that keeps « the first of a family » — the audit's
            #: collapse above all — can pick a different representative
            #: cell for the same defect on two runs of the same bytes.
            .order_by(ModelCell.sheet, ModelCell.row, ModelCell.column)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def cells_for_graph(self, artifact_id: UUID) -> Sequence[Any]:
        """The same cells, for a caller that only wants the workbook.

        **Identical rows, a quarter of the time.** On a real model —
        470,594 cells — `cells_of` takes 16.0 seconds and this takes
        4.0 (medians of three, alternating so neither gets the warm
        cache), and every bit of the difference is the ORM building an
        instrumented object per row for callers that read attributes off
        it once and throw it away. Measured, not assumed:
        `docs/pierce/logs/atelier.md`, twenty-second turn.

        The rows come back as SQLAlchemy `Row`s, which answer to the
        same attribute names, so `service._workbook_of` takes either.
        What they do **not** carry is `id` — deliberately, because that
        is the whole difference between the two methods and a caller
        that needs identity should be reading `cells_of`.
        """
        statement = select(
            ModelCell.ref,
            ModelCell.sheet,
            ModelCell.row,
            ModelCell.column,
            ModelCell.value,
            ModelCell.formula,
            ModelCell.row_label,
            ModelCell.column_label,
            ModelCell.precedents,
            ModelCell.unresolved,
            ModelCell.alias_of,
        ).where(ModelCell.artifact_id == artifact_id, ModelCell.deleted_at.is_(None))
        #: Same order as `cells_of`, same reason: a deterministic
        #: workbook, whichever read built it.
        statement = statement.order_by(ModelCell.sheet, ModelCell.row, ModelCell.column)
        return (await self.session.execute(statement)).all()

    async def figures_by_id(self, ids: Sequence[UUID]) -> dict[UUID, Figure]:
        if not ids:
            return {}
        statement = select(Figure).where(Figure.id.in_(list(ids)))
        rows = (await self.session.execute(statement)).scalars().all()
        return {row.id: row for row in rows}

    async def cells_by_id(self, ids: Sequence[UUID]) -> dict[UUID, ModelCell]:
        if not ids:
            return {}
        statement = select(ModelCell).where(ModelCell.id.in_(list(ids)))
        rows = (await self.session.execute(statement)).scalars().all()
        return {row.id: row for row in rows}

    # --- links ----------------------------------------------------------

    async def links_of(
        self, dossier_id: UUID, *, state: LinkState | None = None
    ) -> Sequence[FigureLink]:
        statement = (
            select(FigureLink)
            .where(FigureLink.dossier_id == dossier_id, FigureLink.deleted_at.is_(None))
            .order_by(FigureLink.confidence.desc())
        )
        if state is not None:
            statement = statement.where(FigureLink.state == state)
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
        self,
        dossier_id: UUID,
        links: Sequence[FigureLink],
        *,
        figures_on: Sequence[UUID] | None = None,
    ) -> None:
        """Swap the proposals, leaving anything a person decided alone.

        A re-run must never undo a confirmation or resurrect a rejection —
        those are the only facts in the table.

        **Scoped to the documents the run actually read.** Two checkers
        propose links now: the tie-out, between a deliverable's figures and
        the model's cells, and the crosscheck, between a source document's
        figures and the model's typed inputs. They share this table because
        they are the same claim — *this printed number is that cell* — and
        a banker confirms both the same way. Without `figures_on` the
        second to run would delete the first's work, which is the sort of
        defect that looks like a flaky linker for a week.
        """
        where = [
            FigureLink.dossier_id == dossier_id,
            FigureLink.state == LinkState.proposed,
        ]
        if figures_on is not None:
            where.append(
                FigureLink.figure_id.in_(
                    select(Figure.id).where(Figure.artifact_id.in_(figures_on))
                )
            )
        await self.session.execute(delete(FigureLink).where(*where))
        self.session.add_all(links)
        await self.session.flush()

    async def grounding_for(
        self, dossier_id: UUID, cell_id: UUID
    ) -> tuple[FigureLink, Figure, Artifact] | None:
        """The source document a typed input was matched to, if any.

        One link, and the best one: a confirmed link outranks a proposal,
        because from the moment somebody vouches for it the chain's last
        hop is a fact rather than a guess. A rejected link is not an
        answer at all — somebody looked at exactly this and said no.
        """
        statement = (
            select(FigureLink, Figure, Artifact)
            .join(Figure, Figure.id == FigureLink.figure_id)
            .join(Artifact, Artifact.id == Figure.artifact_id)
            .where(
                FigureLink.dossier_id == dossier_id,
                FigureLink.cell_id == cell_id,
                FigureLink.deleted_at.is_(None),
                FigureLink.state.in_([LinkState.confirmed, LinkState.proposed]),
                Artifact.kind == ArtifactKind.source,
                Artifact.deleted_at.is_(None),
            )
            # `confirmed` sorts before `proposed` alphabetically, which is
            # luck rather than design, so it is ordered explicitly.
            .order_by(
                (FigureLink.state == LinkState.confirmed).desc(),
                FigureLink.confidence.desc(),
            )
            .limit(1)
        )
        row = (await self.session.execute(statement)).first()
        return (row[0], row[1], row[2]) if row is not None else None

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

    async def replace_findings(
        self, dossier_id: UUID, kind: CheckKind, findings: Sequence[Finding]
    ) -> None:
        """Fold a run's findings in, and let every ruling survive.

        This used to delete everything and recreate it, letting only
        *dismissals* back through — so a finding accepted with a note
        came back open on the very next run, and pressing « Fix the
        cell » (which re-checks) resurrected everything the banker had
        already ruled on. A ruling that evaporates on refresh is the
        fastest way to lose a user.

        Now a finding that recurs — same fingerprint — **is the same
        row**: it keeps its id, its state (accepted, dismissed, open),
        its note, and its `created_at`, which is what makes « first
        seen with version N » a fact rather than the last run's clock.
        Its content is refreshed from the new run, because the
        sentences and evidence may have improved. A fingerprint the new
        run no longer produces is a defect that no longer exists, and
        its row goes. Only the findings of *this* kind are touched — an
        audit re-run must not wipe the tie-out's.
        """
        mapping = {
            CheckKind.tieout: ("drift", "stale"),
            CheckKind.audit: ("audit", "reference"),
            CheckKind.crosscheck: ("contradiction",),
        }[kind]
        statement = select(Finding).where(
            Finding.dossier_id == dossier_id,
            Finding.kind.in_(mapping),
            Finding.deleted_at.is_(None),
        )
        existing: dict[str, Finding] = {}
        for row in (await self.session.execute(statement)).scalars():
            existing.setdefault(row.fingerprint, row)

        matched: set[UUID] = set()
        for fresh in findings:
            old = existing.get(fresh.fingerprint)
            if old is None or old.id in matched:
                self.session.add(fresh)
                continue
            matched.add(old.id)
            for field in (
                "check_run_id",
                "artifact_id",
                "kind",
                "severity",
                "rule",
                "standard",
                "page",
                "printed",
                "expected",
                "one_tick",
                "title",
                "detail",
                "location",
                "anchor",
                "evidence",
            ):
                value = getattr(fresh, field)
                #: An unset attribute on the fresh row is a column
                #: default waiting to fire at insert — a drift finding
                #: never sets `rule` — and copying its None over the old
                #: row would null a NOT NULL column. Only the two
                #: genuinely nullable references may carry None across.
                if value is None and field not in ("check_run_id", "artifact_id"):
                    continue
                setattr(old, field, value)
            self.session.add(old)

        stale = [row.id for row in existing.values() if row.id not in matched]
        if stale:
            await self.session.execute(delete(Finding).where(Finding.id.in_(stale)))
        await self.session.flush()

    async def findings_of(
        self,
        dossier_id: UUID,
        *,
        artifact_id: UUID | None = None,
        kind: CheckKind | FindingKind | None = None,
        state: FindingState | None = None,
    ) -> Sequence[Finding]:
        """Ordered the way they should be read.

        `one_tick` sorts first because it sorts False before True: a
        difference of exactly one unit at the printed precision is almost
        always a rounding convention, and putting those at the bottom is
        what stops the list opening on eight non-problems.
        """
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
        if isinstance(kind, FindingKind):
            statement = statement.where(Finding.kind == kind)
        if state is not None:
            statement = statement.where(Finding.state == state)
        return (await self.session.execute(statement)).scalars().all()

    async def count_findings(self, dossier_id: UUID) -> dict[str, int]:
        """How many findings sit in each state.

        Counted, never summed across severities: an error and a smell are
        not « two problems », and a screen that adds them teaches a banker
        to ignore the number.
        """
        statement = (
            select(Finding.state, func.count())
            .where(Finding.dossier_id == dossier_id, Finding.deleted_at.is_(None))
            .group_by(Finding.state)
        )
        rows = (await self.session.execute(statement)).all()
        counts = {state.value: 0 for state in FindingState}
        for state, count in rows:
            counts[state if isinstance(state, str) else state.value] = int(count)
        return counts

    async def get_finding(self, finding_id: UUID) -> Finding | None:
        statement = select(Finding).where(
            Finding.id == finding_id, Finding.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def set_finding_state(
        self, finding: Finding, *, state: FindingState, user_id: UUID, note: str = ""
    ) -> Finding:
        finding.state = state
        if state in (FindingState.dismissed, FindingState.accepted):
            #: Both are rulings, and a ruling keeps its reason and its
            #: author. « Accept with a note » used to fall through to
            #: the reopen branch below — the note was thrown away at the
            #: moment the screen promised it was being kept.
            finding.dismissed_by_id = user_id
            finding.dismissed_at = datetime.now(UTC)
            finding.note = note
        else:
            finding.dismissed_by_id = None
            finding.dismissed_at = None
            # The note goes with the ruling it explained. Reopening a
            # finding and keeping the old reason would attach yesterday's
            # judgement to tomorrow's state.
            finding.note = ""
        self.session.add(finding)
        await self.session.flush()
        return finding

    # --- corrections ----------------------------------------------------

    async def corrections_of(
        self, dossier_id: UUID, *, state: CorrectionState | None = None
    ) -> Sequence[Correction]:
        """Every correction on the deal, newest decision last.

        Ordered by where it sits rather than by when it was proposed: a
        reader going through a deck wants slide 2 before slide 7, and the
        order a check happened to emit them in means nothing to anybody.
        """
        statement = (
            select(Correction)
            .where(
                Correction.dossier_id == dossier_id,
                Correction.deleted_at.is_(None),
            )
            .order_by(Correction.page, Correction.created_at)
        )
        if state is not None:
            statement = statement.where(Correction.state == state)
        return (await self.session.execute(statement)).scalars().all()

    async def correction_for(
        self, dossier_id: UUID, fingerprint: str
    ) -> Correction | None:
        """The correction on one finding, by the identity that survives a run."""
        statement = select(Correction).where(
            Correction.dossier_id == dossier_id,
            Correction.fingerprint == fingerprint,
            Correction.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def corrections_by_fingerprint(
        self, dossier_id: UUID
    ) -> dict[str, Correction]:
        """Every correction, keyed the way a finding is found again."""
        return {one.fingerprint: one for one in await self.corrections_of(dossier_id)}

    async def save_correction(self, correction: Correction) -> Correction:
        self.session.add(correction)
        await self.session.flush()
        return correction

    async def get_correction(self, correction_id: UUID) -> Correction | None:
        statement = select(Correction).where(
            Correction.id == correction_id, Correction.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    # --- house rules and the team ---------------------------------------

    async def is_in_organization(self, organization_id: UUID, user_id: UUID) -> bool:
        """Organization membership — for the settings screens only.

        Deliberately weaker than deal membership: house rules and the
        team list are the organization's, not any deal's, and the deal
        rule (`_member_of`) must never be loosened to answer this.
        """
        statement = select(UserOrganization.user_id).where(
            UserOrganization.organization_id == organization_id,
            UserOrganization.user_id == user_id,
            UserOrganization.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).first() is not None

    async def house_rules_for(self, organization_id: UUID) -> HouseRules | None:
        statement = select(HouseRules).where(
            HouseRules.organization_id == organization_id,
            HouseRules.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def save_house_rules(self, rules: HouseRules) -> HouseRules:
        self.session.add(rules)
        await self.session.flush()
        return rules

    async def first_organization_for(self, user_id: UUID) -> UUID | None:
        """The caller's own organization, for callers that name none.

        The panel's token holds the tieout scopes only, so it cannot ask
        the organizations API which firm the person belongs to — that
        endpoint wants a scope the token must never hold. Oldest
        membership wins, deterministically.
        """
        statement = (
            select(UserOrganization.organization_id)
            .where(
                UserOrganization.user_id == user_id,
                UserOrganization.deleted_at.is_(None),
            )
            .order_by(UserOrganization.created_at)
            .limit(1)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def organization_of(self, dossier_id: UUID) -> UUID | None:
        """Whose policy applies to this deal."""
        statement = select(Dossier.organization_id).where(Dossier.id == dossier_id)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def team_of(self, organization_id: UUID) -> list[tuple[User, list[str]]]:
        """Everyone in the organization, with the deals each is on.

        The deals are names, already scoped to this organization — the
        People screen says « Falcon, Meridian » under a colleague, and
        never a deal from some other firm they also belong to.
        """
        people = (
            (
                await self.session.execute(
                    select(User)
                    .join(
                        UserOrganization,
                        UserOrganization.user_id == User.id,
                    )
                    .where(
                        UserOrganization.organization_id == organization_id,
                        UserOrganization.deleted_at.is_(None),
                    )
                    .order_by(User.email)
                )
            )
            .scalars()
            # The User model eager-loads collections; without unique()
            # SQLAlchemy refuses to hand the joined rows back.
            .unique()
            .all()
        )
        rows = (
            await self.session.execute(
                select(DossierMember.user_id, Dossier.name)
                .join(Dossier, Dossier.id == DossierMember.dossier_id)
                .where(
                    Dossier.organization_id == organization_id,
                    Dossier.deleted_at.is_(None),
                    DossierMember.deleted_at.is_(None),
                )
                .order_by(Dossier.created_at)
            )
        ).all()
        deals: dict[UUID, list[str]] = {}
        for user_id, name in rows:
            deals.setdefault(user_id, []).append(name)
        return [(person, deals.get(person.id, [])) for person in people]

    async def organization_deals(self, organization_id: UUID) -> int:
        """How many deals the organization has — « All six deals »."""
        statement = select(func.count(Dossier.id)).where(
            Dossier.organization_id == organization_id,
            Dossier.deleted_at.is_(None),
        )
        return int((await self.session.execute(statement)).scalar_one())

    # --- one-off checks -------------------------------------------------

    async def save_one_off(self, check: OneOffCheck) -> OneOffCheck:
        self.session.add(check)
        await self.session.flush()
        return check

    async def recent_checks(
        self, user_id: UUID, *, limit: int = 20
    ) -> Sequence[OneOffCheck]:
        """One person's recent one-off checks, newest first.

        Scoped to the person, not the organization: a loose file checked
        before it is anybody's deal is not yet the team's business.
        """
        statement = (
            select(OneOffCheck)
            .where(
                OneOffCheck.user_id == user_id,
                OneOffCheck.deleted_at.is_(None),
            )
            .order_by(OneOffCheck.created_at.desc())
            .limit(limit)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_one_off(self, check_id: UUID, user_id: UUID) -> OneOffCheck | None:
        """One stored check — only ever its owner's."""
        statement = select(OneOffCheck).where(
            OneOffCheck.id == check_id,
            OneOffCheck.user_id == user_id,
            OneOffCheck.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()


__all__ = ["TieOutRepository"]
