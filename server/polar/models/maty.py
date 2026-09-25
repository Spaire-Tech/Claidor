"""The queue the cloud engine takes its work from.

Maties runs in two places (`docs/maties/cloud.md`): on the person's own
computer, where the desktop app drives the engine, and on Claidor's
servers, where a runner service picks up one piece of work, does it, and
stops. This table is the queue between the two — the only thing the
runner ever reads from, and the only record afterwards of what it did.

A job is a routine coming due, a piece of mail arriving, or a retry of
either. It carries whose it is, what to do, where the answer goes, and
what the engine is allowed to touch while it works.

The lease is what makes a runner that dies harmless: a claim stamps the
job with the runner's name and a deadline, and a runner that stops
sending its heartbeat simply lets the deadline pass, after which the job
is claimable again. Nothing has to notice the death; the clock does it.
`attempts` is counted at the claim, not at the failure, so a runner that
died silently costs the job a try exactly as an honest failure does, and
a job that cannot work stops after a few tries instead of looping for
ever.
"""

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    false,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.kit.extensions.sqlalchemy.types import StringEnum
from polar.kit.utils import utc_now

if TYPE_CHECKING:
    from polar.models import User


class MatyJobKind(StrEnum):
    """Why the job exists. The runner lays out the same workspace for all
    of them; the kind says what the engine is being asked to do and, with
    `allow`, how much rope it gets."""

    #: A routine of the person's coming due — the morning briefing and
    #: everything like it.
    routine = "routine"
    #: Mail sent to the assistant's own address.
    mail = "mail"
    #: A one-off the person or Claidor asked for.
    task = "task"


class MatyJobStatus(StrEnum):
    """Where a job is. `queued` and `running` are the live states; `done`
    and `failed` are final and nothing moves out of them."""

    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


#: The states a job never leaves.
FINAL_STATUSES = frozenset({MatyJobStatus.done, MatyJobStatus.failed})


class MatyJob(RecordModel):
    """One piece of work for the cloud engine, for one person."""

    __tablename__ = "maty_jobs"
    __table_args__ = (
        # « The next job that is due and not leased »: the claim reads
        # live statuses, ordered by when they became due, and skips the
        # ones whose lease is still running. All three columns are in the
        # index so the queue stays cheap once it is long.
        Index(
            "ix_maty_jobs_status_scheduled_at_lease_expires_at",
            "status",
            "scheduled_at",
            "lease_expires_at",
        ),
        # « What has this person got in flight », which is what the app
        # asks.
        Index("ix_maty_jobs_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )

    kind: Mapped[MatyJobKind] = mapped_column(
        StringEnum(MatyJobKind, length=32), nullable=False
    )
    #: What the engine is asked to carry out, in words.
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Where the answer goes, e.g. `{"channel": "email", "to": "…"}`. An
    #: empty object means the answer stays in the app and nothing is sent.
    deliver: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    #: What this job may do on the person's behalf — the « allowed to send,
    #: allowed to pay » marks of `docs/maties/cloud.md`, section 4. Empty
    #: means the cautious default: prepare it and wait.
    allow: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[MatyJobStatus] = mapped_column(
        StringEnum(MatyJobStatus, length=16),
        nullable=False,
        default=MatyJobStatus.queued,
        index=True,
    )
    #: What the engine answered. None until it has.
    result: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    #: Why the last try did not work. Kept when the job fails for good, so
    #: « it stopped and said so » has something to say.
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    #: What the runner reported it spent. The money already moved through
    #: the metered proxy on the person's own account; this is the record,
    #: not the ledger.
    usage: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    #: How many times this job has been handed to a runner. Counted at the
    #: claim, so a runner that died counts the same as one that failed.
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Which runner holds it, by the name it claimed under.
    runner: Mapped[str | None] = mapped_column(String(128), nullable=True, default=None)
    #: Until when. Past this moment the job is claimable again whatever
    #: the runner thinks, which is the whole safety of the arrangement.
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None, index=True
    )

    #: The conversation this job continues, when it is a turn of a cloud
    #: agent (`polar.sand.cloud_agents`, 25 September 2026): a list of
    #: `{"role": "user" | "assistant", "text", "createdAtMs", "jobId"}`,
    #: the person's messages first. The runner is handed the whole list
    #: at the claim and appends the assistant's reply at `complete`
    #: (`messages` on `/maty/runner/jobs/{id}/complete`). None for a
    #: routine or a mail, which run from `prompt` alone.
    conversation: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    #: The job this one continues: a follow-up sent to a cloud agent whose
    #: previous turn had already finished becomes a new job carrying the
    #: prior conversation, with this pointing back.
    parent_job_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("maty_jobs.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    #: Set when the person asks a running job to stop (a cloud agent's
    #: PauseBackgroundComposer). The runner reads it off the heartbeat's
    #: answer and fails the job as cancelled; the queue itself never races
    #: a running row (see `MatyJobNotCancellable`).
    cancel_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    #: Files the executor reported at `complete`, as
    #: `{"path", "sizeBytes", "updatedAtMs"}` rows. Today's runner (a
    #: Render container, memory in and memory out) reports none; the seam
    #: exists for the box executor.
    artifacts: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    #: When the job becomes due. Now for a job that is wanted now, later
    #: for a routine or for a retry waiting out its backoff.
    scheduled_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, default=utc_now, index=True
    )

    #: When a runner last took this job up, and when it stopped for good.
    #:
    #: These two exist because the app asks « how long has this been
    #: going » and « when did it land », and neither could be answered
    #: without them: `modified_at` moves for every heartbeat, and
    #: `lease_expires_at` is a deadline in the future that is cleared the
    #: moment the job finishes. `started_at` is stamped at each claim
    #: rather than only at the first, so it is when the try that is
    #: running — or the last one that ran — began; `attempts` is what says
    #: how many there were. `finished_at` is stamped once, when the job
    #: reaches a status it never leaves.
    started_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @property
    def is_final(self) -> bool:
        return self.status in FINAL_STATUSES

    def is_leased(self, now: datetime | None = None) -> bool:
        """True while a runner still holds it. A lease with no deadline is
        no lease."""
        if self.lease_expires_at is None:
            return False
        return self.lease_expires_at > (now or utc_now())
