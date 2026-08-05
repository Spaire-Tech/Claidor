"""Add invoice_pdf_url to client_invoices

Revision ID: eab1a872c79f
Revises: e3011abd6476
Create Date: 2026-03-18 00:01:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "eab1a872c79f"
down_revision = "e3011abd6476"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_invoices",
        sa.Column("invoice_pdf_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_invoices", "invoice_pdf_url")
