"""Loading a deal into a workspace, running the agent, writing it down.

The loop is pure enough to test without a database. This is the layer that
turns one deal into the fixed set of facts its tools may reach, runs the
loop against them, and records what happened.

**The workspace is loaded once, before the loop starts.** Every tool is
synchronous on purpose: the loop runs them in order and times each one, and
a tool that went to the database mid-run would make those timings a
measurement of the network. So everything the agent can reach — the files,
the findings, their chains, the model's named cells — is fetched here.

That has a cost and it is the right one. The alternative is an agent that
can issue queries, which is an agent that can reach outside the deal it was
asked about.

**A failed run is still written down.** « The provider was down » is a
better answer to « why did nothing happen » than silence.
"""

from functools import partial
from typing import Any
from uuid import UUID

import structlog

from polar.agent import AGENT_MODEL, MAX_STEPS, Client, Outcome, run
from polar.models import AgentStep, AgentTask
from polar.postgres import AsyncSession

from ..repository import TieOutRepository
from ..service import tieout
from .model_tools import ModelWorkspace
from .tools import TOOLSET, Workspace

log = structlog.get_logger()

#: Named cells handed to the agent, so `find_cell` can search offline. A
#: model runs to a few hundred named cells; the whole Cascade workbook is
#: 313. Past this the search is worth a round trip, and the cap is here so
#: one enormous workbook cannot make every question slow.
MAX_CELLS_LOADED = 2_000


async def load_workspace(
    session: AsyncSession, dossier_id: UUID, name: str = "this deal"
) -> Workspace:
    """One deal, as the fixed set of facts its agent may reach.

    The name is passed in rather than looked up: every caller has already
    resolved the deal to check the caller is on it, and resolving it twice
    is a second query for a string.
    """
    repository = TieOutRepository.from_session(session)
    artifacts = await repository.current_artifacts(dossier_id)
    findings = await repository.findings_of(dossier_id)

    #: The chain rides on the finding rather than being a seventh tool.
    #: « Where does that come from » is the question this product exists
    #: for, and making the agent spend a step to get an answer it will
    #: almost always want is a step it could run out of.
    enriched = []
    for one in findings:
        chain = await tieout.chain_of_finding(session, finding=one)
        evidence = dict(one.evidence or {})
        evidence["chain"] = chain.get("steps", [])
        one.evidence = evidence
        enriched.append(one)

    cells: list[dict[str, Any]] = []
    for artifact in artifacts:
        if artifact.kind != "model":
            continue
        for cell in await repository.cells_of(artifact.id):
            if not cell.name or len(cells) >= MAX_CELLS_LOADED:
                continue
            cells.append(
                {
                    "ref": cell.ref,
                    "name": cell.name,
                    "value": None
                    if cell.value is None
                    else f"{cell.value.normalize():f}",
                    "formula": cell.formula,
                }
            )

    coverage = await tieout.coverage_of(session, dossier_id=dossier_id)
    coverage = {**coverage, "cells": cells}

    return Workspace(
        dossier_id=dossier_id,
        name=name,
        artifacts=tuple(artifacts),
        findings=tuple(enriched),
        coverage=coverage,
    )


async def record(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    user_id: UUID,
    prompt: str,
    outcome: Outcome,
) -> AgentTask:
    """Persist the question and every step the answer took."""
    task = AgentTask(
        dossier_id=dossier_id,
        created_by_id=user_id,
        prompt=prompt,
        answer=outcome.answer,
        stopped=outcome.stopped,
        error=outcome.error,
        input_tokens=outcome.input_tokens,
        output_tokens=outcome.output_tokens,
    )
    session.add(task)
    await session.flush()

    for step in outcome.steps:
        session.add(
            AgentStep(
                task_id=task.id,
                ordinal=step.ordinal,
                tool=step.tool,
                arguments=step.arguments,
                ok=step.ok,
                summary=step.summary,
                milliseconds=step.milliseconds,
            )
        )
    await session.flush()

    log.info(
        "tieout.agent.recorded",
        task_id=str(task.id),
        stopped=outcome.stopped,
        steps=len(outcome.steps),
    )
    return task


async def ask(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    user_id: UUID,
    prompt: str,
    client: Client,
    name: str = "this deal",
    model: str = AGENT_MODEL,
    max_steps: int = MAX_STEPS,
) -> tuple[AgentTask, Outcome]:
    """Answer one question about one deal, and write down how."""
    workspace = await load_workspace(session, dossier_id, name)
    outcome = await run(
        client,
        TOOLSET,
        workspace,
        prompt,
        model=model,
        max_steps=max_steps,
    )
    task = await record(
        session,
        dossier_id=dossier_id,
        user_id=user_id,
        prompt=prompt,
        outcome=outcome,
    )
    return task, outcome


