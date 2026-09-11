"""The cloud engine's queue, on Claidor's side.

`docs/maties/cloud.md`, section 4. A runner service asks for a job, is
given one under a lease, works, and says what happened. Everything that
can go wrong with that — two runners asking at once, a runner dying
mid-job, a job that can never work — is answered here rather than in the
runner, because Claidor is the only side that sees all of them.

The three rules the rest of this file exists to keep:

1. **One job goes to one runner.** The claim is a locked read that skips
   rows another transaction holds (`polar.maty.repository`), so two
   claims arriving together take two different jobs or one takes nothing.
2. **A lease is a deadline, not a promise.** Nothing has to notice that a
   runner died: its lease runs out and the job is claimable again. A try
   is counted at the claim for that reason — a silent death costs the
   same as an honest failure, and a job that cannot work stops after
   `MATY_JOB_MAX_ATTEMPTS` instead of looping for ever.
3. **A job's credential dies with its lease.** See `claim`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from polar.config import settings
from polar.desktop.tokens import ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX
from polar.exceptions import PolarError
from polar.kit.crypto import generate_token_hash_pair
from polar.kit.utils import utc_now
from polar.models import DesktopSession, MatyJob, MatyJobKind, MatyJobStatus, User
from polar.postgres import AsyncSession

from .repository import MatyJobRepository, MatyJobSessionRepository

#: How many exhausted jobs one claim will bury before giving up and
#: answering « nothing to do ». A bound, not a budget: the loop only runs
#: again for a job whose runner died on its last allowed try.
CLAIM_SCAN_LIMIT = 20

#: What a job is told when its runner simply stopped answering.
LEASE_LOST_REASON = "The runner stopped answering and the lease ran out."


class MatyError(PolarError): ...


class MatyRunnerUnauthenticated(MatyError):
    """The runner routes are service-to-service: no person's token opens
    them, and neither does a missing or wrong service token."""

    def __init__(
        self, message: str = "This endpoint is for Claidor's cloud runner."
    ) -> None:
        super().__init__(message, status_code=401)


class MatyJobNotFound(MatyError):
    def __init__(self, job_id: UUID) -> None:
        super().__init__(f"There is no job {job_id}.", status_code=404)


class MatyJobNotHeld(MatyError):
    """A runner reporting on a job it does not hold: somebody else's
    lease, an expired one, or a job that has already finished. The answer
    is 409 and not 404, because the job exists and the caller is simply
    too late."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=409)


@dataclass(frozen=True)
class ClaimedJob:
    """What a runner receives: the job, a credential that acts as that one
    person, and the moment both stop being valid."""

    job: MatyJob
    access_token: str
    expires_at: datetime


def retry_delay(attempts: int) -> timedelta:
    """The wait before a failed job is due again, doubling with each try
    so a service that is down is not hammered while it is down."""
    return settings.MATY_JOB_RETRY_BACKOFF * (2 ** max(0, attempts - 1))


