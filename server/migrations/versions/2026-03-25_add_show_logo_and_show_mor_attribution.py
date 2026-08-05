"""Add show_logo and show_mor_attribution to client_invoices

Revision ID: f4a2b9c1d3e5
Revises: eab1a872c79f
Create Date: 2026-03-25 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f4a2b9c1d3e5"
down_revision = "eab1a872c79f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_invoices",
        sa.Column(
            "show_logo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "client_invoices",
        sa.Column(
            "show_mor_attribution",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("client_invoices", "show_mor_attribution")
    op.drop_column("client_invoices", "show_logo")
