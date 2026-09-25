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

The other half of this file is the person's side — what the app may ask
for (`create_for_person` and the three that follow it). It is a separate
set of methods rather than a flag on the same ones because the whole
difference between the two callers is what gets checked: Claidor's own
`enqueue` is trusted about delivery and permission, and a client is
trusted about neither.
"""

from __future__ import annotations

from collections.abc import Sequence
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

#: What a job is told when the person changed their mind before it ran.
#:
#: A cancelled job is `failed` and not a status of its own. The table has
#: four statuses and the two final ones are `done` and `failed`; adding a
#: fifth would mean a value the deployed runner has never heard of, for a
#: difference the app can already read off this sentence. If the app ever
#: needs to *style* a cancellation differently from a breakage, that is
#: the moment to add `MatyJobStatus.cancelled` — and it is a change to
#: the model, the final set and the claim filter, not a detail.
CANCELLED_REASON = "Cancelled before it started."

#: The longest prompt the app may send. Long enough for a page of
#: instructions and the mail that provoked them; short enough that the
#: queue cannot be used as a filing cabinet. The prompt is what the
#: engine is told to do, not the material it works on — that comes from
#: the person's memory and their library.
PROMPT_MAX_LENGTH = 8_000

#: How many jobs one person may have waiting or running at once.
#:
#: Ten is not a quota on how much anybody may use the cloud; it is a
#: ceiling on how fast a mistake can fill the queue. A loop in the app
#: gets ten refusals instead of ten thousand rows, and a person working
#: honestly never sees it, because a job that has finished no longer
#: counts and the runner works through them steadily. Every other limit
#: on the cloud engine is about money and lives in the metered proxy;
#: this one is about the queue.
LIVE_JOB_LIMIT = 10

#: The most jobs one listing returns. The app shows a recent history, not
#: an archive, and an answer whose size grows with how long somebody has
#: been a customer is a bug that takes a year to appear.
JOB_LIST_LIMIT = 50


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


class MatyNotAvailable(MatyError):
    """This Claidor has no cloud runner, so there is nothing to queue for.

    503 and not 202: a job nobody will ever take is worse than a refusal,
    because the person is told their work is under way and it is not. The
    app reads the same fact from `available` on the listing and hides the
    button; this is what a client that ignored it gets.
    """

    def __init__(
        self, message: str = "The cloud engine is not available on this Claidor."
    ) -> None:
        super().__init__(message, status_code=503)


class MatyJobRefused(MatyError):
    """The job as asked for cannot be made: 400, with the reason said
    plainly enough to show a person."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)


class MatyTooManyJobs(MatyError):
    """This person already has `LIVE_JOB_LIMIT` jobs in flight."""

    def __init__(self, limit: int) -> None:
        super().__init__(
            f"You already have {limit} pieces of work waiting or running. "
            "Wait for one to finish, or cancel one, before starting another.",
            status_code=429,
        )


