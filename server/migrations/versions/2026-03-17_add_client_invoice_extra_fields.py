"""Add extra fields to client_invoices

Revision ID: cdaa3d0a2471
Revises: a35f45bcfadd
Create Date: 2026-03-17 01:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "cdaa3d0a2471"
down_revision = "a35f45bcfadd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_invoices",
        sa.Column("discount_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "client_invoices",
        sa.Column("discount_label", sa.String(), nullable=True),
    )
    op.add_column(
        "client_invoices",
        sa.Column("include_payment_link", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "client_invoices",
        sa.Column("stripe_hosted_invoice_url", sa.String(), nullable=True),
    )
    op.add_column(
        "client_invoices",
        sa.Column("user_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_invoices", "user_metadata")
    op.drop_column("client_invoices", "stripe_hosted_invoice_url")
    op.drop_column("client_invoices", "include_payment_link")
    op.drop_column("client_invoices", "discount_label")
    op.drop_column("client_invoices", "discount_amount")
