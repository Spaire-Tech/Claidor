"""The Chain's confirmed links: confirm once, arithmetic forever

D4's store, approved by the lead at the twenty-fourth sweep after the
contract passed eight of eight on its registered table as pure
functions. A row here is human input, never engine output: a person
confirmed that a model cell comes from a document figure, and from
then on re-checking that pair is arithmetic.

Two things this table does deliberately, both recorded in the Scribe
log before any code existed:

- **it stores no « proposed » state.** A proposal is computed on demand
  and never written, so a row always means a person acted;
- **it anchors on labels, not coordinates.** `cell_name` and
  `anchor_line` re-find the pair in a later version; `model_ref` and
  `page` are stored so a screen can cite it and are never used to
  locate. Insert a row above the linked cell and the ref is wrong while
  the figure has not moved at all.

The two `value_at_confirmation` columns are the amendment the D4
measurement produced: without them the re-check cannot say *which
side* moved, and three of its four verdicts are unproducible.

Revision ID: chain_links_0828
Revises: chain_column_0827
Create Date: 2026-08-28 10:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "chain_links_0828"
down_revision = "chain_column_0827"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tieout_chain_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        # the document side
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("printed_text", sa.String(length=128), nullable=False),
        sa.Column("anchor_line", sa.Text(), nullable=False),
        sa.Column("ordinal_in_line", sa.Integer(), nullable=False),
        sa.Column("document_value_at_confirmation", sa.Float(), nullable=False),
        # the model side
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cell_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_ref", sa.String(length=128), nullable=False),
        sa.Column("cell_name", sa.Text(), nullable=False),
        sa.Column("model_value_at_confirmation", sa.Float(), nullable=False),
        # what the person stated
        sa.Column("transformation", sa.String(length=64), nullable=False),
        sa.Column("scale", sa.Float(), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("confirmed_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["tieout_artifacts.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(
            ["fact_id"], ["tieout_chain_facts.id"], ondelete="set null"
        ),
        sa.ForeignKeyConstraint(
            ["model_version_id"], ["tieout_artifacts.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["confirmed_by_id"], ["users.id"], ondelete="set null"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tieout_chain_links_dossier_id", "tieout_chain_links", ["dossier_id"]
    )
    op.create_index(
        "ix_tieout_chain_links_dossier_state",
        "tieout_chain_links",
        ["dossier_id", "state"],
    )
    for column in (
        "document_id",
        "document_version_id",
        "fact_id",
        "model_id",
        "model_version_id",
    ):
        op.create_index(
            f"ix_tieout_chain_links_{column}", "tieout_chain_links", [column]
        )


def downgrade() -> None:
    op.drop_table("tieout_chain_links")
