"""Registry: opinions and candidates

Step one of the clause failure registry — the harvested candidate set.
Public court records only; no client data reaches these tables.

Revision ID: registry_harvest_0809
Revises: question_sources_0808
Create Date: 2026-08-09 07:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "registry_harvest_0809"
down_revision = "question_sources_0808"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registry_opinions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("cluster_id", sa.String(length=64), nullable=True),
        sa.Column("opinion_type", sa.String(length=32), nullable=True),
        sa.Column("case_name", sa.Text(), nullable=False),
        sa.Column("court_id", sa.String(length=32), nullable=False),
        sa.Column("court_name", sa.Text(), nullable=False),
        sa.Column("date_filed", sa.Date(), nullable=True),
        sa.Column("docket_number", sa.Text(), nullable=True),
        sa.Column("citations", postgresql.JSONB(), nullable=True),
        sa.Column("precedential_status", sa.String(length=32), nullable=True),
        sa.Column("plain_text", sa.Text(), nullable=True),
        sa.Column("text_sha256", sa.String(length=64), nullable=True),
        sa.Column("text_fetched_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        # One row per upstream document. This is what makes re-running the
        # harvest an update rather than a duplication.
        sa.UniqueConstraint(
            "source", "source_id", name="registry_opinions_source_source_id_key"
        ),
    )
    op.create_index("ix_registry_opinions_court_id", "registry_opinions", ["court_id"])
    op.create_index(
        "ix_registry_opinions_date_filed", "registry_opinions", ["date_filed"]
    )
    op.create_index(
        op.f("ix_registry_opinions_cluster_id"), "registry_opinions", ["cluster_id"]
    )
    op.create_index(
        op.f("ix_registry_opinions_created_at"), "registry_opinions", ["created_at"]
    )

    op.create_table(
        "registry_candidates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("opinion_id", sa.Uuid(), nullable=False),
        sa.Column("doctrine", sa.String(length=64), nullable=False),
        sa.Column("found_by_query", sa.Text(), nullable=False),
        sa.Column("search_rank", sa.Integer(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("verdict", sa.String(length=32), nullable=False),
        sa.Column("verdict_reason", sa.Text(), nullable=True),
        sa.Column("verdict_model", sa.String(length=64), nullable=True),
        sa.Column("verdict_prompt_sha", sa.String(length=64), nullable=True),
        sa.Column("screened_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["opinion_id"], ["registry_opinions.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
        # One consideration per opinion per doctrine, so a re-harvest can
        # never reset a screening verdict already reached.
        sa.UniqueConstraint(
            "opinion_id", "doctrine", name="registry_candidates_opinion_doctrine_key"
        ),
    )
    op.create_index(
        "ix_registry_candidates_doctrine_verdict",
        "registry_candidates",
        ["doctrine", "verdict"],
    )
    op.create_index(
        op.f("ix_registry_candidates_created_at"),
        "registry_candidates",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_registry_candidates_created_at"), table_name="registry_candidates"
    )
    op.drop_index(
        "ix_registry_candidates_doctrine_verdict", table_name="registry_candidates"
    )
    op.drop_table("registry_candidates")
    op.drop_index(
        op.f("ix_registry_opinions_created_at"), table_name="registry_opinions"
    )
    op.drop_index(
        op.f("ix_registry_opinions_cluster_id"), table_name="registry_opinions"
    )
    op.drop_index("ix_registry_opinions_date_filed", table_name="registry_opinions")
    op.drop_index("ix_registry_opinions_court_id", table_name="registry_opinions")
    op.drop_table("registry_opinions")
