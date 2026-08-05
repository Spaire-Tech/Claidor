"""Add AI lesson-draft autofill status to course lessons

Revision ID: lesson_ai_draft_725
Revises: watch_progress_707
Create Date: 2026-07-25 00:00:00.000000

Adds ``course_lessons.ai_autofill_status``: the state of the AI lesson-draft
pipeline that writes a lesson's description / overview / takeaways from the
video transcript once it lands. ``pending`` (queued behind the transcript),
``done``, ``failed``, or ``cancelled`` (the creator clicked "I'll write it
myself"). Null = not started / not a video lesson.

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "lesson_ai_draft_725"
down_revision = "watch_progress_707"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_lessons",
        sa.Column("ai_autofill_status", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("course_lessons", "ai_autofill_status")
