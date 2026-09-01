"""The terms table — swens.md § 3d's structured table, persisted

Piece 7, built to the shape agreed in
`docs/pierce/terms-table-shape.md`. A row is one term of the deal — a
named quantity a person picked from extraction's facts or typed in
where geometry defeated the extractor — cited to its document version,
page and printed token, optionally bound to one model input by the
cell's own name, so the whole table re-checks as arithmetic.

Three deliberate echoes of `tieout_chain_links`, so one vocabulary
serves both: the document side's anchor columns are identical, the
model side's are identical, and values are stored to report which side
moved, never to locate anything.

What is new here and not on links: `name` (the row is a named term,
not an anonymous pair), `stated` (extracted vs typed — a typed term's
empty anchor_line is honest, not missing data), and the supersession
columns (a person's statement that the amended agreement now governs).

Revision ID: chain_terms_0831
Revises: chain_links_0828
Create Date: 2026-08-31 18:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "chain_terms_0831"
down_revision = "chain_links_0828"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tieout_chain_terms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("stated", sa.String(length=16), nullable=False),
        # the document side (as tieout_chain_links holds it)
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("printed_text", sa.String(length=128), nullable=False),
        sa.Column("anchor_line", sa.Text(), nullable=False),
        sa.Column("ordinal_in_line", sa.Integer(), nullable=False),
        sa.Column("column", sa.Text(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        # lifecycle: supersession is a person's statement
        sa.Column("superseded_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("superseded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("superseded_note", sa.Text(), nullable=False),
        # the model side, nullable as a group: bound by a second act
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cell_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model_ref", sa.String(length=128), nullable=False),
        sa.Column("cell_name", sa.Text(), nullable=False),
        sa.Column("model_value_at_confirmation", sa.Float(), nullable=True),
        # what the person stated at binding
        sa.Column("scale", sa.Float(), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["tieout_artifacts.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(
            ["fact_id"], ["tieout_chain_facts.id"], ondelete="set null"
        ),
        sa.ForeignKeyConstraint(
            ["model_version_id"], ["tieout_artifacts.id"], ondelete="set null"
        ),
        sa.ForeignKeyConstraint(
            ["superseded_by_id"], ["users.id"], ondelete="set null"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="set null"),
        sa.ForeignKeyConstraint(["confirmed_by_id"], ["users.id"], ondelete="set null"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tieout_chain_terms_dossier_id", "tieout_chain_terms", ["dossier_id"]
    )
    op.create_index(
        "ix_tieout_chain_terms_dossier_created",
        "tieout_chain_terms",
        ["dossier_id", "created_at"],
    )
    for column in ("document_id", "document_version_id", "fact_id"):
        op.create_index(
            f"ix_tieout_chain_terms_{column}", "tieout_chain_terms", [column]
        )


def downgrade() -> None:
    op.drop_table("tieout_chain_terms")
