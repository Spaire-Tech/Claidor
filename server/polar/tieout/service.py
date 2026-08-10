"""Ingesting a file, running a check, and answering the deal page.

The engine's own modules read files. This one reads **rows**, and that is
the whole difference between a library and a product: once a deck and a
model have been ingested, every re-check is a query and a comparison. No
file is opened, nothing is re-parsed, and a link a banker confirmed is
re-tested by arithmetic that cannot come out differently on Tuesday.

The adapters below — :func:`_workbook_of`, :func:`_figures_of` — exist for
exactly that. They rebuild the engine's own shapes out of what was stored,
so one implementation of the linker, the comparison and the chain serves
both the offline scripts and the running product.
"""

import hashlib
from collections.abc import Sequence
from decimal import Decimal
from typing import Any
from uuid import UUID

import structlog

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    Artifact,
    ArtifactKind,
    ArtifactStatus,
    CheckKind,
    CheckRun,
    FindingKind,
    FindingSeverity,
    LinkState,
)
from polar.models import Figure as FigureRow
from polar.models import FigureLink as LinkRow
from polar.models import Finding as FindingRow
from polar.models import ModelCell as CellRow

from . import figures as engine_figures
from .check import compare
from .ingest import Ingested, Unreadable, read_artifact
from .link import link as propose_links
from .model import Output
from .provenance import chain as render_chain
from .provenance import outputs_from_workbook
from .repository import TieOutRepository
from .workbook import Cell as EngineCell
from .workbook import Workbook

log = structlog.get_logger()


