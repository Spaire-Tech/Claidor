"""the copy of the agents and their chats the apps read while the computer is away

Revision ID: desktop_chats_1026
Revises: users_language_1020
Create Date: 2026-10-26 12:00:00.000000

Two new tables and nothing else touched. See simeon/models/desktop.py and
simeon/desktop/chats.py.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_chats_1026"
down_revision = "users_language_1020"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_chat_agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=200), nullable=False),
        sa.Column("row", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_chat_agents_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_chat_agents_pkey")),
        sa.UniqueConstraint(
            "user_id",
            "agent_id",
            name=op.f("desktop_chat_agents_user_id_agent_id_key"),
        ),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_chat_agents_{column}"),
            "desktop_chat_agents",
            [column],
            unique=False,
        )

    op.create_table(
        "desktop_chat_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=200), nullable=False),
        sa.Column("entry_id", sa.String(length=300), nullable=False),
        sa.Column("at_ms", sa.BigInteger(), nullable=False),
        sa.Column("entry", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_chat_lines_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_chat_lines_pkey")),
        sa.UniqueConstraint(
            "user_id",
            "agent_id",
            "entry_id",
            name=op.f("desktop_chat_lines_user_id_agent_id_entry_id_key"),
        ),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_chat_lines_{column}"),
            "desktop_chat_lines",
            [column],
            unique=False,
        )
    op.create_index(
        "ix_desktop_chat_lines_user_id_agent_id_at_ms",
        "desktop_chat_lines",
        ["user_id", "agent_id", "at_ms"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("desktop_chat_lines")
    op.drop_table("desktop_chat_agents")