async def load_model_workspace(
    session: AsyncSession, dossier_id: UUID, name: str = "this model"
) -> "ModelWorkspace | None":
    """One model as the assistant's whole world: the rebuilt workbook
    with its exact precedent graph, the time axes, the versions and the
    diff to the version before. None when the deal holds no model yet.
    """
    from ..service import _workbook_of, delta_between, models_of
    from ..structure import period_axes
    from .model_tools import build_workspace

    repository = TieOutRepository.from_session(session)
    artifacts = await repository.current_artifacts(dossier_id)
    #: The subject model, and the ones this answer will not be about.
    #: Taking `next(...)` off an unordered list read the deal's newest
    #: model most of the time and another one silently the rest — a
    #: paragraph of confident prose about the wrong workbook.
    models = models_of(artifacts)
    if not models:
        return None
    model_artifact = models[0]
    others = [f"{one.filename} (v{one.version})" for one in models[1:]]

    #: The light read: the assistant only ever rebuilds the workbook
    #: from these, and the ORM read was most of the wait before the loop
    #: could start on a real model — 28.4 seconds down to 9.0.
    cells = await repository.cells_for_graph(model_artifact.id)
    book = _workbook_of(cells)
    book.hidden_sheets = tuple(model_artifact.counts.get("hidden_sheets", []))
    book.very_hidden_sheets = tuple(model_artifact.counts.get("very_hidden_sheets", []))
    order = model_artifact.counts.get("sheet_order")
    if order:
        book.sheets = list(order)

    version_rows = [
        one
        for one in await repository.list_artifacts(dossier_id)
        if one.lineage_id == model_artifact.lineage_id
    ]
    version_rows.sort(key=lambda one: one.version, reverse=True)
    versions_list = [
        {
            "version": one.version,
            "by": None,
            "when": one.created_at.strftime("%d %B %H:%M") if one.created_at else "",
        }
        for one in version_rows
    ]
    diff = await tieout.model_diff(
        session, dossier_id=dossier_id, artifact_id=model_artifact.id
    )

    #: The Watch's reading of the revision, as a callable rather than a
    #: report. The sides are resolved here, where the session is; the
    #: two file reads happen only if the `versions` tool is reached, so
    #: a question about anything else does not pay for them.
    sides = await tieout.delta_sides(
        session, dossier_id=dossier_id, artifact_id=model_artifact.id
    )
    delta: Any = None
    if sides is not None:
        old_side, new_side = sides
        delta = partial(delta_between, old_side, new_side)

    sources_map, sources_read = await _sources_of(
        session, dossier_id=dossier_id, model_artifact_id=model_artifact.id
    )

    return build_workspace(
        dossier_id=dossier_id,
        name=name,
        filename=model_artifact.filename,
        version=model_artifact.version,
        book=book,
        axes=period_axes(book),
        versions_list=versions_list,
        diff=diff,
        sources_map=sources_map,
        sources_read=sources_read,
        delta=delta,
        counts=dict(model_artifact.counts or {}),
        others=others,
    )


async def _sources_of(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    model_artifact_id: UUID,
) -> tuple[dict[str, dict[str, Any]], int]:
    """Every typed input in this model that a source read matched, by ref.

    The chain endpoint answers this one cell at a time
    (`service._grounding`). The assistant's tools are synchronous and
    its workspace is loaded once, so the whole map is built here — and
    it is small: a link exists only where a document figure matched a
    cell, which is tens of rows, not thousands.

    The ranking is the endpoint's, deliberately: a **confirmed** link
    outranks a proposal, because from the moment somebody vouches for
    it the last hop is a fact rather than a guess. A rejected link is
    not an answer at all and never appears here.
    """
    from polar.models import ArtifactKind, LinkState

    repository = TieOutRepository.from_session(session)
    documents = {
        one.id: one
        for one in await repository.list_artifacts(dossier_id)
        if one.kind is ArtifactKind.source
    }
    if not documents:
        return {}, 0

    links = [
        one
        for one in await repository.links_of(dossier_id)
        if one.state in (LinkState.confirmed, LinkState.proposed)
    ]
    if not links:
        return {}, len(documents)

    figures = await repository.figures_by_id([one.figure_id for one in links])
    cells = await repository.cells_by_id([one.cell_id for one in links])

    ranked: dict[str, tuple[int, float, dict[str, Any]]] = {}
    for link in links:
        figure = figures.get(link.figure_id)
        cell = cells.get(link.cell_id)
        if figure is None or cell is None or cell.artifact_id != model_artifact_id:
            continue
        document = documents.get(figure.artifact_id)
        if document is None:
            continue
        confirmed = link.state is LinkState.confirmed
        rank = (1 if confirmed else 0, float(link.confidence or 0))
        held = ranked.get(cell.ref)
        if held is not None and held[:2] >= rank:
            continue
        ranked[cell.ref] = (
            *rank,
            {
                "document": document.filename,
                "location": figure.location,
                "label": f"{document.filename} · {figure.location}",
                "printed": figure.printed,
                #: The sentence as printed on the page, never the label
                #: the matcher normalised it to — showing a reader a
                #: year this product invented, on the one answer whose
                #: job is to say where a number came from, would be the
                #: wrong place to be clever.
                "context": figure.context or figure.label,
                "state": "confirmed" if confirmed else "proposed",
                "note": (
                    "confirmed by someone on this deal"
                    if confirmed
                    else "proposed — nobody has confirmed this yet"
                ),
            },
        )
    return {ref: held[2] for ref, held in ranked.items()}, len(documents)


async def ask_model(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    user_id: UUID,
    prompt: str,
    client: Client,
    name: str = "this model",
    model: str = AGENT_MODEL,
    max_steps: int = MAX_STEPS,
) -> tuple[AgentTask, Outcome]:
    """Answer one question about one model — the assistant's loop."""
    from .model_tools import MODEL_TOOLSET

    workspace = await load_model_workspace(session, dossier_id, name)
    if workspace is None:
        raise ValueError("this deal holds no model to ask about")
    outcome = await run(
        client,
        MODEL_TOOLSET,
        workspace,
        prompt,
        model=model,
        max_steps=max_steps,
    )
    task = await record(
        session,
        dossier_id=dossier_id,
        user_id=user_id,
        prompt=prompt,
        outcome=outcome,
    )
    return task, outcome


__all__ = [
    "ask",
    "ask_model",
    "load_model_workspace",
    "load_workspace",
    "record",
]
