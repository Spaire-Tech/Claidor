"""The person's own computer doing a cloud agent's coding work (11 November
2026, as the upstream app's, at the founder's word).

The upstream app's cloud agents ran in its maker's virtual machines: the
machine cloned the repository, made a branch, coded and opened the pull
request, and the app read the branch, the pull request and the changes back
through `CloudAgentService`. Simeon's run on the person's own computer, in
Claude Code on their own Claude plan (`host/cloud-agents/coding-runner.ts`).
`CloudAgentService` stays the app's surface (`cloud_agents.py`); these are
the computer's side of it, the cloud runner's four verbs
(`simeon.maty.endpoints`) for one person's computer:

```
POST /desktop/api/cloud-agents/computer/claim             {runner}
  → {"job": null} | {"job": {id, bcId, name, repoUrl, baseBranch, modelId,
                             conversation, work, attempts}}
POST /desktop/api/cloud-agents/computer/jobs/{id}/heartbeat {runner, work?}
  → {id, status, cancelRequested}
POST /desktop/api/cloud-agents/computer/jobs/{id}/complete  {runner, result,
                                                             messages?, work?}
POST /desktop/api/cloud-agents/computer/jobs/{id}/fail      {runner, reason,
                                                             retryable, work?}
```

`work` is what the computer found of the work so far (the branch, the pull
request, the changes, Claude Code's session); it is merged into the agent's
`SandCloudAgent.work`, which `GetBackgroundComposerInfo` reads. A fail with
`work.limitedUntilMs` is the person's Claude plan out of usage: the run
stops and the app shows it paused until then.

Only the person's own credential reaches these (a signed-in app or their
computer's own, never a cloud job's), and only that person's computer jobs:
a job that is somebody else's, or the cloud runner's, is 404. Nothing of
the code, the prompt or the conversation goes to the log.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.desktop.auth import get_desktop_or_box_session
from simeon.desktop.service import DesktopUnauthenticated
from simeon.maty.endpoints import REASON_MAX_LENGTH, RESULT_MAX_LENGTH, TurnMessage
from simeon.maty.service import MatyJobNotFound, maty
from simeon.models import DesktopSession, MatyJob, SandCloudAgent
from simeon.models.maty import COMPUTER_EXECUTOR
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .cloud_agents_repository import CloudAgentJobRepository, SandCloudAgentRepository
from .cloud_agents_service import PR_STATUS, cloud_agents

log = logging.getLogger(__name__)

# Mounted under the desktop router (`/desktop`), like the chats' copy.
router = APIRouter(prefix="/api/cloud-agents/computer", include_in_schema=False)

#: The most files of one piece of work the agent's card lists
#: (`MAX_CLOUD_AGENT_FILES` in `cloud-agents-service.ts`).
FILES_KEPT = 300
#: A path, a branch, an address: far above anything honest.
WORD_MAX_LENGTH = 2_000


class ComputerFile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    path: str = Field(min_length=1, max_length=4_096)
    added: int = Field(default=0, ge=0)
    removed: int = Field(default=0, ge=0)


class ComputerWork(BaseModel):
    """What the computer found of the work. Every field is optional: one
    left out keeps what was there."""

    model_config = ConfigDict(extra="ignore")
    branchName: str | None = Field(default=None, max_length=WORD_MAX_LENGTH)
    baseBranch: str | None = Field(default=None, max_length=WORD_MAX_LENGTH)
    prUrl: str | None = Field(default=None, max_length=WORD_MAX_LENGTH)
    prNumber: int | None = Field(default=None, ge=0)
    prState: str | None = Field(default=None, max_length=16)
    linesAdded: int | None = Field(default=None, ge=0)
    linesRemoved: int | None = Field(default=None, ge=0)
    filesChanged: int | None = Field(default=None, ge=0)
    commitCount: int | None = Field(default=None, ge=0)
    files: list[ComputerFile] | None = None
    #: Claude Code's session, resumed by the agent's next turn.
    sessionId: str | None = Field(default=None, max_length=64)
    #: When the person's Claude plan lets the work go on; 0 clears it.
    limitedUntilMs: int | None = Field(default=None, ge=0)


class ComputerBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    #: The name the claim took its lease under (a label, not a credential).
    runner: str = Field(min_length=1, max_length=128)
    work: ComputerWork | None = None


class CompleteBody(ComputerBody):
    result: str = Field(default="", max_length=RESULT_MAX_LENGTH)
    messages: list[TurnMessage] | None = None


class FailBody(ComputerBody):
    reason: str = Field(min_length=1, max_length=REASON_MAX_LENGTH)
    retryable: bool = False


async def _computer_session(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> DesktopSession:
    """The person's own credential: a signed-in app or their computer's,
    never a cloud job's, which speaks for one routine and nothing more."""
    if desktop_session.is_job_token:
        raise DesktopUnauthenticated("A cloud job's credential can't take coding work.")
    return desktop_session


def merged_work(kept: dict[str, Any], work: ComputerWork | None) -> dict[str, Any]:
    """The agent's work with what the computer just said written over it."""
    merged = dict(kept or {})
    if work is None:
        return merged
    for key, value in work.model_dump(exclude_none=True, exclude={"files"}).items():
        if key == "prState" and value not in PR_STATUS:
            continue
        if key == "limitedUntilMs" and value == 0:
            merged.pop(key, None)
            continue
        merged[key] = value
    if work.files is not None:
        merged["files"] = [file.model_dump() for file in work.files[:FILES_KEPT]]
    return merged


