"""Backfill is_free_preview for first lesson of each course

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-04-28 11:00:00.000000

"""

from alembic import op

revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # For each course, set is_free_preview=true on the first lesson
    # (lowest position in lowest-position module), so every course has
    # at least one free preview/trailer.
    op.execute(
        """
        UPDATE course_lessons
        SET is_free_preview = TRUE
        WHERE id IN (
            SELECT DISTINCT ON (cm.course_id) cl.id
            FROM course_lessons cl
            JOIN course_modules cm ON cl.module_id = cm.id
            WHERE cl.deleted_at IS NULL
              AND cm.deleted_at IS NULL
            ORDER BY cm.course_id, cm.position ASC, cl.position ASC
        )
        """
    )


def downgrade() -> None:
    # Don't downgrade is_free_preview values - they may have been manually set
    pass
