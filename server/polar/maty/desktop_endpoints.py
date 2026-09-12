"""The four routes the app uses to put work into the cloud engine.

`docs/maties/cloud.md`, « The person's four routes ». They hang off the
desktop app's router, the way the connector routes do, so they come out
under the address the app already talks to:

```
GET  /desktop/api/maty/jobs             -> { "available": true, "jobs": [ job, … ] }
POST /desktop/api/maty/jobs             -> { "job": job }
GET  /desktop/api/maty/jobs/{id}        -> { "job": job }
POST /desktop/api/maty/jobs/{id}/cancel -> { "job": job }

job = { id, kind, prompt, status, result, error,
        createdAt, startedAt, finishedAt }
```

These are the person's routes and the four at `/maty/runner`
(`polar.maty.endpoints`) are the runner's. Nothing crosses: a desktop
session opens nothing on the queue's side, and the runner's service
token opens nothing here. They speak about the same rows and about
nothing else.

Three things this file is careful about, in the order they matter:

- **Whose job it is.** Every route reaches a job through
  `MatyService.get_for_person`, which has the owner in the query. A job
  that is not this person's is 404 and never 403, so a job id cannot be
  probed for existence.
- **What the client may set.** `deliver` and `allow` are accepted by the
  body and refused if they carry anything — read `create_for_person` for
  why refused and not quietly emptied.
- **Whether there is a runner at all.** `available` on the listing, and a
  503 from create. A Claidor with no runner token must read as « not
  available here » and never as a job that waits for ever.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from polar.desktop.auth import get_desktop_session
from polar.models import DesktopSession, MatyJob, MatyJobKind
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .service import maty

router = APIRouter(prefix="/api/maty/jobs", tags=["desktop", APITag.private])


# --- what the app sends -----------------------------------------------------


class CreateJobBody(BaseModel):
    """`{ kind?, prompt, deliver?, allow? }`.

    `prompt` carries no length constraint here on purpose: the refusals
    this route can give are meant to be shown to a person, and a pydantic
    422 with a list of error dictionaries is not. Both « nothing to do »
    and « too long » are decided in the service and come back as a 400
    with a sentence, which is the same way the memory routes refuse a
    file that is too big.

    `deliver` and `allow` are declared, and refused if set. They are part
    of the shape because they are part of a job and will one day be part
    of this call; today the server decides both. Declaring them means an
    app that sends them is told why, rather than having them silently
    dropped — see `MatyService.create_for_person`.
    """

    model_config = ConfigDict(extra="ignore")

    kind: MatyJobKind = MatyJobKind.task
    prompt: str
    deliver: dict[str, Any] = Field(default_factory=dict)
    allow: dict[str, Any] = Field(default_factory=dict)


# --- what Claidor answers ---------------------------------------------------


def _job(job: MatyJob) -> dict[str, Any]:
    """One job as the app reads it: camelCase, ISO timestamps, and a null
    wherever the answer is « not yet »."""
    return {
        "id": str(job.id),
        "kind": job.kind.value,
        "prompt": job.prompt,
        "status": job.status.value,
        "result": job.result,
        "error": job.error,
        "createdAt": job.created_at.isoformat(),
        "startedAt": job.started_at.isoformat() if job.started_at else None,
        "finishedAt": job.finished_at.isoformat() if job.finished_at else None,
    }


# --- the four routes --------------------------------------------------------


@router.get("", name="desktop:maty_jobs_list", response_model=None)
async def list_jobs(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """This person's recent work in the cloud, newest first.

    `available` rides along so one call tells the app both what has run
    and whether anything can be started at all. It is answered even when
    the cloud is off, because the history of what ran while it was on is
    still the person's.
    """
    jobs = await maty.list_for_person(session, desktop_session.user)
    return JSONResponse(
        {"available": maty.available, "jobs": [_job(job) for job in jobs]}
    )


@router.post("", name="desktop:maty_jobs_create", response_model=None)
async def create_job(
    body: CreateJobBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Ask for one piece of work in the cloud.

    Every refusal this can give — 503 with no runner, 400 for an empty or
    over-long prompt or for a `deliver`/`allow` the server will not take
    from a client, 429 over the live-job cap — is raised by the service
    and turned into `{error, detail}` by Claidor's own handler. Nothing
    is written on any of those paths.
    """
    job = await maty.create_for_person(
        session,
        desktop_session.user,
        kind=body.kind,
        prompt=body.prompt,
        deliver=body.deliver,
        allow=body.allow,
    )
    return JSONResponse({"job": _job(job)}, status_code=201)


@router.get("/{id}", name="desktop:maty_jobs_get", response_model=None)
async def get_job(
    id: UUID,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """One job, if it is this person's. Somebody else's is 404."""
    job = await maty.get_for_person(session, desktop_session.user, id)
    return JSONResponse({"job": _job(job)})


@router.post("/{id}/cancel", name="desktop:maty_jobs_cancel", response_model=None)
async def cancel_job(
    id: UUID,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Call off a job that has not started yet.

    A job a runner is already holding is refused with 409 rather than
    raced for it; `MatyJobNotCancellable` says why at length.
    """
    job = await maty.cancel_for_person(session, desktop_session.user, id)
    return JSONResponse({"job": _job(job)})


__all__ = ["router"]
