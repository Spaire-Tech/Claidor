"""Add comments_mode to course_lessons

Revision ID: m2n3o4p5q6r7
Revises: k1l2m3n4o5p6
Create Date: 2026-05-01 00:00:00.000000

"""

from alembic import op

revision = "m2n3o4p5q6r7"
down_revision = "k1l2m3n4o5p6"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE course_lessons "
        "ADD COLUMN IF NOT EXISTS comments_mode VARCHAR(16) NOT NULL DEFAULT 'visible'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE course_lessons DROP COLUMN IF EXISTS comments_mode")
