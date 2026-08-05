"""Add thumbnail_object_position to courses and course_lessons

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-04-28 16:00:00.000000

"""

from alembic import op

revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS thumbnail_object_position VARCHAR(32)"
    )
    op.execute(
        "ALTER TABLE course_lessons "
        "ADD COLUMN IF NOT EXISTS thumbnail_object_position VARCHAR(32)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE course_lessons "
        "DROP COLUMN IF EXISTS thumbnail_object_position"
    )
    op.execute(
        "ALTER TABLE courses DROP COLUMN IF EXISTS thumbnail_object_position"
    )
