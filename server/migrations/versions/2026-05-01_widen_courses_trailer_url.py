"""Widen courses.trailer_url to 2048 chars

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-05-01 00:30:00.000000

"""

from alembic import op

revision = "n3o4p5q6r7s8"
down_revision = "m2n3o4p5q6r7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE courses ALTER COLUMN trailer_url TYPE VARCHAR(2048)")


def downgrade() -> None:
    op.execute("ALTER TABLE courses ALTER COLUMN trailer_url TYPE VARCHAR(500)")
