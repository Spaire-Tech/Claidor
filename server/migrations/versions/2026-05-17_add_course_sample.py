"""Add Course.sample JSONB column for series episode-sample block

Revision ID: 6f4a9d2c1b08
Revises: 08c3effbf1a2
Create Date: 2026-05-17 14:00:00.000000

Stores the per-course configuration for the Episode Sample block that
renders as a sub-hero on series landings. Shape:

    {
      "enabled": bool,
      "lesson_id": str (UUID),
      "start_seconds": int,
      "duration_seconds": int
    }

NULL means the block is hidden. The column is nullable on both formats
(course / series) but the editor UI only exposes it for series.

Idempotent: same orphaned-migration situation as 08c3effbf1a2 — the
force-pushed predecessor of this migration likely added the column on
production already. Using ADD COLUMN IF NOT EXISTS so this is safe to
run against either state.
"""

from alembic import op

revision = "6f4a9d2c1b08"
down_revision = "08c3effbf1a2"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS sample JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS sample")
