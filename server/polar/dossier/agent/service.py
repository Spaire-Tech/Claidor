"""Running a task in a matter, and writing down what happened.

The loop is pure enough to test without a database; this is the layer that
loads the matter's documents into a workspace, runs the loop against them,
and records the outcome.

Two things it is careful about.

**The workspace is built from the matter, once.** Every document, readable
or not — the agent needs to know the scans exist so it can say six files
could not be read. Nothing else is loaded, so there is nothing else the
tools can reach.

**A failed run is still written down.** A matter where three of yesterday's
twenty tasks silently never happened is worse than one showing three
failures, and « the provider was down » is a better answer to « why is this
memo missing » than nothing at all.
"""

from typing import cast
from uuid import UUID

import anthropic
import structlog

from polar.config import settings
from polar.models import AgentStep, AgentTask
from polar.postgres import AsyncSession

from ..repository import DossierRepository
from .loop import AGENT_MODEL, Client, MAX_STEPS, Outcome, run
from .tools import Workspace

log = structlog.get_logger()


class AgentNotConfigured(RuntimeError):
    """No API key. Said plainly rather than surfacing as a failed run."""


def build_client() -> Client:
    if not settings.ANTHROPIC_API_KEY:
        raise AgentNotConfigured("No ANTHROPIC_API_KEY configured.")
    # Cast, with the reason stated rather than hidden. `AsyncMessages.create`
    # is a long overloaded signature; the `Client` protocol describes only
    # the five arguments this loop passes, and a protocol narrower than the
    # concrete method is not something mypy can verify structurally. The
    # cast is checked by `TestTheFakeIsNotLying`, which drives the loop with
    # the SDK's own response objects — the part that could actually be
    # wrong, and the part a wider type annotation would have hidden.
    return cast(Client, anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY))


async def load_workspace(
    session: AsyncSession, dossier_id: UUID
) -> Workspace:
    """Every document in the matter, readable or not.

    `list_readable_documents` would be the tempting call and it is the
    wrong one: an agent that cannot see the scans cannot report that they
    exist, so it answers as though the matter were only what it could read.
    The tools mark each document's readability and refuse to read the ones
    that have no text; the agent is told, rather than shielded.
    """
    repository = DossierRepository.from_session(session)
    documents = await repository.list_documents(dossier_id)
    return Workspace(dossier_id=dossier_id, documents=tuple(documents))


async def record(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    user_id: UUID,
    prompt: str,
    outcome: Outcome,
) -> AgentTask:
    """Persist the task and every step it took."""
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
        "dossier.agent.recorded",
        task_id=str(task.id),
        stopped=outcome.stopped,
        steps=len(outcome.steps),
    )
    return task


async def run_task(
    session: AsyncSession,
    *,
    dossier_id: UUID,
    user_id: UUID,
    prompt: str,
    client: Client | None = None,
    model: str = AGENT_MODEL,
    max_steps: int = MAX_STEPS,
) -> tuple[AgentTask, Outcome]:
    """Work the prompt against the matter and write down what happened.

    `client` is injectable for the same reason it is in the loop: a test
    should be able to drive this without a network, and the persistence is
    exactly the part a fake cannot cover from the loop's own tests.
    """
    workspace = await load_workspace(session, dossier_id)
    outcome = await run(
        client or build_client(),
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
    "AgentNotConfigured",
    "build_client",
    "load_workspace",
    "record",
    "run_task",
]
