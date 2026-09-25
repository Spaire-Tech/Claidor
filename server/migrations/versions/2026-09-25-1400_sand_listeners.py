"""event routines (listeners): shadow automations, the relay and fire queues, platform connections

Revision ID: sand_listeners_0925
Revises: desktop_box_credential_0925
Create Date: 2026-09-25 14:00:00.000000

Five tables for `polar.sand.listeners`, the half of Cursor's listener
relay the app in `desktop/` expects (`docs/product/listeners-served.md`):
`sand_automations` (one shadow workflow per person per routine),
`sand_listener_subscriptions` (what a box listens for),
`sand_listener_events` (relay queue, deleted on ack),
`sand_automation_fires` (fire queue, its id the run's uuid) and
`sand_listener_connections` (a Slack workspace, a GitHub App installation,
or a Linear/Sentry/PagerDuty webhook secret).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "sand_listeners_0925"
down_revision = "desktop_box_credential_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def _record_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "sand_automations",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sand_agent_id", sa.String(length=200), nullable=False),
        sa.Column("automation_id", sa.String(length=200), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("workflow", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("next_fire_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "automation_id", name="sand_automations_user_automation"
        ),
    )
    op.create_index("ix_sand_automations_user_id", "sand_automations", ["user_id"])
    op.create_index(
        "ix_sand_automations_sand_agent_id", "sand_automations", ["sand_agent_id"]
    )
    op.create_index(
        "ix_sand_automations_next_fire_at", "sand_automations", ["next_fire_at"]
    )

    op.create_table(
        "sand_listener_subscriptions",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "slack_channels", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "github_repos", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "github_kinds", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "sand_listener_events",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sand_listener_events_user_created",
        "sand_listener_events",
        ["user_id", "created_at"],
    )

    op.create_table(
        "sand_automation_fires",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("automation_row_id", sa.Uuid(), nullable=False),
        sa.Column("sand_agent_id", sa.String(length=200), nullable=False),
        sa.Column("automation_id", sa.String(length=200), nullable=False),
        sa.Column("definition_revision", sa.Text(), nullable=True),
        sa.Column("scheduled_for", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("event", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["automation_row_id"], ["sand_automations.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sand_automation_fires_automation_row_id",
        "sand_automation_fires",
        ["automation_row_id"],
    )
    op.create_index(
        "ix_sand_automation_fires_user_status",
        "sand_automation_fires",
        ["user_id", "status"],
    )

    op.create_table(
        "sand_listener_connections",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("external_id", sa.String(length=200), nullable=False),
        sa.Column("external_name", sa.Text(), nullable=False),
        sa.Column("external_user_id", sa.String(length=200), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("webhook_token", sa.String(length=200), nullable=True),
        sa.Column("signing_secret", sa.Text(), nullable=True),
        sa.Column("extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "platform",
            "external_id",
            name="sand_listener_connections_platform_external",
        ),
        sa.UniqueConstraint("webhook_token"),
    )
    op.create_index(
        "ix_sand_listener_connections_user_id", "sand_listener_connections", ["user_id"]
    )


def downgrade() -> None:
    op.drop_table("sand_listener_connections")
    op.drop_table("sand_automation_fires")
    op.drop_table("sand_listener_events")
    op.drop_table("sand_listener_subscriptions")
    op.drop_table("sand_automations")
