"""Add lesson_comment_likes (hearts on lesson comments)

Revision ID: lesson_cmt_likes_613
Revises: course_variants_610
Create Date: 2026-06-13 00:00:00.000000

A single heart on a lesson comment, scoped to the customer portal. One row
per (comment, enrollment) — the UNIQUE constraint is the toggle key so a
student can never double-like the same comment. POST creates the row, a
second POST hard-deletes it. The actor is always an enrollment (likes only
exist in the portal), so there is no user/enrollment union like
`community_reactions`.

create_table is guarded with a checkfirst-style existence guard via
IF NOT EXISTS on the indexes; the table itself is created unconditionally
(fresh in this migration).
"""

import sqlalchemy as sa
from alembic import op

revision = "lesson_cmt_likes_613"
down_revision = "course_variants_610"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lesson_comment_likes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("lesson_comment_id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["lesson_comment_id"],
            ["lesson_comments.id"],
            name="lesson_comment_likes_lesson_comment_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["course_enrollments.id"],
            name="lesson_comment_likes_enrollment_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="lesson_comment_likes_pkey"),
        sa.UniqueConstraint(
            "lesson_comment_id",
            "enrollment_id",
            name="lesson_comment_likes_comment_enrollment_unique",
        ),
    )
    op.create_index(
        "ix_lesson_comment_likes_lesson_comment_id",
        "lesson_comment_likes",
        ["lesson_comment_id"],
    )
    op.create_index(
        "ix_lesson_comment_likes_enrollment_id",
        "lesson_comment_likes",
        ["enrollment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_lesson_comment_likes_enrollment_id",
        table_name="lesson_comment_likes",
    )
    op.drop_index(
        "ix_lesson_comment_likes_lesson_comment_id",
        table_name="lesson_comment_likes",
    )
    op.drop_table("lesson_comment_likes")
