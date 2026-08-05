"""Community events, event RSVPs, customer notifications, customer notification prefs

Adds four tables:
  - community_events
  - community_event_rsvps
  - customer_notifications
  - customer_notification_preferences

All additive — no existing tables are modified.

Also merges five pre-existing Alembic heads so `alembic upgrade head`
resolves to a single tip again (the pre-deploy step was silently failing
on "Multiple heads are present"):

  - cust_avatar_525    (2026-05-25 customer avatar_url)
  - 1f3a55e2b610       (2026-05-18 index_course_enrollments_by_course)
  - 4f1cb78a2d6e       (2026-05-18 grant_spaire_staff_platform_org)
  - 6f4a9d2c1b08       (2026-05-17 add_course_sample)
  - e51c8d7a4b9c       (2026-05-11 email_sequences_course_lesson_links)

Revision ID: comm_events_525
Revises: cust_avatar_525, 1f3a55e2b610, 4f1cb78a2d6e, 6f4a9d2c1b08, e51c8d7a4b9c
Create Date: 2026-05-25 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "comm_events_525"
down_revision = (
    "cust_avatar_525",
    "1f3a55e2b610",
    "4f1cb78a2d6e",
    "6f4a9d2c1b08",
    "e51c8d7a4b9c",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # community_events
    # ------------------------------------------------------------------
    op.create_table(
        "community_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
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
        sa.Column(
            "course_id",
            sa.Uuid(),
            sa.ForeignKey("courses.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column(
            "host_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_at", sa.TIMESTAMP(timezone=True), nullable=False),
        # IANA timezone the host scheduled in (e.g. "America/Los_Angeles").
        # start_at is canonical UTC; this is for display so the host's
        # "8pm PT" shows as "8pm PT" rather than being re-translated to
        # whatever the viewer's locale would render.
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("'UTC'"),
        ),
        sa.Column(
            "duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("60"),
        ),
        sa.Column("meeting_url", sa.Text(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("replay_url", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column(
            "recurring_weekly",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "notify_on_publish",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "rsvp_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "replay_nag_state",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.CheckConstraint(
            "type IN ('workshop', 'office', 'cohort', 'guest')",
            name="community_events_type_check",
        ),
        sa.CheckConstraint(
            "replay_nag_state IN ('pending', 't2h_sent', 't24h_sent', 'done', 'skipped')",
            name="community_events_replay_nag_state_check",
        ),
        sa.CheckConstraint(
            "duration_minutes > 0",
            name="community_events_duration_positive_check",
        ),
    )
    op.create_index(
        "ix_community_events_course_id",
        "community_events",
        ["course_id"],
    )
    op.create_index(
        "ix_community_events_start_at",
        "community_events",
        ["start_at"],
    )
    op.create_index(
        "ix_community_events_course_start",
        "community_events",
        ["course_id", "start_at"],
    )

    # ------------------------------------------------------------------
    # community_event_rsvps
    # ------------------------------------------------------------------
    op.create_table(
        "community_event_rsvps",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
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
        sa.Column(
            "event_id",
            sa.Uuid(),
            sa.ForeignKey("community_events.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("customers.id", ondelete="cascade"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_community_event_rsvps_customer_id",
        "community_event_rsvps",
        ["customer_id"],
    )
    op.create_index(
        "ix_community_event_rsvps_event_customer",
        "community_event_rsvps",
        ["event_id", "customer_id", "deleted_at"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )

    # ------------------------------------------------------------------
    # customer_notifications
    # ------------------------------------------------------------------
    op.create_table(
        "customer_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
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
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("customers.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column(
            "payload",
            pg.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("read_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_customer_notifications_customer_id",
        "customer_notifications",
        ["customer_id"],
    )
    op.create_index(
        "ix_customer_notifications_unread",
        "customer_notifications",
        ["customer_id", "read_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ------------------------------------------------------------------
    # customer_notification_preferences
    # ------------------------------------------------------------------
    op.create_table(
        "customer_notification_preferences",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
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
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("customers.id", ondelete="cascade"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "email_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_table("customer_notification_preferences")
    op.drop_index(
        "ix_customer_notifications_unread", table_name="customer_notifications"
    )
    op.drop_index(
        "ix_customer_notifications_customer_id", table_name="customer_notifications"
    )
    op.drop_table("customer_notifications")
    op.drop_index(
        "ix_community_event_rsvps_event_customer", table_name="community_event_rsvps"
    )
    op.drop_index(
        "ix_community_event_rsvps_customer_id", table_name="community_event_rsvps"
    )
    op.drop_table("community_event_rsvps")
    op.drop_index("ix_community_events_course_start", table_name="community_events")
    op.drop_index("ix_community_events_start_at", table_name="community_events")
    op.drop_index("ix_community_events_course_id", table_name="community_events")
    op.drop_table("community_events")
