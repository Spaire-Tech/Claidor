"""Add kind to court decisions (arrêt vs avis consultatif)

Revision ID: decision_kind_0808
Revises: search_0806
Create Date: 2026-08-08 01:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "decision_kind_0808"
down_revision = "search_0806"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Everything harvested so far is a judgment; avis arrive labelled.
    op.add_column(
        "court_decisions",
        sa.Column(
            "kind",
            sa.String(length=16),
            nullable=False,
            server_default="arret",
        ),
    )
    op.create_index(
        op.f("ix_court_decisions_kind"), "court_decisions", ["kind"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_court_decisions_kind"), table_name="court_decisions")
    op.drop_column("court_decisions", "kind")
