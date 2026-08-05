"""Add instructor and trailer fields to courses

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-04-29 12:00:00.000000

"""

from alembic import op

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(200)"
    )
    op.execute(
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_bio TEXT"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS trailer_url VARCHAR(500)"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS instructor_name_italic BOOLEAN "
        "NOT NULL DEFAULT TRUE"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS instructor_name_bold BOOLEAN "
        "NOT NULL DEFAULT TRUE"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS instructor_name_uppercase BOOLEAN "
        "NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE courses DROP COLUMN IF EXISTS instructor_name_uppercase"
    )
    op.execute(
        "ALTER TABLE courses DROP COLUMN IF EXISTS instructor_name_bold"
    )
    op.execute(
        "ALTER TABLE courses DROP COLUMN IF EXISTS instructor_name_italic"
    )
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS trailer_url")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS instructor_bio")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS instructor_name")
