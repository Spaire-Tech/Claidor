"""The Chain's facts gain their column anchor

Round 5 measured what a line-only anchor costs on table-shaped
documents: a printed line is a *row*, every figure in it shares the
same labels, and the matcher's tie rule turned a perfect label match
into silence — recall 0 of 18. Round 6's registered fix gives each
fact the header standing above it, which is the other half of a table
cell's identity.

Existing rows get an empty column; extractor version 3 re-extraction
replaces them, which is what the version in the fact id is for.

Revision ID: chain_column_0827
Revises: chain_facts_0826
Create Date: 2026-08-27 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "chain_column_0827"
down_revision = "chain_facts_0826"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tieout_chain_facts",
        sa.Column("column", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("tieout_chain_facts", "column")
