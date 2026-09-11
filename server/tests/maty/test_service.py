"""The cloud engine's queue: the claim, the lease, the tries and the
job-scoped token (`polar/maty/service.py`).

Time is passed in rather than waited for: every verb takes a `now`, so
« the lease ran out » is a value and not a sleep. The one exception is
`DesktopService.authenticate`, which reads the clock itself; the tests
that need an expired token therefore claim in the past, which amounts to
the same thing.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

import pytest
from pytest_mock import MockerFixture
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession as SQLAlchemyAsyncSession

from polar.config import settings
from polar.desktop.service import DesktopUnauthenticated, desktop
from polar.desktop.tokens import ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX
from polar.kit.crypto import generate_token_hash_pair
from polar.kit.db.postgres import create_async_engine
from polar.kit.utils import utc_now
from polar.maty.repository import MatyJobRepository, MatyJobSessionRepository
from polar.maty.service import (
    MatyJobNotFound,
    MatyJobNotHeld,
    maty,
    retry_delay,
)
from polar.models import DesktopSession, MatyJob, MatyJobKind, MatyJobStatus, User
from polar.postgres import AsyncReadSession, AsyncSession
from tests.fixtures.database import (
    get_database_url,
    save_fixture_factory,
)
from tests.fixtures.random_objects import create_user


async def _enqueue(
    session: AsyncSession,
    user: User,
    *,
    prompt: str = "Write the morning briefing.",
    ago: timedelta = timedelta(minutes=1),
) -> MatyJob:
    """A job that has been due since `ago`, so a claim at `utc_now()`
    finds it."""
    return await maty.enqueue(
        session,
        user,
        kind=MatyJobKind.routine,
        prompt=prompt,
        deliver={"channel": "app"},
        allow={"send": False},
        scheduled_at=utc_now() - ago,
    )


@pytest.mark.asyncio
class TestClaim:
    async def test_an_empty_queue_hands_back_nothing(
        self, session: AsyncSession
    ) -> None:
        assert await maty.claim(session, runner="cloud-1") is None

    async def test_a_claim_takes_the_oldest_job_that_is_due(
        self, session: AsyncSession, user: User
    ) -> None:
        newer = await _enqueue(session, user, prompt="newer", ago=timedelta(minutes=1))
        older = await _enqueue(session, user, prompt="older", ago=timedelta(hours=2))

        claimed = await maty.claim(session, runner="cloud-1")

        assert claimed is not None
        assert claimed.job.id == older.id
        assert claimed.job.id != newer.id

    async def test_a_job_that_is_not_due_yet_is_left_alone(
        self, session: AsyncSession, user: User
    ) -> None:
        await maty.enqueue(
            session,
            user,
            kind=MatyJobKind.routine,
            prompt="tomorrow",
            scheduled_at=utc_now() + timedelta(hours=6),
        )
        assert await maty.claim(session, runner="cloud-1") is None

    async def test_a_finished_job_is_never_claimed_again(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        claimed = await maty.claim(session, runner="cloud-1")
        assert claimed is not None
        await maty.complete(session, job.id, runner="cloud-1", result="done")

        assert await maty.claim(session, runner="cloud-2") is None

    async def test_a_claim_takes_a_lease_and_counts_a_try(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        await _enqueue(session, user)

        claimed = await maty.claim(session, runner="cloud-1", now=now)

        assert claimed is not None
        job = claimed.job
        assert job.status is MatyJobStatus.running
        assert job.runner == "cloud-1"
        assert job.attempts == 1
        assert job.lease_expires_at == now + settings.MATY_JOB_LEASE_TTL
        assert claimed.expires_at == job.lease_expires_at

    async def test_two_claims_never_get_the_same_job(
        self, session: AsyncSession, user: User
    ) -> None:
        """One job, two runners asking: the second gets nothing."""
        job = await _enqueue(session, user)

        first = await maty.claim(session, runner="cloud-1")
        second = await maty.claim(session, runner="cloud-2")

        assert first is not None
        assert first.job.id == job.id
        assert second is None
        assert job.runner == "cloud-1"

    async def test_the_claim_locks_the_row_it_takes(
        self, session: AsyncSession
    ) -> None:
        """The guarantee above is the database's, not the service's: the
        read that finds the job locks it and skips rows another
        transaction already holds. Two runners asking at the same instant
        therefore cannot be handed the same row, whatever the ordering."""
        statement = MatyJobRepository.from_session(session).claimable_statement(
            utc_now()
        )
        sql = str(statement.compile()).upper()
        assert "FOR UPDATE" in sql
        assert "SKIP LOCKED" in sql

    async def test_each_person_s_job_carries_their_own_token(
        self, session: AsyncSession, user: User, user_second: User
    ) -> None:
        await _enqueue(session, user, ago=timedelta(hours=2))
        await _enqueue(session, user_second, ago=timedelta(minutes=1))

        first = await maty.claim(session, runner="cloud-1")
        assert first is not None
        assert first.job.user_id == user.id
        mine = await desktop.authenticate(session, first.access_token)
        assert mine is not None
        assert mine.user_id == user.id


@pytest.mark.asyncio
class TestLease:
    async def test_a_live_lease_keeps_the_job_out_of_the_queue(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1", now=now) is not None

        later = now + settings.MATY_JOB_LEASE_TTL - timedelta(seconds=1)
        assert await maty.claim(session, runner="cloud-2", now=later) is None

    async def test_a_lease_that_runs_out_returns_the_job_to_the_queue(
        self, session: AsyncSession, user: User
    ) -> None:
        """The runner died. Nothing notices; the clock does the work."""
        now = utc_now()
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1", now=now) is not None

        after = now + settings.MATY_JOB_LEASE_TTL + timedelta(seconds=1)
        again = await maty.claim(session, runner="cloud-2", now=after)

        assert again is not None
        assert again.job.id == job.id
        assert again.job.runner == "cloud-2"
        assert again.job.attempts == 2

    async def test_a_heartbeat_pushes_the_lease_and_the_token_out_together(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        job = await _enqueue(session, user)
        claimed = await maty.claim(session, runner="cloud-1", now=now)
        assert claimed is not None

        later = now + timedelta(minutes=5)
        beaten = await maty.heartbeat(session, job.id, runner="cloud-1", now=later)

        assert beaten.lease_expires_at == later + settings.MATY_JOB_LEASE_TTL
        job_sessions = await MatyJobSessionRepository.from_session(
            session
        ).list_for_job(job.id)
        assert [one.access_expires_at for one in job_sessions] == [
            beaten.lease_expires_at
        ]

    async def test_a_heartbeat_from_another_runner_is_refused(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None

        with pytest.raises(MatyJobNotHeld, match="not held"):
            await maty.heartbeat(session, job.id, runner="cloud-2")

    async def test_a_heartbeat_after_the_lease_has_run_out_is_refused(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1", now=now) is not None

        after = now + settings.MATY_JOB_LEASE_TTL + timedelta(seconds=1)
        with pytest.raises(MatyJobNotHeld, match="lease"):
            await maty.heartbeat(session, job.id, runner="cloud-1", now=after)

    async def test_a_job_that_does_not_exist_is_not_found(
        self, session: AsyncSession
    ) -> None:
        with pytest.raises(MatyJobNotFound):
            await maty.heartbeat(session, uuid.uuid4(), runner="cloud-1")


@pytest.mark.asyncio
class TestTheTryLimit:
    async def test_a_retryable_failure_goes_back_to_the_queue_with_a_backoff(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1", now=now) is not None

        failed = await maty.fail(
            session,
            job.id,
            runner="cloud-1",
            reason="Anthropic answered 529.",
            retryable=True,
            now=now,
        )

        assert failed.status is MatyJobStatus.queued
        assert failed.error == "Anthropic answered 529."
        assert failed.runner is None
        assert failed.lease_expires_at is None
        assert failed.scheduled_at == now + retry_delay(1)
        # And it is not due again until the backoff has passed.
        assert await maty.claim(session, runner="cloud-2", now=now) is None

    async def test_a_job_stops_for_good_after_the_last_try(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "MATY_JOB_MAX_ATTEMPTS", 3)
        job = await _enqueue(session, user)
        now = utc_now()

        for attempt in range(1, 4):
            claimed = await maty.claim(session, runner="cloud-1", now=now)
            assert claimed is not None, f"try {attempt} was never handed out"
            assert claimed.job.attempts == attempt
            failed = await maty.fail(
                session,
                job.id,
                runner="cloud-1",
                reason=f"try {attempt} did not work",
                retryable=True,
                now=now,
            )
            now = failed.scheduled_at

        assert failed.status is MatyJobStatus.failed
        assert failed.error == "try 3 did not work"
        assert failed.attempts == 3
        assert await maty.claim(session, runner="cloud-1", now=now) is None

    async def test_a_runner_that_dies_on_its_last_try_buries_the_job(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """The lease running out is a try like any other, so a runner that
        dies silently cannot keep a job in the queue for ever."""
        mocker.patch.object(settings, "MATY_JOB_MAX_ATTEMPTS", 2)
        job = await _enqueue(session, user)
        now = utc_now()

        for _ in range(2):
            assert await maty.claim(session, runner="cloud-1", now=now) is not None
            now = now + settings.MATY_JOB_LEASE_TTL + timedelta(seconds=1)

        assert await maty.claim(session, runner="cloud-1", now=now) is None
        buried = await MatyJobRepository.from_session(session).get_by_id(job.id)
        assert buried is not None
        assert buried.status is MatyJobStatus.failed
        assert buried.attempts == 2
        assert buried.error is not None

    async def test_an_unretryable_failure_stops_at_once(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None

        failed = await maty.fail(
            session,
            job.id,
            runner="cloud-1",
            reason="The routine asks for a connector the person removed.",
            retryable=False,
        )

        assert failed.status is MatyJobStatus.failed
        assert failed.attempts == 1
        assert failed.error == "The routine asks for a connector the person removed."

    def test_the_backoff_doubles(self) -> None:
        base = settings.MATY_JOB_RETRY_BACKOFF
        assert retry_delay(1) == base
        assert retry_delay(2) == base * 2
        assert retry_delay(3) == base * 4


@pytest.mark.asyncio
class TestTheStateMachine:
    async def test_completing_stores_the_answer(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None

        done = await maty.complete(
            session,
            job.id,
            runner="cloud-1",
            result="Three things this morning…",
            usage={"input_tokens": 1200, "output_tokens": 300},
        )

        assert done.status is MatyJobStatus.done
        assert done.result == "Three things this morning…"
        assert done.usage == {"input_tokens": 1200, "output_tokens": 300}
        assert done.error is None
        assert done.runner is None
        assert done.lease_expires_at is None

    async def test_a_job_that_is_done_cannot_be_completed_again(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None
        await maty.complete(session, job.id, runner="cloud-1", result="once")

        with pytest.raises(MatyJobNotHeld, match="already"):
            await maty.complete(session, job.id, runner="cloud-1", result="twice")

    async def test_a_job_that_is_done_cannot_be_failed(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None
        await maty.complete(session, job.id, runner="cloud-1", result="once")

        with pytest.raises(MatyJobNotHeld, match="already"):
            await maty.fail(session, job.id, runner="cloud-1", reason="too late")

    async def test_a_job_that_failed_cannot_be_completed(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None
        await maty.fail(session, job.id, runner="cloud-1", reason="no", retryable=False)

        with pytest.raises(MatyJobNotHeld, match="already"):
            await maty.complete(session, job.id, runner="cloud-1", result="late")

    async def test_a_queued_job_is_held_by_nobody(
        self, session: AsyncSession, user: User
    ) -> None:
        """Reporting on a job nobody has claimed is refused, so a runner
        cannot complete work it was never given."""
        job = await _enqueue(session, user)

        with pytest.raises(MatyJobNotHeld, match="not held"):
            await maty.complete(session, job.id, runner="cloud-1", result="invented")

    async def test_a_runner_cannot_report_on_another_runner_s_job(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1") is not None

        with pytest.raises(MatyJobNotHeld, match="not held"):
            await maty.complete(session, job.id, runner="cloud-2", result="stolen")

    async def test_a_job_reclaimed_after_a_lease_belongs_to_the_new_runner(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        job = await _enqueue(session, user)
        assert await maty.claim(session, runner="cloud-1", now=now) is not None
        after = now + settings.MATY_JOB_LEASE_TTL + timedelta(seconds=1)
        assert await maty.claim(session, runner="cloud-2", now=after) is not None

        with pytest.raises(MatyJobNotHeld):
            await maty.complete(session, job.id, runner="cloud-1", result="stale")
        done = await maty.complete(
            session, job.id, runner="cloud-2", result="mine", now=after
        )
        assert done.status is MatyJobStatus.done


@pytest.mark.asyncio
class TestTheJobToken:
    async def test_the_token_acts_as_the_person_while_the_lease_is_live(
        self, session: AsyncSession, user: User
    ) -> None:
        await _enqueue(session, user)
        claimed = await maty.claim(session, runner="cloud-1")
        assert claimed is not None

        found = await desktop.authenticate(session, claimed.access_token)

        assert found is not None
        assert found.user_id == user.id
        assert found.job_id == claimed.job.id
        assert found.is_job_token is True
        assert found.access_expires_at == claimed.expires_at

    async def test_the_token_dies_when_the_lease_does(
        self, session: AsyncSession, user: User
    ) -> None:
        """Claimed long enough ago that the lease is already behind us:
        the token that came with it opens nothing."""
        long_ago = utc_now() - settings.MATY_JOB_LEASE_TTL - timedelta(hours=1)
        await maty.enqueue(
            session,
            user,
            kind=MatyJobKind.routine,
            prompt="an old briefing",
            scheduled_at=long_ago,
        )
        claimed = await maty.claim(session, runner="cloud-1", now=long_ago)
        assert claimed is not None
        assert claimed.expires_at < utc_now()

        assert await desktop.authenticate(session, claimed.access_token) is None

    async def test_completing_a_job_kills_its_token(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        claimed = await maty.claim(session, runner="cloud-1")
        assert claimed is not None
        assert await desktop.authenticate(session, claimed.access_token) is not None

        await maty.complete(session, job.id, runner="cloud-1", result="done")

        assert await desktop.authenticate(session, claimed.access_token) is None

    async def test_failing_a_job_kills_its_token(
        self, session: AsyncSession, user: User
    ) -> None:
        job = await _enqueue(session, user)
        claimed = await maty.claim(session, runner="cloud-1")
        assert claimed is not None

        await maty.fail(
            session, job.id, runner="cloud-1", reason="gave up", retryable=True
        )

        assert await desktop.authenticate(session, claimed.access_token) is None

    async def test_a_new_claim_kills_the_token_of_the_one_before(
        self, session: AsyncSession, user: User
    ) -> None:
        now = utc_now()
        await _enqueue(session, user)
        first = await maty.claim(session, runner="cloud-1", now=now)
        assert first is not None

        after = now + settings.MATY_JOB_LEASE_TTL + timedelta(seconds=1)
        second = await maty.claim(session, runner="cloud-2", now=after)
        assert second is not None
        assert second.access_token != first.access_token

        assert await desktop.authenticate(session, first.access_token) is None

    async def test_a_job_token_can_never_be_refreshed_into_a_session(
        self, session: AsyncSession, user: User
    ) -> None:
        """The refresh token of a job session is generated and thrown
        away, so this is unreachable through the wire. It is still
        refused if it is ever reached, because the one thing a job's
        credential must not do is become a lasting one."""
        job = await _enqueue(session, user)
        access, access_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=ACCESS_TOKEN_PREFIX
        )
        refresh, refresh_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=REFRESH_TOKEN_PREFIX
        )
        session.add(
            DesktopSession(
                access_token_hash=access_hash,
                access_expires_at=utc_now() + timedelta(minutes=10),
                refresh_token_hash=refresh_hash,
                refresh_expires_at=utc_now() + timedelta(days=30),
                user_agent="maty-runner/cloud-1",
                user_id=user.id,
                job_id=job.id,
            )
        )
        await session.flush()

        assert await desktop.authenticate(session, access) is not None
        with pytest.raises(DesktopUnauthenticated):
            await desktop.refresh(session, refresh)

    async def test_a_device_s_session_is_still_refreshable(
        self, session: AsyncSession, user: User
    ) -> None:
        """The guard above must not catch the app's own sessions."""
        code = await desktop.create_auth_code(session, user)
        _, _, refresh = await desktop.exchange_auth_code(session, code)

        refreshed, access, _ = await desktop.refresh(session, refresh)

        assert refreshed.job_id is None
        assert await desktop.authenticate(session, access) is not None


