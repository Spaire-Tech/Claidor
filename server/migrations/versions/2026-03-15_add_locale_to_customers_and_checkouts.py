"""Add locale field to customers and checkouts

Revision ID: 9f907f6f9813
Revises: d7f3a8b1c2e4
Create Date: 2026-03-15 06:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "9f907f6f9813"
down_revision = "d7f3a8b1c2e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("locale", sa.String(), nullable=True),
    )
    op.add_column(
        "checkouts",
        sa.Column("locale", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("checkouts", "locale")
    op.drop_column("customers", "locale")
