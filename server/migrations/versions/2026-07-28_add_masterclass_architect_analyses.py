"""Add masterclass_architect_analyses

Revision ID: mc_architect_728
Revises: lesson_ai_draft_725
Create Date: 2026-07-28 00:00:00.000000

One row per Masterclass Architect run over a pasted channel: the resolved
channel snapshot (instant confirmation), the fast-pass mirror, the gated
proposals, the optional creator FAQ answer, and typed status/failure for
the wizard's fork. Derived conclusions only — no raw YouTube data.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "mc_architect_728"
down_revision = "lesson_ai_draft_725"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "masterclass_architect_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("input_ref", sa.String(length=500), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="queued"
        ),
        sa.Column("failure_reason", sa.String(length=30), nullable=True),
        sa.Column("external_channel_id", sa.String(length=40), nullable=True),
        sa.Column("channel", postgresql.JSONB(), nullable=True),
        sa.Column("faq_answer", sa.Text(), nullable=True),
        sa.Column("mirror", postgresql.JSONB(), nullable=True),
        sa.Column("proposals", postgresql.JSONB(), nullable=True),
        sa.Column("recipe_version", sa.String(length=40), nullable=True),
        sa.Column(
            "receipt_violation_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("mirror_ready_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("masterclass_architect_analyses_organization_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("masterclass_architect_analyses_pkey")),
    )
    op.create_index(
        op.f("ix_masterclass_architect_analyses_organization_id"),
        "masterclass_architect_analyses",
        ["organization_id"],
    )
    op.create_index(
        op.f("ix_masterclass_architect_analyses_status"),
        "masterclass_architect_analyses",
        ["status"],
    )
    op.create_index(
        op.f("ix_masterclass_architect_analyses_external_channel_id"),
        "masterclass_architect_analyses",
        ["external_channel_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_masterclass_architect_analyses_external_channel_id"),
        table_name="masterclass_architect_analyses",
    )
    op.drop_index(
        op.f("ix_masterclass_architect_analyses_status"),
        table_name="masterclass_architect_analyses",
    )
    op.drop_index(
        op.f("ix_masterclass_architect_analyses_organization_id"),
        table_name="masterclass_architect_analyses",
    )
    op.drop_table("masterclass_architect_analyses")
