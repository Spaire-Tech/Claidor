"""a correction is proposed, applied and reversed

Revision ID: d3b7c1e58a24
Revises: c1f7a9d24e63
Create Date: 2026-08-10 21:00:00.000000

Two things, and they arrive together because neither is any use alone.

`tieout_corrections` is the proposal layer: what the document says, what it
should say, who decided, and what became of it. Keyed on a finding's
fingerprint rather than its id, because every check run deletes its
findings and writes them again — the same reason a dismissal is keyed that
way.

`tieout_artifacts.storage_path` is what makes a correction possible at all.
Reading never needed the file after ingest; writing cannot be done without
it, because a correction is a new version of a real document and there is
no way to produce one out of figures and cells.

Hand-written, for the reason the last five were: autogenerate wants to drop
pg_trgm and several unrelated indexes it did not create.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "d3b7c1e58a24"
down_revision = "c1f7a9d24e63"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tieout_artifacts",
        sa.Column("storage_path", sa.String(length=1024), nullable=True),
    )

    op.create_table(
        "tieout_corrections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sa.String(length=128), nullable=False),
        sa.Column("artifact_id", sa.Uuid(), nullable=False),
        sa.Column("lineage_id", sa.Uuid(), nullable=False),
        sa.Column("wrote_artifact_id", sa.Uuid(), nullable=True),
        sa.Column(
            "anchor",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("before", sa.String(length=64), nullable=False),
        sa.Column("after", sa.String(length=64), nullable=False),
        sa.Column("source", sa.Text(), nullable=False, server_default=""),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("where", sa.String(length=16), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("proposed_by_id", sa.Uuid(), nullable=True),
        sa.Column("decided_by_id", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["artifact_id"], ["tieout_artifacts.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["wrote_artifact_id"], ["tieout_artifacts.id"], ondelete="set null"
        ),
        sa.ForeignKeyConstraint(["proposed_by_id"], ["users.id"], ondelete="set null"),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], ondelete="set null"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dossier_id", "fingerprint", name="uq_tieout_corrections_fingerprint"
        ),
    )
    op.create_index(
        "ix_tieout_corrections_dossier_state",
        "tieout_corrections",
        ["dossier_id", "state"],
    )
    op.create_index(
        op.f("ix_tieout_corrections_dossier_id"),
        "tieout_corrections",
        ["dossier_id"],
    )
    op.create_index(
        op.f("ix_tieout_corrections_artifact_id"),
        "tieout_corrections",
        ["artifact_id"],
    )
    op.create_index(
        op.f("ix_tieout_corrections_lineage_id"),
        "tieout_corrections",
        ["lineage_id"],
    )
    op.create_index(
        op.f("ix_tieout_corrections_state"), "tieout_corrections", ["state"]
    )


def downgrade() -> None:
    op.drop_table("tieout_corrections")
    op.drop_column("tieout_artifacts", "storage_path")
