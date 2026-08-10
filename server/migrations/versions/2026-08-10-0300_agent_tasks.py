"""agent tasks and their steps

Revision ID: a71c0d94e2f5
Revises: 65b8da6b66c8
Create Date: 2026-08-10 03:00:00.000000

Hand-written, for the same reason the playbooks migration was: autogenerate
still wants to drop the pg_trgm extension and a long list of indexes and
constraints across dossiers, veilles, court_decisions and the email tables.
That is pre-existing drift between the models and this database and has
nothing to do with these two tables. Shipping it would delete working
indexes on tables this change never touches.

Only the two new tables are here.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a71c0d94e2f5"
down_revision = "65b8da6b66c8"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_tasks",
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("stopped", sa.String(length=24), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("agent_tasks_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("agent_tasks_created_by_id_fkey"),
            ondelete="restrict",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("agent_tasks_pkey")),
    )
    op.create_index(
        op.f("ix_agent_tasks_dossier_id"), "agent_tasks", ["dossier_id"], unique=False
    )
    op.create_index(
        "ix_agent_tasks_dossier_id_created_at",
        "agent_tasks",
        ["dossier_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "agent_steps",
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column(
            "arguments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("milliseconds", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["agent_tasks.id"],
            name=op.f("agent_steps_task_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("agent_steps_pkey")),
    )
    op.create_index(
        op.f("ix_agent_steps_task_id"), "agent_steps", ["task_id"], unique=False
    )
    op.create_index(
        "ix_agent_steps_task_id_ordinal",
        "agent_steps",
        ["task_id", "ordinal"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_steps_task_id_ordinal", table_name="agent_steps")
    op.drop_index(op.f("ix_agent_steps_task_id"), table_name="agent_steps")
    op.drop_table("agent_steps")
    op.drop_index("ix_agent_tasks_dossier_id_created_at", table_name="agent_tasks")
    op.drop_index(op.f("ix_agent_tasks_dossier_id"), table_name="agent_tasks")
    op.drop_table("agent_tasks")
