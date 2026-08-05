"""Backfill storefront_settings.featured_mode

Revision ID: f1m2d3e4a5b6
Revises: c8d9e0f1g2h3
Create Date: 2026-05-08 12:00:00.000000

Adds an explicit featured_mode key to organizations.storefront_settings.
The previous behavior conflated 'show all products' with 'show no
specific products' (both were modeled as featured_product_ids = []).
With featured_mode, 'all' means every active product is shown
(including products created in the future); 'curated' means only the
IDs in featured_product_ids are shown.

Backfill rule:
- If featured_product_ids is empty (or missing) → featured_mode = 'all'
- Otherwise → featured_mode = 'curated'

The column is JSONB, so this is a single UPDATE.

Revises c8d9e0f1g2h3 (the last orphan stub from the parallel
coaching-programs branch — see stub_c8d9e0f1g2h3.py) so production,
which is stamped at that revision, can advance through this chain.
"""

from alembic import op


revision = "f1m2d3e4a5b6"
down_revision = "c8d9e0f1g2h3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE organizations
        SET storefront_settings = jsonb_set(
            storefront_settings,
            '{featured_mode}',
            CASE
                WHEN COALESCE(
                    jsonb_array_length(storefront_settings->'featured_product_ids'),
                    0
                ) = 0
                THEN '"all"'::jsonb
                ELSE '"curated"'::jsonb
            END,
            true
        )
        WHERE storefront_settings IS NOT NULL
          AND NOT (storefront_settings ? 'featured_mode')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE organizations
        SET storefront_settings = storefront_settings - 'featured_mode'
        WHERE storefront_settings IS NOT NULL
          AND storefront_settings ? 'featured_mode'
        """
    )
