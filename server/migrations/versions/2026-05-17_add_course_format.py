"""Add Course.format discriminator (course | series)

Revision ID: 08c3effbf1a2
Revises: 7abe8ca7e3c9
Create Date: 2026-05-17 13:00:00.000000

Adds a content-format discriminator to the courses table. Existing rows
are backfilled to "course" — every course created before this migration
was a structured Course → Modules → Lessons by definition. The new
"series" value flags a flat, episode-based narrative format that renders
with a different AI prompt, landing layout, and portal viewer.

Idempotent: uses ADD COLUMN IF NOT EXISTS because the orphaned migration
7c8d3e2f9a01 that was force-pushed out of history added this same
column in production. Fresh dev databases still get the column the
first time; production silently skips.
"""

from alembic import op

revision = "08c3effbf1a2"
down_revision = "7abe8ca7e3c9"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS format VARCHAR(50) "
        "DEFAULT 'course' NOT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS format")
