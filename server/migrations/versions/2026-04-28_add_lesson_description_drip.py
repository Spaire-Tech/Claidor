"""Add description and drip fields to course_lessons

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-04-28 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "f6g7h8i9j0k1"
down_revision = "e5f6g7h8i9j0"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # Use IF NOT EXISTS so this can be safely re-run on environments
    # where the migration was previously recorded as applied but the
    # actual columns are missing (e.g. partial run, restore from backup).
    op.execute(
        "ALTER TABLE course_lessons "
        "ADD COLUMN IF NOT EXISTS description TEXT"
    )
    op.execute(
        "ALTER TABLE course_lessons "
        "ADD COLUMN IF NOT EXISTS release_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE course_lessons "
        "ADD COLUMN IF NOT EXISTS drip_days INTEGER"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE course_lessons DROP COLUMN IF EXISTS drip_days")
    op.execute("ALTER TABLE course_lessons DROP COLUMN IF EXISTS release_at")
    op.execute("ALTER TABLE course_lessons DROP COLUMN IF EXISTS description")
