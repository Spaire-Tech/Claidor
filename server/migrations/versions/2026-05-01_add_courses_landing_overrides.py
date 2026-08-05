"""Add courses.landing_overrides JSONB

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-05-01 01:00:00.000000

"""

from alembic import op

revision = "o4p5q6r7s8t9"
down_revision = "n3o4p5q6r7s8"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS landing_overrides JSONB"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS landing_overrides")
