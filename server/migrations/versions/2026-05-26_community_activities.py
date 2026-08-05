"""Community activities + submissions

Adds two tables plus extends the community_posts pin_type CHECK to allow
'activity' (synthetic posts used to pin an activity onto the Home feed
go through the existing community_posts table — same path the milestone
job already uses).

Revision ID: comm_activities_526
Revises: comm_events_525
Create Date: 2026-05-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "comm_activities_526"
down_revision = "comm_events_525"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # community_activities
    # ------------------------------------------------------------------
    op.create_table(
        "community_activities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
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
        sa.Column("channel_kind", sa.String(length=20), nullable=False),
        sa.Column(
            "module_id",
            sa.Uuid(),
            sa.ForeignKey("course_modules.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column(
            "lesson_id",
            sa.Uuid(),
            sa.ForeignKey("course_lessons.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("submission_type", sa.String(length=20), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'open'"),
        ),
        sa.Column(
            "pin_to_feed",
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
            "pinned_post_id",
            sa.Uuid(),
            sa.ForeignKey("community_posts.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column(
            "submission_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.CheckConstraint(
            "submission_type IN ('photo', 'video', 'text', 'link')",
            name="community_activities_submission_type_check",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'closed')",
            name="community_activities_status_check",
        ),
        sa.CheckConstraint(
            "channel_kind IN ('module', 'lesson')",
            name="community_activities_channel_kind_check",
        ),
        sa.CheckConstraint(
            "(module_id IS NOT NULL)::int + (lesson_id IS NOT NULL)::int = 1",
            name="community_activities_channel_exactly_one_check",
        ),
    )
    op.create_index(
        "ix_community_activities_course_id",
        "community_activities",
        ["course_id"],
    )

    # ------------------------------------------------------------------
    # community_activity_submissions
    # ------------------------------------------------------------------
    op.create_table(
        "community_activity_submissions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "activity_id",
            sa.Uuid(),
            sa.ForeignKey("community_activities.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("customers.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("submission_type", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "file_id",
            sa.Uuid(),
            sa.ForeignKey("files.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column("mux_playback_id", sa.String(length=64), nullable=True),
        sa.Column("mux_upload_id", sa.String(length=64), nullable=True),
        sa.Column("link_url", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "submission_type IN ('photo', 'video', 'text', 'link')",
            name="community_activity_submissions_submission_type_check",
        ),
    )
    op.create_index(
        "ix_community_activity_submissions_activity_id",
        "community_activity_submissions",
        ["activity_id"],
    )
    op.create_index(
        "ix_community_activity_submissions_customer_id",
        "community_activity_submissions",
        ["customer_id"],
    )

    # ------------------------------------------------------------------
    # Extend community_posts.pin_type to allow 'activity'.
    # ------------------------------------------------------------------
    op.drop_constraint(
        "community_posts_pin_type_check",
        "community_posts",
        type_="check",
    )
    op.create_check_constraint(
        "community_posts_pin_type_check",
        "community_posts",
        "pin_type IS NULL OR pin_type IN ('announcement', 'prompt_of_week', 'activity')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "community_posts_pin_type_check",
        "community_posts",
        type_="check",
    )
    op.create_check_constraint(
        "community_posts_pin_type_check",
        "community_posts",
        "pin_type IS NULL OR pin_type IN ('announcement', 'prompt_of_week')",
    )
    op.drop_index(
        "ix_community_activity_submissions_customer_id",
        table_name="community_activity_submissions",
    )
    op.drop_index(
        "ix_community_activity_submissions_activity_id",
        table_name="community_activity_submissions",
    )
    op.drop_table("community_activity_submissions")
    op.drop_index(
        "ix_community_activities_course_id", table_name="community_activities"
    )
    op.drop_table("community_activities")
