"""Add community_event_announcements table

A host-composed announcement sent to enrolled customers about a
community event. Replaces the implicit "Notify members" auto-fire
that used to happen on event create — the host now composes a subject
+ body and explicitly sends.

One event can have many announcements over its lifetime, hence the
fk + index on event_id (and on course_id so the per-course listing
can scan one table directly).

Revision ID: ce_announce_527
Revises: comm_rxn_1per_527
Create Date: 2026-05-27 22:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "ce_announce_527"
down_revision = "comm_rxn_1per_527"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "community_event_announcements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("sent_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "recipient_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["community_events.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sent_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('draft', 'sending', 'sent', 'failed')",
            name="community_event_announcements_status_check",
        ),
    )
    op.create_index(
        "ix_community_event_announcements_event_id",
        "community_event_announcements",
        ["event_id"],
    )
    op.create_index(
        "ix_community_event_announcements_course_id",
        "community_event_announcements",
        ["course_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_community_event_announcements_course_id",
        table_name="community_event_announcements",
    )
    op.drop_index(
        "ix_community_event_announcements_event_id",
        table_name="community_event_announcements",
    )
    op.drop_table("community_event_announcements")