class TieOutService:
    # --- ingestion ------------------------------------------------------

    async def ingest(
        self,
        session: AsyncSession,
        *,
        dossier_id: UUID,
        kind: ArtifactKind,
        filename: str,
        payload: bytes,
        user_id: UUID,
        file_id: UUID | None = None,
    ) -> Artifact:
        """Read a file into rows, or record why it could not be read.

        A failed artifact is kept rather than discarded: the deal page has
        to be able to show *« this one did not work, and here is what to do
        about it »*, which is impossible if the row is gone.
        """
        repository = TieOutRepository.from_session(session)
        artifact = await repository.create_artifact(
            dossier_id=dossier_id,
            kind=kind,
            filename=filename,
            uploaded_by_id=user_id,
            file_id=file_id,
        )

        try:
            ingested = read_artifact(payload, filename, kind)
        except Unreadable as error:
            artifact.status = ArtifactStatus.failed
            artifact.error = str(error)
            session.add(artifact)
            await session.flush()
            log.info(
                "tieout.ingest.unreadable",
                artifact=str(artifact.id),
                reason=str(error)[:120],
            )
            return artifact

        await self._persist(session, artifact, ingested)
        artifact.status = ArtifactStatus.ready
        artifact.counts = ingested.counts
        artifact.outputs = ingested.outputs
        artifact.error = None
        session.add(artifact)
        await session.flush()
        return artifact

    async def _persist(
        self, session: AsyncSession, artifact: Artifact, ingested: Ingested
    ) -> None:
        repository = TieOutRepository.from_session(session)
        if ingested.figures:
            await repository.replace_figures(
                artifact.id,
                [
                    FigureRow(
                        artifact_id=artifact.id,
                        printed=figure.printed,
                        value=figure.value,
                        decimals=figure.decimals,
                        kind=figure.kind,
                        page=figure.slide,
                        label=figure.label,
                        location=figure.location,
                        context=figure.context,
                        section=figure.section,
                        range_endpoint=figure.range_endpoint,
                        parenthesised=figure.parenthesised,
                        subject=figure.subject,
                    )
                    for figure in ingested.figures
                ],
            )
        if ingested.cells:
            await repository.replace_cells(
                artifact.id,
                [
                    CellRow(
                        artifact_id=artifact.id,
                        ref=cell.ref,
                        sheet=cell.sheet,
                        row=cell.row,
                        column=cell.column,
                        value=cell.value,
                        formula=cell.formula,
                        row_label=cell.row_label,
                        column_label=cell.column_label,
                        name=cell.name,
                        precedents=list(cell.precedents),
                        alias_of=cell.alias_of,
                    )
                    for cell in ingested.cells
                ],
            )

    # --- checking -------------------------------------------------------

    async def run_tieout(
        self, session: AsyncSession, *, dossier_id: UUID, user_id: UUID | None
    ) -> CheckRun:
        """Reconcile every deck in the deal against every model in it.

        Reads rows. The files are never opened again, which is what makes
        a confirmed link re-checkable forever and what lets the documents
        be dropped while the chain is kept.
        """
        repository = TieOutRepository.from_session(session)
        current = await repository.current_artifacts(dossier_id)
        decks = [one for one in current if one.kind is ArtifactKind.deck]
        models = [one for one in current if one.kind is ArtifactKind.model]

        run = await repository.start_run(
            dossier_id=dossier_id,
            kind=CheckKind.tieout,
            artifact_ids=[one.id for one in decks + models],
            requested_by_id=user_id,
        )
        if not decks or not models:
            missing = "a model" if not models else "a deck"
            return await repository.finish_run(
                run,
                error=f"nothing to reconcile — this deal has no {missing} yet",
            )

        findings: list[FindingRow] = []
        links: list[LinkRow] = []
        totals = {"reconciled": 0, "agreeing": 0, "drifting": 0, "unlinked": 0}
        reasons: dict[str, int] = {}
        decided = await repository.decided_pairs(dossier_id)

        for model in models:
            cells = await repository.cells_of(model.id)
            book = _workbook_of(cells)
            by_ref = {cell.ref: cell for cell in cells}
            candidates = _candidates(book, cells, model.outputs)

            for deck in decks:
                rows = await repository.figures_of(deck.id)
                engine, back = _figures_of(rows)

                # Two passes, merged. The published pass reaches figures
                # the workbook has no cell for — a CAGR computed on the
                # Outputs tab itself — and the workbook pass reaches
                # everything the tab never published. Neither subsumes the
                # other, and running only one costs seven reconciled
                # figures on the Cascade deck.
                proposed, unlinked = _both_passes(engine, candidates)
                drifts, agreed = compare(proposed)

                totals["reconciled"] += len(proposed)
                totals["agreeing"] += len(agreed)
                totals["drifting"] += len(drifts)
                totals["unlinked"] += len(unlinked)
                for item in unlinked:
                    reasons[_reason(item.reason)] = (
                        reasons.get(_reason(item.reason), 0) + 1
                    )

                for item in proposed:
                    figure_row = back[id(item.figure)]
                    cell_row = candidates.cells.get(item.output.source) or (
                        candidates.cells.get(item.output.ref)
                    )
                    if cell_row is None or (figure_row.id, cell_row.id) in decided:
                        continue
                    links.append(
                        LinkRow(
                            dossier_id=dossier_id,
                            figure_id=figure_row.id,
                            cell_id=cell_row.id,
                            state=LinkState.proposed,
                            confidence=round(item.score, 3),
                            transformation="identity",
                            basis=item.output.basis,
                            cell_name=item.output.name,
                            figure_label=item.figure.label,
                        )
                    )

                for drift in drifts:
                    source = by_ref.get(drift.source)
                    findings.append(
                        FindingRow(
                            dossier_id=dossier_id,
                            check_run_id=run.id,
                            artifact_id=deck.id,
                            kind=FindingKind.drift,
                            severity=FindingSeverity.error,
                            fingerprint=_fingerprint(
                                "drift", deck.lineage_id, drift.location, drift.printed
                            ),
                            page=drift.slide,
                            printed=drift.printed,
                            expected=drift.expected,
                            one_tick=drift.one_tick,
                            title=f"{drift.printed} where the model says {drift.expected}",
                            detail=drift.context,
                            location=drift.location,
                            evidence={
                                "ref": drift.ref,
                                "name": drift.name,
                                "source": drift.source,
                                "basis": drift.basis,
                                "confidence": round(drift.confidence, 3),
                                "model_artifact_id": str(model.id),
                                "chain": render_chain(book, drift.source)
                                if source
                                else "",
                            },
                        )
                    )

        await repository.replace_findings(dossier_id, CheckKind.tieout, findings)
        await repository.replace_proposals(dossier_id, links)

        summary = {
            **totals,
            "confirmed": sum(
                1
                for one in await repository.links_of(dossier_id)
                if one.state is LinkState.confirmed
            ),
            "reasons": [
                {"reason": reason, "count": count}
                for reason, count in sorted(reasons.items(), key=lambda pair: -pair[1])
            ],
        }
        return await repository.finish_run(run, summary=summary)

    async def run_audit(
        self, session: AsyncSession, *, dossier_id: UUID, user_id: UUID | None
    ) -> CheckRun:
        """Check every model in the deal against itself."""
        from .audit import audit as run_rules

        repository = TieOutRepository.from_session(session)
        models = [
            one
            for one in await repository.current_artifacts(dossier_id)
            if one.kind is ArtifactKind.model
        ]
        run = await repository.start_run(
            dossier_id=dossier_id,
            kind=CheckKind.audit,
            artifact_ids=[one.id for one in models],
            requested_by_id=user_id,
        )
        if not models:
            return await repository.finish_run(
                run, error="this deal has no model to audit yet"
            )

        findings: list[FindingRow] = []
        errors = smells = 0
        for model in models:
            cells = await repository.cells_of(model.id)
            book = _workbook_of(cells)
            result = run_rules(book)
            errors += len(result.errors)
            smells += len(result.smells)
            for defect in result.findings:
                findings.append(
                    FindingRow(
                        dossier_id=dossier_id,
                        check_run_id=run.id,
                        artifact_id=model.id,
                        kind=FindingKind.audit,
                        severity=FindingSeverity(defect.severity),
                        fingerprint=_fingerprint(
                            "audit", model.lineage_id, defect.ref, defect.rule
                        ),
                        rule=defect.rule,
                        standard=defect.source,
                        printed=defect.ref,
                        title=f"{defect.rule.replace('-', ' ')} at {defect.ref}",
                        detail=defect.detail,
                        location=defect.ref,
                        evidence={
                            "sheet": defect.sheet,
                            "name": defect.name,
                            "chain": render_chain(book, defect.ref),
                        },
                    )
                )

        await repository.replace_findings(dossier_id, CheckKind.audit, findings)
        return await repository.finish_run(
            run,
            summary={
                "errors": errors,
                "smells": smells,
                "models": len(models),
                "cells": sum(int(one.counts.get("cells", 0)) for one in models),
            },
        )

    # --- reading --------------------------------------------------------

    async def chain_for(
        self, session: AsyncSession, *, artifact_id: UUID, ref: str
    ) -> list[dict[str, Any]]:
        """The steps behind one cell, for the screen that sells the product."""
        repository = TieOutRepository.from_session(session)
        cells = await repository.cells_of(artifact_id)
        book = _workbook_of(cells)
        cell = book.get(ref)
        if cell is None:
            return []

        steps: list[dict[str, Any]] = [
            {
                "kind": "cell",
                "ref": cell.ref,
                "name": cell.name,
                "value": _text(cell.value),
                "formula": cell.formula,
            }
        ]
        for precedent in cell.precedents[:6]:
            source = book.get(precedent)
            if source is None:
                continue
            steps.append(
                {
                    "kind": "input" if source.formula is None else "cell",
                    "ref": source.ref,
                    "name": source.name,
                    "value": _text(source.value),
                    "formula": source.formula,
                    "note": None if source.formula else "typed, not calculated",
                }
            )
        return steps


