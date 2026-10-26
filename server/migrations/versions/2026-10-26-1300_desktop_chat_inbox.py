"""messages for an agent waiting on the server for the person's computer

Revision ID: desktop_chat_inbox_1026
Revises: desktop_chats_1026
Create Date: 2026-10-26 13:00:00.000000

One new table and nothing else touched. See simeon/models/desktop.py
(DesktopChatInbox) and simeon/desktop/chats.py.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_chat_inbox_1026"
down_revision = "desktop_chats_1026"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_chat_inbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=200), nullable=False),
        sa.Column("nonce", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("message", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_chat_inbox_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_chat_inbox_pkey")),
        sa.UniqueConstraint(
            "user_id",
            "nonce",
            name=op.f("desktop_chat_inbox_user_id_nonce_key"),
        ),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_chat_inbox_{column}"),
            "desktop_chat_inbox",
            [column],
            unique=False,
        )


def downgrade() -> None:
    op.drop_table("desktop_chat_inbox")
