"""Add course_lesson_progress table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f7
Create Date: 2026-04-24 16:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6g7"
down_revision = "a1b2c3d4e5f7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_lesson_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["course_enrollments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["course_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("enrollment_id", "lesson_id"),
    )
    op.create_index(
        "ix_course_lesson_progress_enrollment_id",
        "course_lesson_progress",
        ["enrollment_id"],
    )
    op.create_index(
        "ix_course_lesson_progress_lesson_id",
        "course_lesson_progress",
        ["lesson_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_course_lesson_progress_lesson_id", "course_lesson_progress")
    op.drop_index("ix_course_lesson_progress_enrollment_id", "course_lesson_progress")
    op.drop_table("course_lesson_progress")