class MatyJobNotCancellable(MatyError):
    """Only a job that has not started can be called off.

    A `running` job is held by a runner under a lease, in a container
    that is already working. Marking it cancelled here would not stop
    that container, and the runner would then complete or fail a job we
    had declared finished — two writers on one row, racing, for no gain.
    The lease is short; a running job either lands or times out, and it
    can be left alone until it does. A cloud engine that can genuinely
    stop mid-flight is a different feature — the runner would have to ask
    whether it is still wanted — and it is not this one.
    """

    def __init__(self, job_id: UUID, status: MatyJobStatus) -> None:
        if status is MatyJobStatus.running:
            detail = (
                "This work has already started and cannot be called off. "
                "It will stop on its own if it does not finish."
            )
        else:
            detail = f"This work has already finished ({status.value})."
        super().__init__(detail, status_code=409)
        self.job_id = job_id
        self.status = status


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
    # --- whether there is a cloud engine at all --------------------------

    @property
    def available(self) -> bool:
        """Whether the cloud engine can actually do anything here.

        The runner authenticates with `CLAIDOR_MATY_RUNNER_TOKEN`
        (`polar.maty.auth`), so a Claidor without that setting has no way
        to let a runner in, and a job queued on it would sit there for
        ever. One fact, read the same way by the listing (which says
        `available: false` so the app can hide the button) and by the
        create route (which refuses, so a patched app cannot queue work
        nobody will do). A development machine and a production Claidor
        that has lost its environment variable look identical from here,
        which is right: in both, the answer to « can this run in the
        cloud » is no.
        """
        return bool(settings.MATY_RUNNER_TOKEN)

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
        conversation: list[dict[str, Any]] | None = None,
        parent_job_id: UUID | None = None,
    ) -> MatyJob:
        """One piece of work for one person, due now unless told otherwise.

        `conversation` and `parent_job_id` are a cloud agent's turn
        (`polar.sand.cloud_agents`, 25 September 2026): the messages the
        runner continues from, and the turn before it. A routine or a
        mail passes neither and runs from `prompt` alone."""
        job = MatyJob(
            user_id=user.id,
            kind=kind,
            prompt=prompt,
            deliver=deliver or {},
            allow=allow or {},
            status=MatyJobStatus.queued,
            scheduled_at=scheduled_at or utc_now(),
            conversation=conversation,
            parent_job_id=parent_job_id,
        )
        session.add(job)
        await session.flush()
        return job

    # --- the person's four verbs ----------------------------------------
    #
    # `enqueue` above is Claidor's own way in: a routine coming due, a
    # piece of mail, a retry. Everything below is the app asking on a
    # person's behalf, and it is the only path a client can reach. The
    # difference is entirely in what is checked, which is why these are
    # separate methods and not a flag.

    async def create_for_person(
        self,
        session: AsyncSession,
        user: User,
        *,
        kind: MatyJobKind = MatyJobKind.task,
        prompt: str,
        deliver: dict[str, Any] | None = None,
        allow: dict[str, Any] | None = None,
    ) -> MatyJob:
        """One piece of work a person asked for, or a refusal saying why not.

        **`deliver` and `allow` are refused, not ignored, and this is the
        decision the route exists to hold.** Section 4 of
        `docs/maties/cloud.md`: `allow` is what the job may do that cannot
        be undone — send, pay, delete — and `deliver` is where an answer
        is sent without anybody reading it first. Both are the difference
        between « the assistant drafted this » and « the assistant did
        this », and neither is safe to take from a client: an app is
        patchable and a stranger's mail can end up in a prompt, so the
        only place either may be decided is the server, per routine, once
        there are routines to decide for. Until then the cautious default
        is the whole story — the answer comes back to the app and nothing
        is sent anywhere — and widening it is its own piece of work.
        Refused rather than dropped because a silently emptied `deliver`
        is the worst of the three outcomes: the person is told their
        briefing was emailed and it was not.

        `kind`, by contrast, is the client's to choose. It is a label on
        why the job exists and it grants nothing on its own: what a job
        may do is `allow`, and `allow` is empty. An app that calls its
        work a routine when it is a task has told us something slightly
        wrong about its own history and nothing else. The day `kind`
        starts deciding anything — a different workspace, a different
        tool list — is the day it stops being the client's to choose.
        """
        if not self.available:
            raise MatyNotAvailable()
        if deliver:
            raise MatyJobRefused(
                "Simeon decides where an answer goes, not the app. "
                "A job started from the app answers in the app."
            )
        if allow:
            raise MatyJobRefused(
                "Simeon decides what a job may do on your behalf, not the app. "
                "Work started this way prepares things and waits."
            )

        cleaned = prompt.strip()
        if not cleaned:
            raise MatyJobRefused("A job needs something to do.")
        if len(cleaned) > PROMPT_MAX_LENGTH:
            raise MatyJobRefused(
                f"That is longer than {PROMPT_MAX_LENGTH:,} characters, "
                "which is as much as one job may be asked in one go."
            )

        repository = MatyJobRepository.from_session(session)
        # Counted immediately before the insert, in the same transaction,
        # so two requests racing can at worst overshoot by one — and the
        # cap is a guard against a loop, not an accounting figure.
        if await repository.count_live_for_user(user.id) >= LIVE_JOB_LIMIT:
            raise MatyTooManyJobs(LIVE_JOB_LIMIT)

        return await self.enqueue(session, user, kind=kind, prompt=cleaned)

    async def list_for_person(
        self, session: AsyncSession, user: User
    ) -> Sequence[MatyJob]:
        """This person's jobs, newest first, at most `JOB_LIST_LIMIT`."""
        return await MatyJobRepository.from_session(session).list_by_user(
            user.id, limit=JOB_LIST_LIMIT
        )

    async def get_for_person(
        self, session: AsyncSession, user: User, job_id: UUID
    ) -> MatyJob:
        """One job of this person's, or `MatyJobNotFound`.

        Somebody else's job is not found — 404 and never 403. A job id is
        a name for a piece of somebody's private work, and an endpoint
        that says « that exists but is not yours » lets anybody with a
        list of ids learn which of them are real. There is one answer for
        « no such job » and « not your job » because from where the caller
        stands they are the same sentence.
        """
        job = await MatyJobRepository.from_session(session).get_by_id_for_user(
            job_id, user.id
        )
        if job is None:
            raise MatyJobNotFound(job_id)
        return job

    async def cancel_for_person(
        self,
        session: AsyncSession,
        user: User,
        job_id: UUID,
        *,
        now: datetime | None = None,
    ) -> MatyJob:
        """Call off a job that has not started. See `MatyJobNotCancellable`
        for why `running` is refused rather than raced."""
        moment = now or utc_now()
        job = await self.get_for_person(session, user, job_id)
        if job.status is not MatyJobStatus.queued:
            raise MatyJobNotCancellable(job.id, job.status)
        return await self._give_up(session, job, reason=CANCELLED_REASON, now=moment)

    async def request_cancel(
        self, session: AsyncSession, user: User, job_id: UUID
    ) -> MatyJob:
        """Ask a job to stop, whatever it is doing (25 September 2026).

        A queued job is called off here, the way `cancel_for_person` does
        it. A running one is not raced — `MatyJobNotCancellable` still
        says why — but its `cancel_requested` flag is set, and the runner
        reads that flag off every heartbeat's answer and fails the job as
        cancelled itself. A final job is left as it is. This is the "ask
        whether it is still wanted" the docstring above says a cloud
        engine that stops mid-flight needs; the cloud agents' pause
        (`polar.sand.cloud_agents`) is its caller."""
        job = await self.get_for_person(session, user, job_id)
        if job.status is MatyJobStatus.queued:
            return await self._give_up(session, job, reason=CANCELLED_REASON)
        if job.status is MatyJobStatus.running and not job.cancel_requested:
            job.cancel_requested = True
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
            # When the try that is now running began. Stamped at every
            # claim, so a retry says when *it* started rather than when
            # the first attempt did; `attempts` is what counts the tries.
            job.started_at = moment
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
        messages: list[dict[str, Any]] | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        now: datetime | None = None,
    ) -> MatyJob:
        """The answer, kept. The job is final from here.

        `messages` are the turn's replies (`{"role", "text"}`), added to
        the job's conversation when it carries one so a cloud agent's
        transcript grows by what the runner actually said. They go after
        the messages the runner was handed and before any marked
        `pending` — a follow-up that arrived while the run was under way,
        which the runner never saw and a continuation will answer.
        `artifacts` are the files the executor reported. Both are the
        runner's word, stamped here with the moment and the job."""
        moment = now or utc_now()
        job = await self._held(session, job_id, runner=runner, now=moment)
        job.status = MatyJobStatus.done
        job.result = result
        job.usage = usage
        if messages:
            stamped = [
                {
                    "role": "assistant" if message.get("role") != "user" else "user",
                    "text": str(message.get("text") or ""),
                    "createdAtMs": int(moment.timestamp() * 1000),
                    "jobId": str(job.id),
                }
                for message in messages
            ]
            seen = job.conversation or []
            first_pending = next(
                (i for i, message in enumerate(seen) if message.get("pending") is True),
                len(seen),
            )
            job.conversation = [*seen[:first_pending], *stamped, *seen[first_pending:]]
        if artifacts is not None:
            job.artifacts = artifacts
        job.error = None
        job.runner = None
        job.lease_expires_at = None
        job.finished_at = moment
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
        job.finished_at = moment
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
    "CANCELLED_REASON",
    "CLAIM_SCAN_LIMIT",
    "JOB_LIST_LIMIT",
    "LEASE_LOST_REASON",
    "LIVE_JOB_LIMIT",
    "PROMPT_MAX_LENGTH",
    "ClaimedJob",
    "MatyError",
    "MatyJobNotCancellable",
    "MatyJobNotFound",
    "MatyJobNotHeld",
    "MatyJobRefused",
    "MatyNotAvailable",
    "MatyRunnerUnauthenticated",
    "MatyService",
    "MatyTooManyJobs",
    "maty",
    "retry_delay",
]
