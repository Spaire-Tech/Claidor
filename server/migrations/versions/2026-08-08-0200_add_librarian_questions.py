"""Keep questions asked outside a dossier

Revision ID: librarian_questions_0808
Revises: decision_kind_0808
Create Date: 2026-08-08 02:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "librarian_questions_0808"
down_revision = "decision_kind_0808"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "librarian_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("versions_used", postgresql.JSONB(), nullable=True),
        sa.Column("authority_label", sa.Text(), nullable=True),
        sa.Column("authority_count", sa.Integer(), nullable=True),
        sa.Column("answered_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_librarian_questions_user_id"),
        "librarian_questions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_librarian_questions_organization_id"),
        "librarian_questions",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_librarian_questions_created_at"),
        "librarian_questions",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_librarian_questions_created_at"), table_name="librarian_questions"
    )
    op.drop_index(
        op.f("ix_librarian_questions_organization_id"),
        table_name="librarian_questions",
    )
    op.drop_index(
        op.f("ix_librarian_questions_user_id"), table_name="librarian_questions"
    )
    op.drop_table("librarian_questions")