class MatyService:
    # --- putting work in -----------------------------------------------

    async def enqueue(
        self,
        session: AsyncSession,
        user: User,
        *,
        kind: MatyJobKind,
        prompt: str,
        deliver: dict[str, Any] | None = None,
        allow: dict[str, Any] | None = None,
        scheduled_at: datetime | None = None,
    ) -> MatyJob:
        """One piece of work for one person, due now unless told otherwise."""
        job = MatyJob(
            user_id=user.id,
            kind=kind,
            prompt=prompt,
            deliver=deliver or {},
            allow=allow or {},
            status=MatyJobStatus.queued,
            scheduled_at=scheduled_at or utc_now(),
        )
        session.add(job)
        await session.flush()
        return job

    # --- the runner's four verbs ---------------------------------------

    async def claim(
        self, session: AsyncSession, *, runner: str, now: datetime | None = None
    ) -> ClaimedJob | None:
        """The oldest job that is due and nobody holds, or None.

        The read is `FOR UPDATE SKIP LOCKED`, so two runners claiming at
        the same instant cannot be handed the same row: the second one
        skips the row the first has locked and takes the next, or none.
        The lock is held until this request commits, by which time the job
        is `running` with a lease and no longer matches the filter at all.

        A job whose lease ran out on its last allowed try is buried here
        rather than handed out again — that is the « after a small number
        of tries it stops and says so » of `docs/maties/cloud.md`, applied
        to the runner that died without the courtesy of saying so.

        **The token.** The runner holds no lasting credential for anybody,
        so claiming mints one: a `DesktopSession` row for this person
        marked with this job's id, expiring exactly when the lease does.
        It is deliberately the same row type the desktop app signs in
        with, because that is the smallest change that works — the memory
        sync (`/desktop/api/memory/sync`) and the metered proxy
        (`/desktop/api/proxy/v1/messages`) resolve a bearer token through
        `DesktopService.authenticate`, so a cloud run debits the person's
        credits through exactly the code path a run on their own laptop
        does, with no second metering path to keep honest. Inventing a
        separate credential would have meant teaching both of those routes
        a second way to be authenticated, and a second way is a second
        thing to get wrong.

        What keeps it from being a back door into a permanent session:

        - `access_expires_at` is the lease's deadline, and a heartbeat
          moves the two together, so the token cannot outlive the lease;
        - its refresh token is generated, stored and never handed out, and
          `DesktopService.refresh` refuses any row that names a job, so it
          cannot be traded up;
        - `complete`, `fail` and the next `claim` revoke it, so the
          credential dies with the work and not merely with the clock.
        """
        moment = now or utc_now()
        repository = MatyJobRepository.from_session(session)

        for _ in range(CLAIM_SCAN_LIMIT):
            job = await repository.get_next_claimable(moment)
            if job is None:
                return None
            if job.attempts >= settings.MATY_JOB_MAX_ATTEMPTS:
                await self._give_up(
                    session, job, reason=job.error or LEASE_LOST_REASON, now=moment
                )
                continue

            expires_at = moment + settings.MATY_JOB_LEASE_TTL
            job.status = MatyJobStatus.running
            job.runner = runner[:128]
            job.attempts += 1
            job.lease_expires_at = expires_at
            session.add(job)
            await session.flush()

            # Nothing survives from the previous try.
            await self._end_job_tokens(session, job, now=moment)
            access_token = await self._mint_job_token(
                session, job, expires_at=expires_at
            )
            return ClaimedJob(job=job, access_token=access_token, expires_at=expires_at)

        return None

    async def heartbeat(
        self,
        session: AsyncSession,
        job_id: UUID,
        *,
        runner: str,
        now: datetime | None = None,
    ) -> MatyJob:
        """« The work is still going »: the lease moves out, and the job's
        token moves with it so the two can never come apart."""
        moment = now or utc_now()
        job = await self._held(session, job_id, runner=runner, now=moment)
        expires_at = moment + settings.MATY_JOB_LEASE_TTL
        job.lease_expires_at = expires_at
        session.add(job)
        for job_session in await MatyJobSessionRepository.from_session(
            session
        ).list_for_job(job.id):
            if job_session.is_revoked:
                continue
            job_session.access_expires_at = expires_at
            job_session.refresh_expires_at = expires_at
            session.add(job_session)
        await session.flush()
        return job

    async def complete(
        self,
        session: AsyncSession,
        job_id: UUID,
        *,
        runner: str,
        result: str,
        usage: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> MatyJob:
        """The answer, kept. The job is final from here."""
        moment = now or utc_now()
        job = await self._held(session, job_id, runner=runner, now=moment)
        job.status = MatyJobStatus.done
        job.result = result
        job.usage = usage
        job.error = None
        job.runner = None
        job.lease_expires_at = None
        session.add(job)
        await session.flush()
        await self._end_job_tokens(session, job, now=moment)
        return job

    async def fail(
        self,
        session: AsyncSession,
        job_id: UUID,
        *,
        runner: str,
        reason: str,
        retryable: bool = False,
        now: datetime | None = None,
    ) -> MatyJob:
        """A try that did not work.

        Retryable, and there are tries left: back to the queue with the
        reason kept and a backoff before it is due again. The try itself
        was counted when the job was claimed, so nothing is counted twice.

        Not retryable, or no tries left: the job is failed for good and
        the reason stays on it, because « it stopped and said so » has to
        have something to say.
        """
        moment = now or utc_now()
        job = await self._held(session, job_id, runner=runner, now=moment)
        if not retryable or job.attempts >= settings.MATY_JOB_MAX_ATTEMPTS:
            return await self._give_up(session, job, reason=reason, now=moment)

        job.status = MatyJobStatus.queued
        job.error = reason
        job.runner = None
        job.lease_expires_at = None
        job.scheduled_at = moment + retry_delay(job.attempts)
        session.add(job)
        await session.flush()
        await self._end_job_tokens(session, job, now=moment)
        return job

    # --- the parts that keep the rules ----------------------------------

    async def _held(
        self, session: AsyncSession, job_id: UUID, *, runner: str, now: datetime
    ) -> MatyJob:
        """The job this runner holds right now, or a refusal saying why
        not. A runner may only speak about work it is actually holding."""
        job = await MatyJobRepository.from_session(session).get_by_id(job_id)
        if job is None:
            raise MatyJobNotFound(job_id)
        if job.is_final:
            raise MatyJobNotHeld(f"Job {job_id} has already finished ({job.status}).")
        if job.status is not MatyJobStatus.running or job.runner != runner:
            raise MatyJobNotHeld(f"Job {job_id} is not held by {runner!r}.")
        if not job.is_leased(now):
            raise MatyJobNotHeld(f"The lease on job {job_id} has run out.")
        return job

    async def _give_up(
        self,
        session: AsyncSession,
        job: MatyJob,
        *,
        reason: str,
        now: datetime | None = None,
    ) -> MatyJob:
        moment = now or utc_now()
        job.status = MatyJobStatus.failed
        job.error = reason
        job.runner = None
        job.lease_expires_at = None
        session.add(job)
        await session.flush()
        await self._end_job_tokens(session, job, now=moment)
        return job

    async def _mint_job_token(
        self, session: AsyncSession, job: MatyJob, *, expires_at: datetime
    ) -> str:
        """A credential that is this person, for this job, until
        `expires_at`. Read `claim` for why it is a `DesktopSession`."""
        access, access_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=ACCESS_TOKEN_PREFIX
        )
        # A refresh token exists only because the column does. It is never
        # handed out, and `DesktopService.refresh` refuses a row that names
        # a job even if one were somehow guessed.
        _, refresh_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=REFRESH_TOKEN_PREFIX
        )
        job_session = DesktopSession(
            access_token_hash=access_hash,
            access_expires_at=expires_at,
            refresh_token_hash=refresh_hash,
            refresh_expires_at=expires_at,
            user_agent=f"maty-runner/{job.runner or 'unknown'}"[:2000],
            client_version=None,
            user_id=job.user_id,
            job_id=job.id,
        )
        session.add(job_session)
        await session.flush()
        return access

    async def _end_job_tokens(
        self, session: AsyncSession, job: MatyJob, *, now: datetime
    ) -> None:
        """Every credential minted for this job, dead. Revoked *and*
        expired: either alone would do, and a credential is worth two
        locks."""
        for job_session in await MatyJobSessionRepository.from_session(
            session
        ).list_for_job(job.id):
            if job_session.is_revoked:
                continue
            job_session.revoked_at = now
            job_session.access_expires_at = now
            job_session.refresh_expires_at = now
            session.add(job_session)
        await session.flush()


maty = MatyService()

__all__ = [
    "CLAIM_SCAN_LIMIT",
    "LEASE_LOST_REASON",
    "ClaimedJob",
    "MatyError",
    "MatyJobNotFound",
    "MatyJobNotHeld",
    "MatyRunnerUnauthenticated",
    "MatyService",
    "maty",
    "retry_delay",
]
