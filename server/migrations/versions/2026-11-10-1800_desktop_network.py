"""the Simeon Network: networks, their people, agents' sessions, messages

Revision ID: desktop_network_1110
Revises: desktop_key_models_1110
Create Date: 2026-11-10 18:00:00.000000

Four new tables and nothing else touched. See
simeon/models/desktop_network.py and simeon/desktop/network.py.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_network_1110"
down_revision = "desktop_key_models_1110"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def _record() -> list[sa.Column]:  # type: ignore[type-arg]
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "desktop_networks",
        *_record(),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("invite_version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("desktop_networks_created_by_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_networks_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_networks_created_at"), "desktop_networks", ["created_at"]
    )
    op.create_index(
        op.f("ix_desktop_networks_deleted_at"), "desktop_networks", ["deleted_at"]
    )

    op.create_table(
        "desktop_network_members",
        *_record(),
        sa.Column("network_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("handle", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(
            ["network_id"],
            ["desktop_networks.id"],
            name=op.f("desktop_network_members_network_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_network_members_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_network_members_pkey")),
        sa.UniqueConstraint(
            "network_id",
            "handle",
            name=op.f("desktop_network_members_network_id_handle_key"),
        ),
        sa.UniqueConstraint(
            "user_id", name=op.f("desktop_network_members_user_id_key")
        ),
    )
    op.create_index(
        op.f("ix_desktop_network_members_network_id"),
        "desktop_network_members",
        ["network_id"],
    )
    op.create_index(
        op.f("ix_desktop_network_members_created_at"),
        "desktop_network_members",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_network_members_deleted_at"),
        "desktop_network_members",
        ["deleted_at"],
    )

    op.create_table(
        "desktop_network_sessions",
        *_record(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.String(length=100), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("machine", sa.String(length=80), nullable=True),
        sa.Column("repo", sa.String(length=120), nullable=True),
        sa.Column("branch", sa.String(length=120), nullable=True),
        sa.Column("doing", sa.String(length=200), nullable=True),
        sa.Column("busy", sa.Boolean(), nullable=False),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_network_sessions_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_network_sessions_pkey")),
    )
    op.create_index(
        "ix_desktop_network_sessions_user_seen",
        "desktop_network_sessions",
        ["user_id", "last_seen_at"],
    )
    op.create_index(
        op.f("ix_desktop_network_sessions_created_at"),
        "desktop_network_sessions",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_network_sessions_deleted_at"),
        "desktop_network_sessions",
        ["deleted_at"],
    )

    op.create_table(
        "desktop_network_messages",
        *_record(),
        sa.Column("network_id", sa.Uuid(), nullable=False),
        sa.Column("from_user_id", sa.Uuid(), nullable=False),
        sa.Column("from_session_id", sa.Uuid(), nullable=True),
        sa.Column("from_agent_id", sa.String(length=200), nullable=True),
        sa.Column("from_address", sa.String(length=120), nullable=False),
        sa.Column("to_user_id", sa.Uuid(), nullable=False),
        sa.Column("to_session_id", sa.Uuid(), nullable=True),
        sa.Column("to_agent_id", sa.String(length=200), nullable=True),
        sa.Column("to_address", sa.String(length=120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("nonce", sa.String(length=200), nullable=True),
        sa.Column("reply_to_id", sa.Uuid(), nullable=True),
        sa.Column("read_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("answered_ms", sa.BigInteger(), nullable=True),
        sa.Column("closed", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["network_id"],
            ["desktop_networks.id"],
            name=op.f("desktop_network_messages_network_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["from_user_id"],
            ["users.id"],
            name=op.f("desktop_network_messages_from_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["from_session_id"],
            ["desktop_network_sessions.id"],
            name=op.f("desktop_network_messages_from_session_id_fkey"),
            ondelete="set null",
        ),
        sa.ForeignKeyConstraint(
            ["to_user_id"],
            ["users.id"],
            name=op.f("desktop_network_messages_to_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["to_session_id"],
            ["desktop_network_sessions.id"],
            name=op.f("desktop_network_messages_to_session_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_network_messages_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_network_messages_network_id"),
        "desktop_network_messages",
        ["network_id"],
    )
    op.create_index(
        op.f("ix_desktop_network_messages_to_user_id"),
        "desktop_network_messages",
        ["to_user_id"],
    )
    op.create_index(
        "ix_desktop_network_messages_to_session",
        "desktop_network_messages",
        ["to_session_id", "read_at"],
    )
    op.create_index(
        "ix_desktop_network_messages_from_session",
        "desktop_network_messages",
        ["from_session_id"],
    )
    op.create_index(
        op.f("ix_desktop_network_messages_created_at"),
        "desktop_network_messages",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_network_messages_deleted_at"),
        "desktop_network_messages",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_table("desktop_network_messages")
    op.drop_table("desktop_network_sessions")
    op.drop_table("desktop_network_members")
    op.drop_table("desktop_networks")
