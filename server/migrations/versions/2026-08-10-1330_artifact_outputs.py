"""a model carries the figures it publishes

Revision ID: e5a2c971f4d8
Revises: c3f81a5d20b7
Create Date: 2026-08-10 13:30:00.000000

Two passes reconcile a deck against a model and neither subsumes the
other. The published pass reads the model's Outputs tab and reaches
figures the workbook has no cell for — Cascade's revenue CAGR is computed
on the tab itself. The workbook pass reads every named cell and reaches
everything the tab never published, which on the Cascade deck is six wrong
figures nobody knew about.

The Outputs tab cannot be rebuilt from the stored cells, because its own
columns are text and only numeric cells are stored. So the published
figures ride on the artifact, with each stale source reference already
repaired against the workbook.

Hand-written, for the reason the last three were.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e5a2c971f4d8"
down_revision = "c3f81a5d20b7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tieout_artifacts",
        sa.Column(
            "outputs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("tieout_artifacts", "outputs")