async def _job_and_agent(
    session: AsyncSession, desktop_session: DesktopSession, job_id: UUID
) -> tuple[MatyJob, SandCloudAgent]:
    """This person's computer job and the agent it is a turn of, or 404."""
    job = await CloudAgentJobRepository.from_session(session).get_by_id(job_id)
    if (
        job is None
        or job.user_id != desktop_session.user_id
        or job.executor != COMPUTER_EXECUTOR
    ):
        raise MatyJobNotFound(job_id)
    agent = await SandCloudAgentRepository.from_session(session).get_by_job_id(job.id)
    if agent is None:
        raise MatyJobNotFound(job_id)
    return job, agent


def _write_work(
    session: AsyncSession, agent: SandCloudAgent, work: ComputerWork | None
) -> None:
    if work is None:
        return
    agent.work = merged_work(agent.work, work)
    session.add(agent)


def _state(job: MatyJob) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "status": job.status.value,
        "cancelRequested": job.cancel_requested,
    }


@router.post("/claim", name="desktop:cloud_agents_computer_claim")
async def claim(
    body: ComputerBody,
    desktop_session: DesktopSession = Depends(_computer_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The person's next coding job, under a lease, or `{"job": null}`."""
    job = await maty.claim_for_computer(
        session, desktop_session.user, runner=body.runner
    )
    if job is None:
        return JSONResponse({"job": None})
    agent = await SandCloudAgentRepository.from_session(session).get_by_job_id(job.id)
    if agent is None:
        # A job no agent points at any more (deleted): nothing to do it for.
        await maty.fail(
            session,
            job.id,
            runner=body.runner,
            reason="The cloud agent was deleted.",
            retryable=False,
        )
        return JSONResponse({"job": None})
    # A new turn starts afresh: the limit that stopped the last is past.
    if "limitedUntilMs" in (agent.work or {}):
        agent.work = {k: v for k, v in agent.work.items() if k != "limitedUntilMs"}
        session.add(agent)
    log.info(
        "[simeon] cloud-agent computer claimed bcId=%s job=%s attempt=%d",
        agent.bc_id,
        job.id,
        job.attempts,
    )
    return JSONResponse(
        {
            "job": {
                "id": str(job.id),
                "bcId": agent.bc_id,
                "name": agent.name,
                "repoUrl": agent.repo_url,
                "baseBranch": agent.base_branch,
                "modelId": agent.model_id,
                "conversation": job.conversation or [],
                "work": agent.work or {},
                "attempts": job.attempts,
            }
        }
    )


@router.post("/jobs/{id}/heartbeat", name="desktop:cloud_agents_computer_heartbeat")
async def heartbeat(
    id: UUID,
    body: ComputerBody,
    desktop_session: DesktopSession = Depends(_computer_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The work goes on: the lease moves out, what the computer found so far
    is kept, and whether the person asked it to stop comes back."""
    job, agent = await _job_and_agent(session, desktop_session, id)
    job = await maty.heartbeat(session, job.id, runner=body.runner)
    _write_work(session, agent, body.work)
    return JSONResponse(_state(job))


@router.post("/jobs/{id}/complete", name="desktop:cloud_agents_computer_complete")
async def complete(
    id: UUID,
    body: CompleteBody,
    desktop_session: DesktopSession = Depends(_computer_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The turn's answer, and the branch, pull request and changes it left."""
    job, agent = await _job_and_agent(session, desktop_session, id)
    _write_work(session, agent, body.work)
    job = await maty.complete(
        session,
        job.id,
        runner=body.runner,
        result=body.result,
        messages=(
            None
            if body.messages is None
            else [message.model_dump() for message in body.messages]
        ),
    )
    await cloud_agents.on_job_settled(session, job)
    work = agent.work or {}
    log.info(
        "[simeon] cloud-agent computer done bcId=%s job=%s branch=%s pr=%s files=%s",
        agent.bc_id,
        job.id,
        work.get("branchName") or "-",
        work.get("prUrl") or "-",
        work.get("filesChanged") or 0,
    )
    return JSONResponse(_state(job))


@router.post("/jobs/{id}/fail", name="desktop:cloud_agents_computer_fail")
async def fail(
    id: UUID,
    body: FailBody,
    desktop_session: DesktopSession = Depends(_computer_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """A turn that did not work: tried again when it may help and tries are
    left, else the run stops with the reason, which the agent is told."""
    job, agent = await _job_and_agent(session, desktop_session, id)
    _write_work(session, agent, body.work)
    job = await maty.fail(
        session,
        job.id,
        runner=body.runner,
        reason=body.reason,
        retryable=body.retryable,
    )
    await cloud_agents.on_job_settled(session, job)
    log.info(
        "[simeon] cloud-agent computer failed bcId=%s job=%s status=%s limited=%s retryable=%s",
        agent.bc_id,
        job.id,
        job.status.value,
        "limitedUntilMs" in (agent.work or {}),
        body.retryable,
    )
    return JSONResponse(_state(job))


__all__ = ["merged_work", "router"]
