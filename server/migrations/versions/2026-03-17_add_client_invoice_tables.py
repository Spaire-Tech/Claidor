"""Add client invoice tables

Revision ID: a35f45bcfadd
Revises: 9f907f6f9813
Create Date: 2026-03-17 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a35f45bcfadd"
down_revision = "9f907f6f9813"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_invoices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("stripe_invoice_id", sa.String(), nullable=True),
        sa.Column("status", sa.Unicode(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_calculation_id", sa.String(), nullable=True),
        sa.Column("tax_transaction_id", sa.String(), nullable=True),
        sa.Column("memo", sa.String(), nullable=True),
        sa.Column("po_number", sa.String(64), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("on_behalf_of_label", sa.String(), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_client_invoices_organization_id"),
        "client_invoices",
        ["organization_id"],
    )
    op.create_index(
        op.f("ix_client_invoices_customer_id"),
        "client_invoices",
        ["customer_id"],
    )
    op.create_index(
        op.f("ix_client_invoices_stripe_invoice_id"),
        "client_invoices",
        ["stripe_invoice_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_client_invoices_created_at"),
        "client_invoices",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_client_invoices_deleted_at"),
        "client_invoices",
        ["deleted_at"],
    )

    op.create_table(
        "client_invoice_line_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("client_invoice_id", sa.Uuid(), nullable=False),
        sa.Column("stripe_invoice_item_id", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("tax_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["client_invoice_id"],
            ["client_invoices.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_client_invoice_line_items_client_invoice_id"),
        "client_invoice_line_items",
        ["client_invoice_id"],
    )
    op.create_index(
        op.f("ix_client_invoice_line_items_created_at"),
        "client_invoice_line_items",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_client_invoice_line_items_deleted_at"),
        "client_invoice_line_items",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_table("client_invoice_line_items")
    op.drop_table("client_invoices")
