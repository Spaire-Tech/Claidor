"""Phase 2: lesson_comments table + course description/thumbnail_url

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-04-24 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "d4e5f6g7h8i9"
down_revision = "c3d4e5f6g7h8"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # lesson_comments
    op.create_table(
        "lesson_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["enrollment_id"], ["course_enrollments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_lessons.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["lesson_comments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lesson_comments_lesson_id", "lesson_comments", ["lesson_id"])
    op.create_index(
        "ix_lesson_comments_enrollment_id", "lesson_comments", ["enrollment_id"]
    )
    op.create_index("ix_lesson_comments_parent_id", "lesson_comments", ["parent_id"])

    # courses extra fields
    op.add_column("courses", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "courses", sa.Column("thumbnail_url", sa.String(500), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("courses", "thumbnail_url")
    op.drop_column("courses", "description")
    op.drop_index("ix_lesson_comments_parent_id", "lesson_comments")
    op.drop_index("ix_lesson_comments_enrollment_id", "lesson_comments")
    op.drop_index("ix_lesson_comments_lesson_id", "lesson_comments")
    op.drop_table("lesson_comments")
