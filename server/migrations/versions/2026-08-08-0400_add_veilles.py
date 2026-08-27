"""Veilles: watches and their signals

Revision ID: veilles_0808
Revises: saved_prompts_0808
Create Date: 2026-08-08 04:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "veilles_0808"
down_revision = "saved_prompts_0808"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "veilles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("target", sa.String(length=16), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("scanned_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_veilles_organization_id"), "veilles", ["organization_id"], unique=False
    )
    op.create_index(
        op.f("ix_veilles_target_id"), "veilles", ["target_id"], unique=False
    )
    op.create_table(
        "veille_signals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("veille_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("happened_on", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["veille_id"], ["veilles.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_veille_signals_veille_id"),
        "veille_signals",
        ["veille_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_veille_signals_veille_id"), table_name="veille_signals")
    op.drop_table("veille_signals")
    op.drop_index(op.f("ix_veilles_target_id"), table_name="veilles")
    op.drop_index(op.f("ix_veilles_organization_id"), table_name="veilles")
    op.drop_table("veilles")