# --- adapters ------------------------------------------------------------


def _workbook_of(cells: Sequence[CellRow]) -> Workbook:
    """The engine's `Workbook`, rebuilt from stored rows.

    Everything downstream — the audit, the chain, the candidate list —
    takes a `Workbook`, so rebuilding one is what lets a check run without
    the file it came from.
    """
    book = Workbook()
    for row in cells:
        book.cells[row.ref] = EngineCell(
            sheet=row.sheet,
            ref=row.ref,
            row=row.row,
            column=row.column,
            value=row.value,
            formula=row.formula,
            row_label=row.row_label,
            column_label=row.column_label,
            precedents=tuple(row.precedents or ()),
            alias_of=row.alias_of,
        )
    book.sheets = list(dict.fromkeys(row.sheet for row in cells))
    return book


class _Candidates:
    """What a deck figure may be, and the row each candidate came from.

    `outputs_from_workbook` keys each candidate by the cell's own
    reference, so the way back to the stored row is that reference — which
    is what a link has to record, since a link points at a row and not at
    an engine object.
    """

    def __init__(
        self,
        published: list[Output],
        workbook: list[Output],
        cells: dict[str, CellRow],
    ) -> None:
        #: What the model says it publishes. Named by a person, carrying a
        #: stated basis, and preferred wherever both passes fire.
        self.published = published
        #: Every named cell. Wider, and the only pass that works on a model
        #: with no Outputs tab, which is most of them.
        self.workbook = workbook
        self.cells = cells


