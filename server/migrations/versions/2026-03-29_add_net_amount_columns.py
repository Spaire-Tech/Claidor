"""Add net_amount columns to orders, checkouts, subscriptions, order_items

Revision ID: a8b3c2d1e4f5
Revises: f4a2b9c1d3e5
Create Date: 2026-03-29 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a8b3c2d1e4f5"
down_revision = "f4a2b9c1d3e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checkouts", sa.Column("net_amount", sa.Integer(), nullable=True))
    op.add_column("order_items", sa.Column("net_amount", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("net_amount", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("net_amount", sa.Integer(), nullable=True))

    # Backfill net_amount before making columns non-nullable
    op.execute(
        """
        UPDATE orders
        SET net_amount = subtotal_amount - discount_amount
        WHERE net_amount IS NULL
        """
    )
    op.execute(
        """
        UPDATE order_items
        SET net_amount = amount
        WHERE net_amount IS NULL
        """
    )
    op.execute(
        """
        UPDATE checkouts
        SET net_amount = computed.net_amount
        FROM (
            SELECT
                c.id AS checkout_id,
                c.amount - COALESCE(
                    CASE
                        WHEN c.discount_id IS NULL THEN 0
                        WHEN d.type = 'percentage' THEN CAST(ROUND(CAST(c.amount AS BIGINT) * d.basis_points / 10000.0) AS INTEGER)
                        WHEN d.type = 'fixed' THEN CASE WHEN d.currency = c.currency THEN LEAST(d.amount, c.amount) ELSE 0 END
                        ELSE 0
                    END,
                    0
                ) AS net_amount
            FROM checkouts c
            LEFT JOIN discounts d ON c.discount_id = d.id
            WHERE c.net_amount IS NULL
        ) AS computed
        WHERE checkouts.id = computed.checkout_id
        """
    )
    op.execute(
        """
        UPDATE subscriptions
        SET net_amount = amount
        WHERE net_amount IS NULL
        """
    )

    op.alter_column("checkouts", "net_amount", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("order_items", "net_amount", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("orders", "net_amount", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("subscriptions", "net_amount", existing_type=sa.INTEGER(), nullable=False)

    op.drop_index(op.f("ix_net_amount"), table_name="orders")
    op.drop_index(op.f("ix_total_amount"), table_name="orders")
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_total_amount",
            "orders",
            [sa.literal_column("(net_amount + tax_amount)")],
            unique=False,
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    op.alter_column("subscriptions", "net_amount", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("orders", "net_amount", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("order_items", "net_amount", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("checkouts", "net_amount", existing_type=sa.INTEGER(), nullable=True)
    op.drop_index("ix_total_amount", table_name="orders")
    with op.get_context().autocommit_block():
        op.create_index(
            op.f("ix_total_amount"),
            "orders",
            [sa.literal_column("(subtotal_amount - discount_amount + tax_amount)")],
            unique=False,
            postgresql_concurrently=True,
        )
        op.create_index(
            op.f("ix_net_amount"),
            "orders",
            [sa.literal_column("(subtotal_amount - discount_amount)")],
            unique=False,
            postgresql_concurrently=True,
        )
    op.drop_column("subscriptions", "net_amount")
    op.drop_column("orders", "net_amount")
    op.drop_column("order_items", "net_amount")
    op.drop_column("checkouts", "net_amount")
