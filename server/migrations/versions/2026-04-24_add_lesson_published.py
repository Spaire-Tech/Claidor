"""Add published column to course_lessons

Revision ID: f4g8h2i6j0k3
Revises: e3f7a1b2c9d5
Create Date: 2026-04-24 14:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f4g8h2i6j0k3"
down_revision = "e3f7a1b2c9d5"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_lessons",
        sa.Column(
            "published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("course_lessons", "published")
