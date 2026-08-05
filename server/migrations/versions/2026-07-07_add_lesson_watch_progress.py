"""Add course_lesson_watch_progress table

Partial (in-progress) watch positions for video lessons. Previously the
watch position only lived in the student's device localStorage, so a
student who watched 95% of a lesson and closed the tab had zero recorded
progress server-side.

Revision ID: watch_progress_707
Revises: ca_cues_627
Create Date: 2026-07-07 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "watch_progress_707"
down_revision = "ca_cues_627"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_lesson_watch_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("fraction", sa.Float(), nullable=False),
        sa.Column("last_watched_at", sa.TIMESTAMP(timezone=True), nullable=False),
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
        "ix_course_lesson_watch_progress_enrollment_id",
        "course_lesson_watch_progress",
        ["enrollment_id"],
    )
    op.create_index(
        "ix_course_lesson_watch_progress_lesson_id",
        "course_lesson_watch_progress",
        ["lesson_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_course_lesson_watch_progress_lesson_id",
        "course_lesson_watch_progress",
    )
    op.drop_index(
        "ix_course_lesson_watch_progress_enrollment_id",
        "course_lesson_watch_progress",
    )
    op.drop_table("course_lesson_watch_progress")
