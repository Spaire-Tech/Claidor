"""the desktop app's sign-in: auth codes, sessions, metered usage

Revision ID: desktop_sign_in_0909
Revises: house_rules_materiality_0901
Create Date: 2026-09-09 03:00:00.000000

Three new tables and nothing else touched. See polar/models/desktop.py.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_sign_in_0909"
down_revision = "house_rules_materiality_0901"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def _record_columns() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    ]


def _record_indexes(table: str) -> None:
    op.create_index(op.f(f"ix_{table}_created_at"), table, ["created_at"], unique=False)
    op.create_index(op.f(f"ix_{table}_deleted_at"), table, ["deleted_at"], unique=False)


def upgrade() -> None:
    op.create_table(
        "desktop_auth_codes",
        *_record_columns(),
        sa.Column("code_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_auth_codes_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_auth_codes_pkey")),
    )
    _record_indexes("desktop_auth_codes")
    op.create_index(
        op.f("ix_desktop_auth_codes_code_hash"),
        "desktop_auth_codes",
        ["code_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_desktop_auth_codes_expires_at"),
        "desktop_auth_codes",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_auth_codes_user_id"),
        "desktop_auth_codes",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "desktop_sessions",
        *_record_columns(),
        sa.Column("access_token_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("access_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("refresh_token_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("refresh_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=False),
        sa.Column("client_version", sa.String(length=64), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_sessions_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_sessions_pkey")),
    )
    _record_indexes("desktop_sessions")
    op.create_index(
        op.f("ix_desktop_sessions_access_token_hash"),
        "desktop_sessions",
        ["access_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_desktop_sessions_refresh_token_hash"),
        "desktop_sessions",
        ["refresh_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_desktop_sessions_refresh_expires_at"),
        "desktop_sessions",
        ["refresh_expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_sessions_user_id"),
        "desktop_sessions",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "desktop_usage",
        *_record_columns(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_creation_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("stream", sa.Boolean(), nullable=False),
        sa.Column("upstream_status", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_usage_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["desktop_sessions.id"],
            name=op.f("desktop_usage_session_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_usage_pkey")),
    )
    _record_indexes("desktop_usage")
    op.create_index(
        op.f("ix_desktop_usage_user_id"), "desktop_usage", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_desktop_usage_session_id"),
        "desktop_usage",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("desktop_usage")
    op.drop_table("desktop_sessions")
    op.drop_table("desktop_auth_codes")
