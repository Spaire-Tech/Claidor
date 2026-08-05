"""Add community_activity_submission_comments

Persists threaded feedback under each CommunityActivitySubmission so
instructors (and peers, when visibility allows) can leave durable
comments. SubmissionThreadModal was rendering a session-local thread
before this — anything typed evaporated on close.

Same dual-author pattern as community_posts: exactly one of
author_enrollment_id (student) or author_user_id (instructor) is set,
enforced by a CHECK constraint.

Revision ID: actsub_cmt_526
Revises: actsub_vis_526
Create Date: 2026-05-26 21:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "actsub_cmt_526"
down_revision = "actsub_vis_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "community_activity_submission_comments",
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
            "submission_id",
            sa.Uuid(),
            sa.ForeignKey(
                "community_activity_submissions.id", ondelete="cascade"
            ),
            nullable=False,
        ),
        sa.Column(
            "author_enrollment_id",
            sa.Uuid(),
            sa.ForeignKey("course_enrollments.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column(
            "author_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_activity_submission_comments_author_check",
        ),
    )
    op.create_index(
        "ix_community_activity_submission_comments_submission_id",
        "community_activity_submission_comments",
        ["submission_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_community_activity_submission_comments_submission_id",
        table_name="community_activity_submission_comments",
    )
    op.drop_table("community_activity_submission_comments")
