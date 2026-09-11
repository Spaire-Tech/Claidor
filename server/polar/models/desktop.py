"""The desktop app's sign-in and metering.

The desktop app, Maties (`desktop/`), speaks a small server protocol
in its account mode: a browser login that ends in an auth code, an
exchange of that code for an access token and a refresh token, a
refresh, a quota, and a model proxy. These three tables are the whole
server-side state of that protocol.

- `DesktopAuthCode`: the short-lived, single-use code the browser hands
  the app after the person signs in on the web.
- `DesktopSession`: one signed-in desktop. Both tokens are stored as
  keyed hashes, never in clear; the refresh token rotates on every use.
  A row that names a `maty_jobs` row is the same thing narrowed to one
  cloud job and one lease; see the class.
- `DesktopUsage`: one row per model call the app made through the
  proxy, with the token counts Anthropic reported and the credits they
  cost. The quota is a sum over these rows for the current month.

One more table carries the shared memory (`docs/maties/cloud.md`):

- `DesktopMemoryFile`: one row per person per memory file. Two sides —
  the app on a computer, and later the cloud runner — read it before
  they work and write it after, so a person with two machines has one
  assistant instead of two strangers.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import User


class DesktopAuthCode(RecordModel):
    __tablename__ = "desktop_auth_codes"

    code_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")


class DesktopSession(RecordModel):
    """One signed-in desktop — or, when `job_id` is set, one cloud job.

    A row with a `job_id` is not a device: it is the credential Claidor
    mints when a runner claims a job, so the runner can act as that one
    person for the life of the lease and no longer. It is a
    `DesktopSession` on purpose — see
    `polar.maty.service.MatyService.claim` for why — and it differs from
    a device's session in three ways, all of them narrowing:

    - its access token expires exactly when the lease does;
    - its refresh token is generated and thrown away, and
      `DesktopService.refresh` refuses a row that names a job, so it can
      never be traded up into a long-lived session;
    - it is revoked the moment the job leaves the runner's hands.
    """

    __tablename__ = "desktop_sessions"

    access_token_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    access_expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    refresh_expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    user_agent: Mapped[str] = mapped_column(Text, nullable=False, default="")
    client_version: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The cloud job this session exists for, when it is a job token
    #: rather than a device. None for every session a person signed in to.
    job_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("maty_jobs.id", ondelete="cascade"),
        nullable=True,
        default=None,
        index=True,
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_job_token(self) -> bool:
        """A credential minted for one cloud job, not a signed-in device."""
        return self.job_id is not None


class DesktopUsage(RecordModel):
    __tablename__ = "desktop_usage"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="set null"),
        nullable=True,
        index=True,
    )
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    #: What Anthropic reported for the call, untouched.
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_creation_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: What the call cost the person's monthly allowance; see
    #: `polar.desktop.service.credits_for` for the weights.
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stream: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: The status Anthropic answered with; a failed call costs nothing.
    upstream_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DesktopMemoryFile(RecordModel):
    """One memory file of one person, as Claidor holds it.

    The assistant's memory is a handful of small text files in its
    workspace: the durable facts (`MEMORY.md`), a note file per day
    (`memory/YYYY-MM-DD.md`), and a short profile of the person
    (`USER.md`). Each machine used to keep its own copy; this table is
    the shared one, so the app on a computer and the cloud runner write
    into one memory.

    The name is a relative path inside the workspace, and only the three
    shapes above are accepted — see
    `polar.desktop.memory_merge.is_accepted_memory_name`, which is the
    boundary that keeps a name from escaping the workspace.

    `version` counts writes, starting at 1. A side that writes sends the
    version it started from; when the row has moved on since, Claidor
    merges the two copies by the file's rule and the version goes up by
    one again.
    """

    __tablename__ = "desktop_memory_files"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The path inside the workspace, e.g. `memory/2026-09-11.md`.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
