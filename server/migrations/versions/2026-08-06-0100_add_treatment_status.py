"""Add treatment_status and treatment_quote to decision-article links

Revision ID: treatment_status_0806
Revises: legal_corpus_0805
Create Date: 2026-08-06 01:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "treatment_status_0806"
down_revision = "legal_corpus_0805"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "court_decision_article_links",
        sa.Column(
            "treatment_status",
            sa.String(length=32),
            nullable=False,
            server_default="unverified",
        ),
    )
    op.create_index(
        op.f("ix_court_decision_article_links_treatment_status"),
        "court_decision_article_links",
        ["treatment_status"],
    )
    op.add_column(
        "court_decision_article_links",
        sa.Column("treatment_quote", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_court_decision_article_links_treatment_status"),
        table_name="court_decision_article_links",
    )
    op.drop_column("court_decision_article_links", "treatment_status")
    op.drop_column("court_decision_article_links", "treatment_quote")
