"""The skill registry behind the app's plugin marketplace (25 September 2026).

The desktop app publishes a skill as a Cursor "plugin": it packs the
skill folder into a tar.gz and posts it to
`aiserver.v1.DashboardService/PublishPlugin`, then reads it back from
`GetEffectiveUserPlugins` on every daily sync and installs it from the
listing's `inline_content_json` (`desktop/source/packages/cursor-plugins/
backend-marketplace-client.ts`, `inline-plugin-synthesizer.ts`). Cursor
kept these in a git-hosted team marketplace; Simeon Labs keeps them here.

- `SandPlugin`: one published plugin. `numeric_id` is the int64 the app
  keys on (`plugin.id`, `pluginDbId`, the cache folder); `commit_sha` is
  what the app calls the version and must equal what the loader computes
  for an inline plugin, `sha256("{id}:{updated_at}")[:40]`
  (`polar.sand.skill_registry_service.commit_sha_of`). A row with an
  `organization_id` is a team plugin: every member of that organization
  sees it. A row without one is personal: only its owner does. The
  tarball's files are kept as `inline_content_json`, which is the content
  of record; the tarball itself is copied to S3 when S3 answers.
- `SandPluginUserSetting`: one person's on/off switch for one plugin.
  Absent means enabled.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    Boolean,
    ForeignKey,
    Identity,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel, TimestampedModel

if TYPE_CHECKING:
    from polar.models import Organization, User


class SandPlugin(RecordModel):
    __tablename__ = "sand_plugins"

    #: The int64 the app keys on; the UUID `id` is the row's identity here.
    numeric_id: Mapped[int] = mapped_column(
        BigInteger, Identity(start=1000), nullable=False, unique=True, index=True
    )
    #: The manifest name (kebab-case, `synthesizeSkillPluginDir`); unique
    #: per scope while the row lives (enforced in the service, not the
    #: schema, because soft-deleted rows keep their name).
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: Null for a personal plugin.
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=True,
        index=True,
        default=None,
    )
    #: The app's version of this plugin: `commit_sha_of(numeric_id, updated_at_ms)`.
    commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    #: sha256 over the tarball's files, sorted by path.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Milliseconds since the epoch, the `updated_at` the app hashes.
    updated_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    #: `{"files": [{"path", "content" | "contentBase64"}]}`, what the app
    #: writes to disk.
    inline_content_json: Mapped[str] = mapped_column(Text, nullable=False)
    #: Where the uploaded tar.gz went in S3, or null when S3 did not answer.
    tar_gz_key: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    commit_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    unpublished_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def owner(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @declared_attr
    def organization(cls) -> Mapped["Organization | None"]:
        return relationship("Organization", lazy="raise")

    @property
    def is_personal(self) -> bool:
        return self.organization_id is None


class SandPluginUserSetting(TimestampedModel):
    __tablename__ = "sand_plugin_user_settings"

    plugin_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("sand_plugins.id", ondelete="cascade"),
        nullable=False,
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
        primary_key=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
