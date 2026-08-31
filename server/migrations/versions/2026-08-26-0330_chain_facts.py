"""The Chain's fact store: facts and refusals, cited to page and box

Two tables behind `polar/tieout/chain/store.py`, the D2 contract
approved from the Scribe log. A fact is one printed number at one
document version — page, box (PDF points, top-left origin), printed
text, parsed value, its printed line for label anchoring, and the
extractor that read it. Refusals are the pages the extractor would
not pretend to read, stored with the same permanence so coverage
stays answerable.

Revision ID: chain_facts_0826
Revises: b7d2f4a81c53
Create Date: 2026-08-26 03:30:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "chain_facts_0826"
down_revision = "b7d2f4a81c53"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tieout_chain_facts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "artifact_id",
            sa.Uuid(),
            sa.ForeignKey("tieout_artifacts.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("page_width", sa.Float(), nullable=False),
        sa.Column("page_height", sa.Float(), nullable=False),
        sa.Column("x0", sa.Float(), nullable=False),
        sa.Column("top", sa.Float(), nullable=False),
        sa.Column("x1", sa.Float(), nullable=False),
        sa.Column("bottom", sa.Float(), nullable=False),
        sa.Column("text", sa.String(length=128), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("line", sa.Text(), nullable=False),
        sa.Column("extractor_name", sa.String(length=128), nullable=False),
        sa.Column("extractor_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tieout_chain_facts_artifact_id",
        "tieout_chain_facts",
        ["artifact_id"],
    )
    op.create_index(
        "ix_tieout_chain_facts_created_at", "tieout_chain_facts", ["created_at"]
    )
    op.create_index(
        "ix_tieout_chain_facts_deleted_at", "tieout_chain_facts", ["deleted_at"]
    )

    op.create_table(
        "tieout_chain_refusals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "artifact_id",
            sa.Uuid(),
            sa.ForeignKey("tieout_artifacts.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tieout_chain_refusals_artifact_id",
        "tieout_chain_refusals",
        ["artifact_id"],
    )
    op.create_index(
        "ix_tieout_chain_refusals_created_at", "tieout_chain_refusals", ["created_at"]
    )
    op.create_index(
        "ix_tieout_chain_refusals_deleted_at", "tieout_chain_refusals", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_table("tieout_chain_refusals")
    op.drop_table("tieout_chain_facts")
