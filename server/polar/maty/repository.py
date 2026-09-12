"""The cloud engine's queue, queried.

One query here matters: `claimable_statement`. Two runners asking at the
same moment must never be handed the same job, so the claim is a locked
read that skips rows another transaction already holds — `SELECT … FOR
UPDATE SKIP LOCKED` — rather than a read followed by a hopeful write.
The row stays locked until the claiming request commits, by which time
the job is `running` with a lease on it and no longer matches the filter
anyway.
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, or_

from polar.kit.repository import RepositoryBase, RepositoryIDMixin
from polar.models import DesktopSession, MatyJob, MatyJobStatus


class MatyJobRepository(RepositoryIDMixin[MatyJob, UUID], RepositoryBase[MatyJob]):
    model = MatyJob

    def claimable_statement(self, now: datetime) -> Select[tuple[MatyJob]]:
        """The next job that is due and not leased, oldest first.

        « Due » is `scheduled_at` in the past; « not leased » is no lease
        or a lease that has run out, which is how a runner that died
        hands its work back without anybody noticing it died. Finished
        jobs are excluded by status, so a completed job is never picked
        up a second time.
        """
        return (
            self.get_base_statement()
            .where(
                MatyJob.status.in_((MatyJobStatus.queued, MatyJobStatus.running)),
                MatyJob.scheduled_at <= now,
                or_(
                    MatyJob.lease_expires_at.is_(None),
                    MatyJob.lease_expires_at <= now,
                ),
            )
            .order_by(MatyJob.scheduled_at.asc(), MatyJob.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )

    async def get_next_claimable(self, now: datetime) -> MatyJob | None:
        return await self.get_one_or_none(self.claimable_statement(now))

    async def list_by_user(
        self, user_id: UUID, *, limit: int | None = None
    ) -> Sequence[MatyJob]:
        """A person's jobs, newest first — what the app shows."""
        statement = (
            self.get_base_statement()
            .where(MatyJob.user_id == user_id)
            .order_by(MatyJob.created_at.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return await self.get_all(statement)

    async def get_by_id_for_user(self, job_id: UUID, user_id: UUID) -> MatyJob | None:
        """One job, if it is this person's.

        The owner is part of the query and not a check after it, which is
        the whole of « ownership is absolute »: there is no code path on
        which a job is loaded first and judged second, so no way for a
        route to answer differently for somebody else's job that exists
        than for an id that never existed.
        """
        statement = self.get_base_statement().where(
            MatyJob.id == job_id, MatyJob.user_id == user_id
        )
        return await self.get_one_or_none(statement)

    async def count_live_for_user(self, user_id: UUID) -> int:
        """How many of this person's jobs are waiting or being worked on.

        « Live » is the two non-final statuses. Finished work does not
        count against anybody: the cap is on what is in flight, so a
        person who has used the cloud a thousand times is no more limited
        than one who never has.
        """
        statement = self.get_base_statement().where(
            MatyJob.user_id == user_id,
            MatyJob.status.in_((MatyJobStatus.queued, MatyJobStatus.running)),
        )
        return await self.count(statement)


class MatyJobSessionRepository(RepositoryBase[DesktopSession]):
    """The job-scoped desktop sessions, which only this module makes.

    It lives here rather than beside the app's own session queries
    because nothing in `polar.desktop` should have a way to reach for a
    job's credential.
    """

    model = DesktopSession

    async def list_for_job(self, job_id: UUID) -> Sequence[DesktopSession]:
        statement = self.get_base_statement().where(DesktopSession.job_id == job_id)
        return await self.get_all(statement)
