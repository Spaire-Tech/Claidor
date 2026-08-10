"""the chain: artifacts, figures, cells, links, findings, check runs

Revision ID: c3f81a5d20b7
Revises: a71c0d94e2f5
Create Date: 2026-08-10 12:00:00.000000

Hand-written, for the reason the last two were: autogenerate still wants to
drop the pg_trgm extension and a list of indexes across dossiers, veilles,
court_decisions and the email tables. That is pre-existing drift between
the models and this database and has nothing to do with these six tables.
Shipping it would delete working indexes on tables this change never
touches.

Only the six new tables are here.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c3f81a5d20b7"
down_revision = "a71c0d94e2f5"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def _record_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Artifacts: one file in a deal, at one version.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_artifacts",
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lineage_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("counts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("tieout_artifacts_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["files.id"],
            name=op.f("tieout_artifacts_file_id_fkey"),
            ondelete="set null",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"],
            ["users.id"],
            name=op.f("tieout_artifacts_uploaded_by_id_fkey"),
            ondelete="restrict",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_artifacts_pkey")),
    )
    op.create_index(
        op.f("ix_tieout_artifacts_dossier_id"),
        "tieout_artifacts",
        ["dossier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tieout_artifacts_kind"), "tieout_artifacts", ["kind"], unique=False
    )
    op.create_index(
        op.f("ix_tieout_artifacts_lineage_id"),
        "tieout_artifacts",
        ["lineage_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tieout_artifacts_status"), "tieout_artifacts", ["status"], unique=False
    )
    op.create_index(
        "ix_tieout_artifacts_dossier_kind",
        "tieout_artifacts",
        ["dossier_id", "kind"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Figures: a number printed in a deliverable, and what names it.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_figures",
        sa.Column("artifact_id", sa.Uuid(), nullable=False),
        sa.Column("printed", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Numeric(precision=28, scale=10), nullable=False),
        sa.Column("decimals", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column("section", sa.Text(), nullable=False),
        sa.Column("range_endpoint", sa.Boolean(), nullable=False),
        sa.Column("parenthesised", sa.Boolean(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["tieout_artifacts.id"],
            name=op.f("tieout_figures_artifact_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_figures_pkey")),
    )
    op.create_index(
        op.f("ix_tieout_figures_artifact_id"),
        "tieout_figures",
        ["artifact_id"],
        unique=False,
    )
    op.create_index(
        "ix_tieout_figures_artifact_page",
        "tieout_figures",
        ["artifact_id", "page"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Cells: one numeric cell of a model, named from the labels beside it.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_cells",
        sa.Column("artifact_id", sa.Uuid(), nullable=False),
        sa.Column("ref", sa.String(length=128), nullable=False),
        sa.Column("sheet", sa.String(length=128), nullable=False),
        sa.Column("row", sa.Integer(), nullable=False),
        sa.Column("column", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(precision=28, scale=10), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("row_label", sa.Text(), nullable=False),
        sa.Column("column_label", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "precedents", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("alias_of", sa.String(length=128), nullable=True),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["tieout_artifacts.id"],
            name=op.f("tieout_cells_artifact_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_cells_pkey")),
        sa.UniqueConstraint(
            "artifact_id", "ref", name=op.f("uq_tieout_cells_artifact_ref")
        ),
    )
    op.create_index(
        op.f("ix_tieout_cells_artifact_id"),
        "tieout_cells",
        ["artifact_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tieout_cells_name"), "tieout_cells", ["name"], unique=False
    )
    op.create_index(
        "ix_tieout_cells_artifact_sheet",
        "tieout_cells",
        ["artifact_id", "sheet"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Check runs: one pass of one checker over named versions.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_check_runs",
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "artifact_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("requested_by_id", sa.Uuid(), nullable=True),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("tieout_check_runs_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"],
            ["users.id"],
            name=op.f("tieout_check_runs_requested_by_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_check_runs_pkey")),
    )
    op.create_index(
        op.f("ix_tieout_check_runs_dossier_id"),
        "tieout_check_runs",
        ["dossier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tieout_check_runs_status"),
        "tieout_check_runs",
        ["status"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Links: the object the whole product rests on.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_links",
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("figure_id", sa.Uuid(), nullable=False),
        sa.Column("cell_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Numeric(precision=4, scale=3), nullable=False),
        sa.Column("transformation", sa.String(length=32), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("cell_name", sa.Text(), nullable=False),
        sa.Column("figure_label", sa.Text(), nullable=False),
        sa.Column("confirmed_by_id", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("tieout_links_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["figure_id"],
            ["tieout_figures.id"],
            name=op.f("tieout_links_figure_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["cell_id"],
            ["tieout_cells.id"],
            name=op.f("tieout_links_cell_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["confirmed_by_id"],
            ["users.id"],
            name=op.f("tieout_links_confirmed_by_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_links_pkey")),
        sa.UniqueConstraint(
            "figure_id", "cell_id", name=op.f("uq_tieout_links_figure_cell")
        ),
    )
    op.create_index(
        op.f("ix_tieout_links_dossier_id"), "tieout_links", ["dossier_id"], unique=False
    )
    op.create_index(
        op.f("ix_tieout_links_state"), "tieout_links", ["state"], unique=False
    )
    op.create_index(
        "ix_tieout_links_dossier_state",
        "tieout_links",
        ["dossier_id", "state"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Findings: one thing worth telling a banker, and what happened to it.
    # ------------------------------------------------------------------
    op.create_table(
        "tieout_findings",
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("check_run_id", sa.Uuid(), nullable=True),
        sa.Column("artifact_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("severity", sa.String(length=8), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("fingerprint", sa.String(length=128), nullable=False),
        sa.Column("rule", sa.String(length=48), nullable=False),
        sa.Column("standard", sa.String(length=64), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("printed", sa.String(length=64), nullable=False),
        sa.Column("expected", sa.String(length=64), nullable=False),
        sa.Column("one_tick", sa.Boolean(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("dismissed_by_id", sa.Uuid(), nullable=True),
        sa.Column("dismissed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_record_columns(),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("tieout_findings_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["check_run_id"],
            ["tieout_check_runs.id"],
            name=op.f("tieout_findings_check_run_id_fkey"),
            ondelete="set null",
        ),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["tieout_artifacts.id"],
            name=op.f("tieout_findings_artifact_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["dismissed_by_id"],
            ["users.id"],
            name=op.f("tieout_findings_dismissed_by_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_findings_pkey")),
    )
    op.create_index(
        op.f("ix_tieout_findings_dossier_id"),
        "tieout_findings",
        ["dossier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tieout_findings_kind"), "tieout_findings", ["kind"], unique=False
    )
    op.create_index(
        op.f("ix_tieout_findings_state"), "tieout_findings", ["state"], unique=False
    )
    op.create_index(
        "ix_tieout_findings_dossier_state",
        "tieout_findings",
        ["dossier_id", "state"],
        unique=False,
    )
    op.create_index(
        "ix_tieout_findings_fingerprint",
        "tieout_findings",
        ["dossier_id", "fingerprint"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("tieout_findings")
    op.drop_table("tieout_links")
    op.drop_table("tieout_check_runs")
    op.drop_table("tieout_cells")
    op.drop_table("tieout_figures")
    op.drop_table("tieout_artifacts")
