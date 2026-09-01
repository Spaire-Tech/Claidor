"""The credit convention — terms gain the transformation column

Founder-approved 31 August, from terms round 2's measured result:
three of fifteen real rows print credits in parentheses
((41,209,384) against a model holding 41,209,384), and « document
value × scale = model value » with scale > 0 cannot state a sign
flip. The person binding a term may now state a named deterministic
function — « identity », or « negate » for the credit convention —
and the re-check applies it. Same column `tieout_chain_links` has
carried since D4; the registry in `anchor.TRANSFORMS` now gives both
their meaning.

Revision ID: chain_terms_negate_0831
Revises: chain_terms_0831
Create Date: 2026-08-31 21:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "chain_terms_negate_0831"
down_revision = "chain_terms_0831"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tieout_chain_terms",
        sa.Column(
            "transformation",
            sa.String(length=64),
            nullable=False,
            server_default="identity",
        ),
    )


def downgrade() -> None:
    op.drop_column("tieout_chain_terms", "transformation")
