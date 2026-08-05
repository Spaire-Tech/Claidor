"""Add storefront_settings column and storefront_header file type

Revision ID: c7d5e8f1a2b3
Revises: b9c4d3e2f5a6
Create Date: 2026-03-31 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c7d5e8f1a2b3"
down_revision = "b9c4d3e2f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add storefront_settings JSONB column
    op.add_column(
        "organizations",
        sa.Column(
            "storefront_settings",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )

    # Migrate data from profile_settings to storefront_settings
    op.execute(
        """
        UPDATE organizations
        SET storefront_settings = jsonb_build_object(
            'enabled', COALESCE((profile_settings->>'enabled')::boolean, false),
            'description', profile_settings->>'description',
            'show_header', true,
            'header_image_url', null,
            'show_logo', true,
            'show_name', true,
            'show_description', true,
            'thumbnail_size', 'medium',
            'show_product_details', true
        )
        WHERE profile_settings != '{}'::jsonb
          AND profile_settings IS NOT NULL
        """
    )



def downgrade() -> None:
    op.drop_column("organizations", "storefront_settings")
