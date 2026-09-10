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
- `DesktopUsage`: one row per model call the app made through the
  proxy, with the token counts Anthropic reported and the credits they
  cost. The quota is a sum over these rows for the current month.
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

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None


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
