"""Backfill storefront_settings.block_order from links_position

Revision ID: g2n3o4p5q6r7
Revises: f1m2d3e4a5b6
Create Date: 2026-05-09 09:00:00.000000

Adds an explicit block_order array to organizations.storefront_settings
so creators can drag-reorder content blocks (Products, Links, Forms)
from the editor canvas.

Backfill rule: derive block_order from the deprecated links_position
boolean. Forms aren't shipped yet, so there are only two blocks today:

  links_position = 'before_products' → block_order = ['links', 'products']
  links_position = 'after_products'  → block_order = ['products', 'links']
  (anything else / missing)          → block_order = ['products', 'links']

links_position stays in the schema as deprecated for one release so
old clients keep validating.
"""

from alembic import op


revision = "g2n3o4p5q6r7"
down_revision = "f1m2d3e4a5b6"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE organizations
        SET storefront_settings = jsonb_set(
            storefront_settings,
            '{block_order}',
            CASE
                WHEN storefront_settings->>'links_position' = 'before_products'
                THEN '["links","products"]'::jsonb
                ELSE '["products","links"]'::jsonb
            END,
            true
        )
        WHERE storefront_settings IS NOT NULL
          AND NOT (storefront_settings ? 'block_order')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE organizations
        SET storefront_settings = storefront_settings - 'block_order'
        WHERE storefront_settings IS NOT NULL
          AND storefront_settings ? 'block_order'
        """
    )
