"""Add course_notes table

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-04-29 14:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS course_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ,
            lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
            enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
            content TEXT NOT NULL DEFAULT ''
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_course_notes_lesson_id ON course_notes (lesson_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_course_notes_enrollment_id ON course_notes (enrollment_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS course_notes")
