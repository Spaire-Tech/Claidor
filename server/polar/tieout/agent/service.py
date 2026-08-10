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

from typing import Any
from uuid import UUID

import structlog

from polar.agent import AGENT_MODEL, MAX_STEPS, Client, Outcome, run
from polar.models import AgentStep, AgentTask
from polar.postgres import AsyncSession

from ..repository import TieOutRepository
from ..service import tieout
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
                    "value": None if cell.value is None else f"{cell.value.normalize():f}",
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


__all__ = ["ask", "load_workspace", "record"]