def _candidates(
    book: Workbook, cells: Sequence[CellRow], published: list[dict[str, Any]]
) -> _Candidates:
    return _Candidates(
        [
            Output(
                ref=row["ref"],
                name=row["name"],
                value=Decimal(row["value"]),
                source=row["source"],
                basis=row["basis"],
            )
            for row in published or []
        ],
        outputs_from_workbook(book),
        {cell.ref: cell for cell in cells},
    )


def _both_passes(
    figures: list[engine_figures.Figure], candidates: _Candidates
) -> tuple[list[Any], list[Any]]:
    """Link against the published figures, then against the workbook.

    The published pass wins where both fire, because a name a human chose
    and a stated basis read better in a finding than `Model!D26`. A figure
    the first pass reconciled is not offered to the second.
    """
    published, _ = (
        propose_links(figures, candidates.published)
        if candidates.published
        else ([], [])
    )
    settled = {id(item.figure) for item in published}
    remaining = [figure for figure in figures if id(figure) not in settled]
    workbook, unlinked = propose_links(remaining, candidates.workbook)
    return published + workbook, unlinked


def _figures_of(
    rows: Sequence[FigureRow],
) -> tuple[list[engine_figures.Figure], dict[int, FigureRow]]:
    """Engine figures, and the way back to the rows that produced them."""
    engine: list[engine_figures.Figure] = []
    back: dict[int, FigureRow] = {}
    for row in rows:
        figure = engine_figures.Figure(
            printed=row.printed,
            value=row.value,
            decimals=row.decimals,
            kind=row.kind,
            slide=row.page,
            label=row.label,
            location=row.location,
            context=row.context,
            section=row.section,
            range_endpoint=row.range_endpoint,
            parenthesised=row.parenthesised,
            subject=row.subject,
        )
        engine.append(figure)
        back[id(figure)] = row
    return engine, back


def _fingerprint(kind: str, lineage: UUID, where: str, what: str) -> str:
    """What survives a re-run.

    Keyed on the *lineage* rather than the artifact, so re-uploading the
    deck does not resurrect a finding somebody dismissed on the version
    before. Keyed on where and what rather than on a row id, because the
    row is new every time.
    """
    raw = f"{kind}|{lineage}|{where}|{what}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _reason(text: str) -> str:
    """Group the linker's reasons so the coverage line stays readable."""
    for prefix in (
        "no output fits the label",
        "two outputs fit equally well",
    ):
        if text.startswith(prefix):
            return prefix
    return text


def _text(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{value.normalize():f}"


tieout = TieOutService()

__all__ = ["TieOutService", "tieout"]
