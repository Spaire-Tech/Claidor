"""Add title column to courses

Revision ID: d6e0f1a5b9c7
Revises: c5d9e2f0a4b8
Create Date: 2026-04-24 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d6e0f1a5b9c7"
down_revision = "c5d9e2f0a4b8"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("title", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("courses", "title")
