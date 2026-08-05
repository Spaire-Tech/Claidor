"""Add tax_behavior columns to checkouts, orders, subscriptions, organizations, product_prices

Revision ID: b9c4d3e2f5a6
Revises: a8b3c2d1e4f5
Create Date: 2026-03-29 00:01:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b9c4d3e2f5a6"
down_revision = "a8b3c2d1e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checkouts", sa.Column("tax_behavior", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("tax_behavior", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("default_tax_behavior", sa.String(), nullable=True))
    op.add_column("product_prices", sa.Column("tax_behavior", sa.String(), nullable=True))
    op.add_column("subscriptions", sa.Column("tax_behavior", sa.String(), nullable=True))

    # Backfill default_tax_behavior for existing organizations
    op.execute(
        """
        UPDATE organizations
        SET default_tax_behavior = 'exclusive'
        WHERE default_tax_behavior IS NULL
        """
    )

    op.alter_column(
        "organizations",
        "default_tax_behavior",
        existing_type=sa.VARCHAR(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "tax_behavior")
    op.drop_column("product_prices", "tax_behavior")
    op.drop_column("organizations", "default_tax_behavior")
    op.drop_column("orders", "tax_behavior")
    op.drop_column("checkouts", "tax_behavior")
