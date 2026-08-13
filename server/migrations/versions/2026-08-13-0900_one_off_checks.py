"""a file checked outside any deal, and the record of it

Revision ID: e9a3f5c27b18
Revises: c4d8e2f16a53
Create Date: 2026-08-13 09:00:00.000000

One table: `tieout_one_off_checks`, a row per loose file checked on the
Check-a-file screen. The row keeps the answer — counts and findings,
exactly as drawn — and never the file: a one-off check has no correction
to write, so the bytes are read, checked and dropped in one request.

`dossier_id` is set-null rather than cascade, with the deal's name
snapshotted beside it, so deleting a deal does not silently turn
« Checked against Project Falcon » into « Checked on its own ».

Hand-written, as every migration here is: autogenerate wants to drop
pg_trgm and cannot be trusted with this schema.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e9a3f5c27b18"
down_revision = "c4d8e2f16a53"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tieout_one_off_checks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("dossier_id", sa.Uuid(), nullable=True),
        sa.Column("against", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column(
            "counts",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "result",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="set null"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tieout_one_off_checks_user_id", "tieout_one_off_checks", ["user_id"]
    )
    op.create_index(
        "ix_tieout_one_off_checks_dossier_id", "tieout_one_off_checks", ["dossier_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tieout_one_off_checks_dossier_id", table_name="tieout_one_off_checks"
    )
    op.drop_index(
        "ix_tieout_one_off_checks_user_id", table_name="tieout_one_off_checks"
    )
    op.drop_table("tieout_one_off_checks")
