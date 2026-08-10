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

from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.models import (
    Artifact,
    ArtifactKind,
    ArtifactStatus,
    CheckKind,
    CheckRun,
    CheckStatus,
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
from .link import rank as rank_outputs
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
            missing = "model" if not models else "deck"
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

    async def coverage_of(
        self, session: AsyncSession | AsyncReadSession, *, dossier_id: UUID
    ) -> dict[str, Any]:
        """The coverage line, from the last tie-out that finished.

        Read off the stored run rather than recomputed, so the number on
        the screen is the number the check produced. A deal that has never
        been checked reports zeroes, which is honest: nothing has been
        looked at.
        """
        repository = TieOutRepository.from_session(session)
        run = await repository.latest_run(dossier_id, CheckKind.tieout)
        summary = dict(run.summary) if run and run.status is CheckStatus.done else {}
        return {
            "reconciled": int(summary.get("reconciled", 0)),
            "agreeing": int(summary.get("agreeing", 0)),
            "drifting": int(summary.get("drifting", 0)),
            "unlinked": int(summary.get("unlinked", 0)),
            "confirmed": int(summary.get("confirmed", 0)),
            "reasons": list(summary.get("reasons", [])),
        }

    async def figure_map(
        self,
        session: AsyncSession | AsyncReadSession,
        *,
        dossier_id: UUID,
        artifact_id: UUID,
    ) -> list[tuple[int, list[dict[str, Any]]]]:
        """Every figure in a deck, slide by slide, and what became of it.

        The unlinked ones are the point. They are what the tool did *not*
        check, and the reason each one gives is the difference between an
        honest screen and an impressive one.

        The states come from re-running the same two passes the check runs,
        over the same rows, rather than from reading the stored links. Two
        reasons, and the second is the one that bit:

        1. The reason a figure was skipped is a property of *that check*
           against *that model*, so it is not on the figure's row.
        2. Not every reconciled figure has a link row. A figure the
           Outputs tab publishes but the workbook has no cell for — a CAGR
           computed on the tab itself — is checked and agrees, and there is
           no cell to point a link at. Reading state off the links alone
           called seven such figures « unlinked », which is the exact lie
           this screen exists to prevent.
        """
        repository = TieOutRepository.from_session(session)
        rows = await repository.figures_of(artifact_id)
        engine, back = _figures_of(rows)

        models = [
            one
            for one in await repository.current_artifacts(dossier_id)
            if one.kind is ArtifactKind.model
        ]
        reasons: dict[UUID, str] = {}
        states: dict[UUID, str] = {}
        if models:
            model = models[0]
            cells = await repository.cells_of(model.id)
            candidates = _candidates(_workbook_of(cells), cells, model.outputs)
            proposed, unlinked = _both_passes(engine, candidates)
            _, agreed = compare(proposed)
            for item in agreed:
                states[back[id(item.figure)].id] = "agreeing"
            # A `Drift` carries the slide and the location but not the
            # figure it came from, so drifting is « proposed and not
            # agreed » rather than a second lookup.
            for item in proposed:
                states.setdefault(back[id(item.figure)].id, "drifting")
            for item in unlinked:
                identifier = back[id(item.figure)].id
                states[identifier] = "unlinked"
                reasons[identifier] = item.reason

        links = {
            link.figure_id: link
            for link in await repository.links_of(dossier_id)
            if link.state is not LinkState.rejected
        }

        pages: dict[int, list[dict[str, Any]]] = {}
        for row in rows:
            link = links.get(row.id)
            state = states.get(row.id, "unlinked")
            # A person's decision outranks a score, in both directions.
            if link is not None and link.state is LinkState.confirmed:
                state = "confirmed"
            reason = reasons.get(row.id)
            if state == "unlinked" and reason is None:
                reason = "no model in this deal yet"
            pages.setdefault(row.page, []).append(
                {
                    "id": row.id,
                    "printed": row.printed,
                    "label": row.label,
                    "location": row.location,
                    "state": state,
                    "link_id": link.id if link else None,
                    "reason": reason if state == "unlinked" else None,
                }
            )
        return sorted(pages.items())

    async def alternatives_for(
        self,
        session: AsyncSession | AsyncReadSession,
        *,
        dossier_id: UUID,
        figure_id: UUID,
    ) -> list[dict[str, Any]]:
        """What else this figure could be, best first.

        « Or did you mean this one » — the third action on the confirmation
        queue, and the only one that turns a wrong guess into a right fact
        rather than throwing it away.
        """
        repository = TieOutRepository.from_session(session)
        figure_row = await repository.get_figure(figure_id)
        if figure_row is None:
            return []
        engine, _ = _figures_of([figure_row])

        models = [
            one
            for one in await repository.current_artifacts(dossier_id)
            if one.kind is ArtifactKind.model
        ]
        if not models:
            return []
        model = models[0]
        cells = await repository.cells_of(model.id)
        candidates = _candidates(_workbook_of(cells), cells, model.outputs)

        pool = candidates.published + candidates.workbook
        ranked = rank_outputs(engine[0], pool, limit=6)
        seen: set[str] = set()
        out: list[dict[str, Any]] = []
        for output, score in ranked:
            if output.source in seen:
                continue
            seen.add(output.source)
            cell = candidates.cells.get(output.source) or candidates.cells.get(
                output.ref
            )
            out.append(
                {
                    "cell_id": cell.id if cell else None,
                    "ref": output.source or output.ref,
                    "name": output.name,
                    "value": _text(output.value),
                    "confidence": round(score, 3),
                }
            )
        return out

    async def model_diff(
        self,
        session: AsyncSession | AsyncReadSession,
        *,
        dossier_id: UUID,
        artifact_id: UUID,
    ) -> dict[str, Any] | None:
        """What moved since the version before, and what went stale with it.

        The realistic failure is not one typo. It is a model revision the
        deck never caught up with, which is why the count that matters on
        this screen is not « cells changed » but « deck figures now wrong
        because of it ».
        """
        repository = TieOutRepository.from_session(session)
        current = await repository.get_artifact(artifact_id)
        if current is None:
            return None
        previous = await repository.previous_version(current)
        if previous is None:
            return None

        now = {cell.ref: cell for cell in await repository.cells_of(current.id)}
        was = {cell.ref: cell for cell in await repository.cells_of(previous.id)}
        links = await repository.links_of(dossier_id)
        stale: dict[str, int] = {}
        by_id = {cell.id: cell for cell in was.values()}
        for link in links:
            cell = by_id.get(link.cell_id)
            if cell is not None:
                stale[cell.ref] = stale.get(cell.ref, 0) + 1

        changed: list[dict[str, Any]] = []
        for ref, cell in now.items():
            before = was.get(ref)
            if before is None or before.value == cell.value:
                continue
            changed.append(
                {
                    "ref": ref,
                    "name": cell.name or cell.row_label,
                    "was": _text(before.value),
                    "now": _text(cell.value),
                    "stale_figures": stale.get(ref, 0),
                }
            )
        changed.sort(key=lambda one: -one["stale_figures"])
        return {
            "artifact_id": current.id,
            "from_version": previous.version,
            "to_version": current.version,
            "changed": changed,
            "added": len(set(now) - set(was)),
            "removed": len(set(was) - set(now)),
        }

    async def chain_of_finding(
        self, session: AsyncSession | AsyncReadSession, *, finding: FindingRow
    ) -> dict[str, Any]:
        """The whole path behind one finding, as steps a screen can render."""
        repository = TieOutRepository.from_session(session)
        evidence = finding.evidence or {}
        steps: list[dict[str, Any]] = []

        if finding.kind is FindingKind.drift:
            steps.append(
                {
                    "kind": "figure",
                    "label": finding.location,
                    "name": finding.detail,
                    "printed": finding.printed,
                }
            )

        model_id = evidence.get("model_artifact_id") or (
            str(finding.artifact_id) if finding.kind is FindingKind.audit else None
        )
        ref = evidence.get("source") or evidence.get("ref") or finding.location
        if model_id and ref:
            cells = await repository.cells_of(UUID(str(model_id)))
            book = _workbook_of(cells)
            steps.extend(_steps_from(book, str(ref), evidence.get("basis")))

        return {
            "finding_id": finding.id,
            "steps": steps,
            "summary": str(evidence.get("chain") or finding.detail or ""),
        }

    async def chain_for(
        self, session: AsyncSession | AsyncReadSession, *, artifact_id: UUID, ref: str
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


def _steps_from(
    book: Workbook, ref: str, basis: str | None, depth: int = 3
) -> list[dict[str, Any]]:
    """Walk back from a cell to the typed inputs behind it.

    Stops at the first cell with no formula, because that is the edge of
    the model: a number somebody typed, and the beginning of the next
    question — *where did that come from*. Later the answer is a page in a
    PDF, which is why a step carries a `kind` rather than always being a
    cell.
    """
    steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: str | None = ref

    while current and current not in seen and len(steps) < depth:
        seen.add(current)
        cell = book.get(current)
        if cell is None:
            steps.append({"kind": "cell", "ref": current, "name": "", "value": None})
            break

        inputs = []
        for precedent in cell.precedents[:6]:
            source = book.get(precedent)
            if source is None:
                continue
            inputs.append(
                {
                    "ref": source.ref,
                    "name": source.name or source.row_label,
                    "value": _text(source.value),
                }
            )
        steps.append(
            {
                "kind": "cell" if cell.formula else "input",
                "ref": cell.ref,
                "name": cell.name or cell.row_label,
                "value": _text(cell.value),
                "formula": cell.formula,
                "basis": basis if len(steps) == 0 else None,
                "note": None if cell.formula else "typed, not calculated",
                "inputs": inputs,
            }
        )
        if not cell.formula:
            break
        # Follow the precedent that is itself calculated; a chain that
        # walks into a constant has already ended.
        current = next(
            (
                one
                for one in cell.precedents
                if (nxt := book.get(one)) is not None and nxt.formula
            ),
            None,
        )
    return steps


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
