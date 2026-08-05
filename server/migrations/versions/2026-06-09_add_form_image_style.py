"""Add image_url and style to forms

Revision ID: forms_image_style_609
Revises: forms_lead_magnet_608
Create Date: 2026-06-09 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "forms_image_style_609"
down_revision = "forms_lead_magnet_608"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "forms", sa.Column("image_url", sa.String(1024), nullable=True)
    )
    op.add_column(
        "forms",
        sa.Column(
            "style",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("forms", "style")
    op.drop_column("forms", "image_url")
