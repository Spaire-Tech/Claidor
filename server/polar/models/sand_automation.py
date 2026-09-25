"""Event routines (listeners) on Simeon Labs' server, 25 September 2026.

The app in `desktop/` keeps every routine in the box (`automation.json`)
and, since Grok Bot, mirrors the ones a server can fire to the
`AutomationsService` as a *shadow* workflow whose `description` is
`sand-shadow:<hash>` (`host/extensions/automations/sand-automation-cloud-sync.ts`).
Cursor's server fired those; this is the same store on ours
(`polar.sand.listeners`). Five tables:

- `SandAutomation`: one shadow workflow per person per routine, keyed by
  the app's own stable id (`stableAutomationId(agentId, localId)`), with
  the workflow as protobuf JSON exactly as the app sent it, and the next
  cron fire the scheduler owes it.
- `SandListenerSubscription`: what a person's box is listening for right
  now (`POST /sand/listener-subscriptions`), one row per person.
- `SandListenerEvent`: the relay queue. An event a person's box has not
  yet acknowledged; deleted on ack (`POST /sand/listener-events/poll`).
- `SandAutomationFire`: the fire queue. One row per run the server asks
  the box for (`POST /sand/automation-events/poll`); its id is the
  `runUuid` the box completes (`POST /sand/automation-runs/complete`).
- `SandListenerConnection`: a person's Slack workspace, GitHub App
  installation, or Linear/Sentry/PagerDuty webhook secret.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import User


class SandAutomation(RecordModel):
    __tablename__ = "sand_automations"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "automation_id", name="sand_automations_user_automation"
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The agent (conversation) in the box that owns the routine.
    sand_agent_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    #: `stableAutomationId(agentId, localId)`, minted by the app; the id
    #: every RPC and every fire names.
    automation_id: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: `sand-shadow:<hash>`; the hash is the `definitionRevision` a fire
    #: must carry or the box drops it.
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: `aiserver.v1.Workflow` as protobuf JSON, untouched.
    workflow: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    #: The next cron slot the server owes this routine, in UTC; null when
    #: it has no cron trigger the server can read.
    next_fire_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None, index=True
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    @property
    def definition_revision(self) -> str | None:
        prefix = "sand-shadow:"
        if self.description.startswith(prefix):
            return self.description[len(prefix) :] or None
        return None


class SandListenerSubscription(RecordModel):
    __tablename__ = "sand_listener_subscriptions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, unique=True
    )
    slack_channels: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    github_repos: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    github_kinds: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)


class SandListenerEvent(RecordModel):
    __tablename__ = "sand_listener_events"
    __table_args__ = (
        Index("ix_sand_listener_events_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    #: "slack" or "github": the two sources the box's relay poller reads.
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    #: The wire event minus its `id`, the shape `mapRelayWireEvent` reads.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class SandAutomationFire(RecordModel):
    __tablename__ = "sand_automation_fires"
    __table_args__ = (
        Index("ix_sand_automation_fires_user_status", "user_id", "status"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    automation_row_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("sand_automations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    sand_agent_id: Mapped[str] = mapped_column(String(200), nullable=False)
    automation_id: Mapped[str] = mapped_column(String(200), nullable=False)
    definition_revision: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    #: Set for a cron fire: the slot it stands for, in UTC.
    scheduled_for: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: Set for an event fire: the event in the shape
    #: `parseFireTriggerEvent` reads (`sand-automation-fire-consumer.ts`).
    event: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    #: pending → completed (the box reported) → acked (the box saw the
    #: report land); an expired pending fire is `expired`.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )


class SandListenerConnection(RecordModel):
    """A person's account on a platform, as far as listeners need it.

    - `slack`: one Slack workspace the person installed Simeon's Slack app
      in (`external_id` the team id, `access_token` the bot token,
      `external_user_id` the installing member, `extra.bot_user_id`,
      `extra.channels` the cached channel list).
    - `github`: one GitHub App installation (`external_id` the installation
      id, `extra.repos` the repositories it covers, from the App's own
      webhooks). `user_id` is null until the person finishes the install
      from the app, because the installation webhook can land first.
    - `linear`, `sentry`, `pagerduty`: a webhook the person pastes into
      that service (`webhook_token` names the row in the URL,
      `signing_secret` verifies what it sends).
    """

    __tablename__ = "sand_listener_connections"
    __table_args__ = (
        UniqueConstraint(
            "platform",
            "external_id",
            name="sand_listener_connections_platform_external",
        ),
    )

    user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    external_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    external_user_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    webhook_token: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None, unique=True
    )
    signing_secret: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    extra: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
