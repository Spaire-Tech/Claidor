"""Add product category column

Revision ID: b4c8d2e3f601
Revises: a3b7c9d1e5f2
Create Date: 2026-04-14 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "b4c8d2e3f601"
down_revision = "a3b7c9d1e5f2"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("category", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "category")
