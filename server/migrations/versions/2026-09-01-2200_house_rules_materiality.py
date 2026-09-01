"""the firm's materiality, on its house rules

Revision ID: house_rules_materiality_0901
Revises: chain_terms_negate_0831
Create Date: 2026-09-01 22:00:00.000000

One nullable column. Null is the default and means « the model's own
scale »; nothing is backfilled and nothing changes for anyone until a
firm types a number.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "house_rules_materiality_0901"
down_revision = "chain_terms_negate_0831"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tieout_house_rules",
        sa.Column("materiality", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tieout_house_rules", "materiality")
