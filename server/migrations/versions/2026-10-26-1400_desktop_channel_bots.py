"""an agent's own Discord or Slack bot, listened to from the server

Revision ID: desktop_channel_bots_1026
Revises: desktop_chat_inbox_1026
Create Date: 2026-10-26 14:00:00.000000

One new table and nothing else touched. See simeon/models/desktop.py
(DesktopChannelBot) and simeon/desktop/channel_bots.py.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_channel_bots_1026"
down_revision = "desktop_chat_inbox_1026"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_channel_bots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=200), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False),
        sa.Column("fingerprint", sa.String(length=128), nullable=False),
        sa.Column("secrets", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_channel_bots_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_channel_bots_pkey")),
        sa.UniqueConstraint(
            "user_id",
            "agent_id",
            "platform",
            name=op.f("desktop_channel_bots_user_id_agent_id_platform_key"),
        ),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_channel_bots_{column}"),
            "desktop_channel_bots",
            [column],
            unique=False,
        )


def downgrade() -> None:
    op.drop_table("desktop_channel_bots")