# --- the claim under real concurrency ---------------------------------------


@asynccontextmanager
async def _own_session(worker_id: str) -> AsyncIterator[AsyncSession]:
    """A session on a connection of its own.

    The suite's `session` fixture is one connection inside one
    transaction that is rolled back at the end, which is exactly wrong
    for testing row locks: a lock taken and a lock tested on the same
    connection never contend. These sessions commit, so the test cleans
    up after itself.
    """
    engine = create_async_engine(
        dsn=get_database_url(worker_id), application_name=f"test_{worker_id}"
    )
    connection = await engine.connect()
    own = AsyncSession(
        AsyncReadSession(
            SQLAlchemyAsyncSession(bind=connection, expire_on_commit=False)
        )
    )
    try:
        yield own
    finally:
        await own.close()
        await connection.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_two_runners_claiming_at_the_same_moment_take_different_jobs(
    worker_id: str,
) -> None:
    """The guarantee, on two real connections.

    Two claims are started together against a queue holding one job. One
    of them locks the row; the other, reading `SKIP LOCKED`, steps over
    it and finds nothing. The job is never handed out twice, whichever
    way the two requests interleave.
    """
    async with _own_session(worker_id) as setup:
        owner = await create_user(save_fixture_factory(setup))
        job = await maty.enqueue(
            setup, owner, kind=MatyJobKind.routine, prompt="the only job"
        )
        await setup.commit()
        owner_id, job_id = owner.id, job.id

    try:
        async with (
            _own_session(worker_id) as first_session,
            _own_session(worker_id) as second_session,
        ):
            first, second = await asyncio.gather(
                maty.claim(first_session, runner="cloud-1"),
                maty.claim(second_session, runner="cloud-2"),
            )
            claimed = [one for one in (first, second) if one is not None]
            assert len(claimed) == 1, "the same job went to two runners"
            assert claimed[0].job.id == job_id
            assert claimed[0].job.attempts == 1
            # The winner commits; the loser's transaction is dropped.
            winner = first_session if first is not None else second_session
            await winner.commit()

        async with _own_session(worker_id) as third_session:
            assert await maty.claim(third_session, runner="cloud-3") is None
    finally:
        async with _own_session(worker_id) as cleanup:
            await cleanup.execute(delete(User).where(User.id == owner_id))
            await cleanup.commit()
