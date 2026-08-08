"""Saved prompts for the cabinet

Revision ID: saved_prompts_0808
Revises: librarian_questions_0808
Create Date: 2026-08-08 03:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "saved_prompts_0808"
down_revision = "librarian_questions_0808"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_prompts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_saved_prompts_organization_id"),
        "saved_prompts",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_saved_prompts_organization_id"), table_name="saved_prompts"
    )
    op.drop_table("saved_prompts")
