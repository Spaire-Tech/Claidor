"""Ensure lesson drip/description columns exist

Some environments have the f6g7h8i9j0k1 migration recorded as applied but
the actual columns are missing on `course_lessons`. This re-applies the
column additions idempotently so those environments self-heal.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-28 12:00:00.000000

"""

from alembic import op

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
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
    # No-op: the columns are owned by the f6g7h8i9j0k1 migration.
    pass
