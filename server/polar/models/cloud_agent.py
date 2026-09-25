"""A cloud agent, as the app's CloudAgent tool and `cursor-agent` card see
one (25 September 2026, `polar.sand.cloud_agents`).

The app speaks Cursor's `aiserver.v1.BackgroundComposerService`: a
"background composer" with a `bcId` the app mints, a name, an archived
flag, a conversation that takes follow-ups, and a run that can be paused.
On Simeon Labs' server a cloud agent is a projection over the maty queue
(`polar.maty`): every turn of it is one `MatyJob`, and this row is what
spans the turns — the identity, the metadata the person edits, and the
pointer to the latest job. Everything about a turn (its status, its
lease, its conversation, its artifacts) stays on the job, where the
runner already writes it.

Nothing in `polar.maty` knows this table exists; the only link is
`job_id`, and a follow-up chains jobs through `MatyJob.parent_job_id`.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    false,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import MatyJob, User


class SandCloudAgent(RecordModel):
    __tablename__ = "sand_cloud_agents"
    __table_args__ = (
        # One bcId per person: the app mints `bc-<uuid>` and reads it back
        # on every call, and somebody else's id must be « not found ».
        Index("ix_sand_cloud_agents_user_id_bc_id", "user_id", "bc_id", unique=True),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The id the app minted (`bc-<uuid>`) and reads everywhere.
    bc_id: Mapped[str] = mapped_column(String(128), nullable=False)
    #: The latest turn. Status, conversation and artifacts are read off it.
    job_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("maty_jobs.id", ondelete="cascade"), nullable=False
    )

    name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    #: What the launch named, kept so the card and the brief can say where
    #: the work is meant to land. Today's executor does not clone it
    #: (`runner/README.md`): branch and pull-request fields stay empty.
    repo_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    base_branch: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    #: A deleted agent answers « not found » and is left off every list;
    #: its jobs keep their record.
    deleted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @declared_attr
    def job(cls) -> Mapped["MatyJob"]:
        return relationship("MatyJob", lazy="raise")
