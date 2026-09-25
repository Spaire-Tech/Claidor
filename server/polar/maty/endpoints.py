"""The queue the cloud runner takes from.

Four verbs, exactly as `docs/maties/cloud.md` section 4 spells them, and
nothing else lives at `/maty/runner`:

```
POST /maty/runner/claim                 { "runner": "<name>" }
  → { "job": null }                                 nothing to do
  → { "job": { "id", "kind", "prompt", "deliver", "allow" },
      "access_token": "…", "expires_at": "…" }

POST /maty/runner/jobs/{id}/heartbeat   { "runner": "<name>" }
POST /maty/runner/jobs/{id}/complete    { "runner": "<name>", "result": "…",
                                          "usage": {…} }
POST /maty/runner/jobs/{id}/fail        { "runner": "<name>", "reason": "…",
                                          "retryable": true }
```

The whole router is behind `CLAIDOR_MATY_RUNNER_TOKEN`
(`polar.maty.auth`); no person's token opens any of it. The `runner`
field in each body is the name the claim took its lease under — it is
how Claidor knows the caller is reporting on work it actually holds, and
it is a label, not a credential. Refusals are real HTTP failures with a
reason, like the memory routes and unlike the older desktop ones: 404
for a job that does not exist, 409 for a job the caller does not hold.

The access token a claim returns is the person's, for the life of the
lease, and the runner uses it for two things and no others: the shared
memory at `/desktop/api/memory/sync` and the metered model proxy at
`/desktop/api/proxy/v1/messages`. Why it is shaped the way it is:
`polar.maty.service.MatyService.claim`.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field

from polar.models import MatyJob
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .auth import authenticate_runner
from .service import maty
from .tokens import RUNNER_PATH_PREFIX

router = APIRouter(
    prefix=RUNNER_PATH_PREFIX,
    tags=["maty", APITag.private],
    dependencies=[Depends(authenticate_runner)],
)

#: A refusal and a result are both text the runner hands back. The caps
#: are far above anything honest and well below anything that would hurt.
RESULT_MAX_LENGTH = 1_000_000
REASON_MAX_LENGTH = 4_000


# --- what the runner sends -------------------------------------------------


class RunnerBody(BaseModel):
    """Every call names the runner making it."""

    model_config = ConfigDict(extra="ignore")
    runner: str = Field(min_length=1, max_length=128)


class TurnMessage(BaseModel):
    """One message the run produced, for a job that carries a
    conversation (a cloud agent's turn). `role` is `assistant` unless the
    runner says otherwise."""

    model_config = ConfigDict(extra="ignore")
    role: str = "assistant"
    text: str = Field(default="", max_length=RESULT_MAX_LENGTH)


class TurnArtifact(BaseModel):
    """A file the executor left behind, by its path in the run's
    workspace. Today's runner reports none (`runner/README.md`)."""

    model_config = ConfigDict(extra="ignore")
    path: str = Field(min_length=1, max_length=4_096)
    sizeBytes: int = Field(default=0, ge=0)
    updatedAtMs: int = Field(default=0, ge=0)


class CompleteBody(RunnerBody):
    result: str = Field(default="", max_length=RESULT_MAX_LENGTH)
    #: What the run spent, as the runner saw it. The money already moved
    #: through the metered proxy on the person's own account; this is the
    #: record, not the ledger.
    usage: dict[str, Any] | None = None
    #: The turn's replies, appended to the job's conversation
    #: (25 September 2026, cloud agents). Omitted by a runner that
    #: predates them: `result` alone is still a complete answer.
    messages: list[TurnMessage] | None = None
    #: Files the executor reported. Omitted today.
    artifacts: list[TurnArtifact] | None = None


class FailBody(RunnerBody):
    reason: str = Field(min_length=1, max_length=REASON_MAX_LENGTH)
    #: True when another try might work. Even then the job stops after
    #: `CLAIDOR_MATY_JOB_MAX_ATTEMPTS` tries.
    retryable: bool = False


# --- what Claidor answers --------------------------------------------------


class ClaimedJobBody(BaseModel):
    """A job as the runner needs it: whose it is, what to do, where the
    answer goes, and what it may touch."""

    id: UUID
    kind: str
    prompt: str
    deliver: dict[str, Any]
    allow: dict[str, Any]
    #: Which executor runs it. `maty-runner` is the only one that exists:
    #: the Render container that reads a file and calls a model
    #: (`runner/src/executor.ts`). The box executor of
    #: `docs/product/box-substrate-read.md` gets its own name here when it
    #: lands; nothing about the queue changes for it.
    executor: str = "maty-runner"
    #: The conversation this job continues (a cloud agent's turn), the
    #: person's messages first; None for a routine or a mail.
    conversation: list[dict[str, Any]] | None = None


class ClaimResponse(BaseModel):
    """`{"job": null}` when there is nothing to do, and the job with its
    credential when there is. The route serialises only the fields that
    were set, so « nothing to do » is the two words cloud.md writes and
    not a shape padded out with nulls."""

    job: ClaimedJobBody | None = None
    #: The person's credential, good until `expires_at` and no longer.
    access_token: str | None = None
    expires_at: datetime | None = None


class JobStateResponse(BaseModel):
    """Where the job stands after the call."""

    id: UUID
    status: str
    attempts: int
    scheduled_at: datetime
    lease_expires_at: datetime | None = None
    #: True once the person asked this job to stop (25 September 2026).
    #: The runner reads it off every heartbeat and fails the job as
    #: cancelled; a runner that predates the field ignores it and the job
    #: lands or times out as before.
    cancel_requested: bool = False


def _state(job: MatyJob) -> JobStateResponse:
    return JobStateResponse(
        id=job.id,
        status=job.status.value,
        attempts=job.attempts,
        scheduled_at=job.scheduled_at,
        lease_expires_at=job.lease_expires_at,
        cancel_requested=job.cancel_requested,
    )


async def _settled(session: AsyncSession, job: MatyJob) -> None:
    """A job that reached a final status: the cloud-agent projection may
    owe a continuation (a follow-up that arrived while it ran). Imported
    here and not at the top so `polar.maty` keeps no dependency on
    `polar.sand` at import time."""
    if not job.is_final:
        return
    from polar.sand.cloud_agents_service import cloud_agents

    await cloud_agents.on_job_settled(session, job)


# --- the four verbs --------------------------------------------------------


@router.post(
    "/claim",
    name="maty:runner_claim",
    response_model=ClaimResponse,
    response_model_exclude_unset=True,
)
async def claim(
    body: RunnerBody, session: AsyncSession = Depends(get_db_session)
) -> ClaimResponse:
    """The oldest job that is due and nobody holds, under a lease.

    `{"job": null}` means the queue had nothing for this runner, which is
    the ordinary answer most of the time and not an error.
    """
    claimed = await maty.claim(session, runner=body.runner)
    if claimed is None:
        return ClaimResponse(job=None)
    job = claimed.job
    return ClaimResponse(
        job=ClaimedJobBody(
            id=job.id,
            kind=job.kind.value,
            prompt=job.prompt,
            deliver=job.deliver,
            allow=job.allow,
            executor="maty-runner",
            # Only a cloud agent's turn carries one; a routine's claim
            # keeps the shape cloud.md wrote.
            **({} if job.conversation is None else {"conversation": job.conversation}),
        ),
        access_token=claimed.access_token,
        expires_at=claimed.expires_at,
    )


@router.post(
    "/jobs/{id}/heartbeat",
    name="maty:runner_heartbeat",
    response_model=JobStateResponse,
)
async def heartbeat(
    id: UUID, body: RunnerBody, session: AsyncSession = Depends(get_db_session)
) -> JobStateResponse:
    """« The work is still going »: the lease moves out, and the job's
    access token with it. A job the caller does not hold is refused."""
    return _state(await maty.heartbeat(session, id, runner=body.runner))


@router.post(
    "/jobs/{id}/complete",
    name="maty:runner_complete",
    response_model=JobStateResponse,
)
async def complete(
    id: UUID, body: CompleteBody, session: AsyncSession = Depends(get_db_session)
) -> JobStateResponse:
    """The answer, kept; the job is final and its token is dead."""
    job = await maty.complete(
        session,
        id,
        runner=body.runner,
        result=body.result,
        usage=body.usage,
        messages=(
            None
            if body.messages is None
            else [message.model_dump() for message in body.messages]
        ),
        artifacts=(
            None
            if body.artifacts is None
            else [artifact.model_dump() for artifact in body.artifacts]
        ),
    )
    await _settled(session, job)
    return _state(job)


@router.post(
    "/jobs/{id}/fail", name="maty:runner_fail", response_model=JobStateResponse
)
async def fail(
    id: UUID, body: FailBody, session: AsyncSession = Depends(get_db_session)
) -> JobStateResponse:
    """A try that did not work. Retryable and with tries left, the job
    goes back to the queue after a backoff; otherwise it stops for good
    with the reason kept."""
    job = await maty.fail(
        session,
        id,
        runner=body.runner,
        reason=body.reason,
        retryable=body.retryable,
    )
    await _settled(session, job)
    return _state(job)
