"""voice calls: one row per billed call, keyed by ElevenLabs' conversation id

Revision ID: desktop_voice_calls_0930
Revises: sand_box_sleep_0928
Create Date: 2026-09-30 12:00:00.000000

The app places a voice call to an agent through ElevenLabs
(`simeon/desktop/voice.py`) and tells Simeon when it hangs up. The row
written then is what makes the bill idempotent: the conversation id is
unique, so a call is billed once however many times the app says it
ended.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_voice_calls_0930"
down_revision = "sand_box_sleep_0928"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_voice_calls",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("conversation_id", sa.String(length=128), nullable=False),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("duration_source", sa.String(length=16), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_voice_calls_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["desktop_sessions.id"],
            name=op.f("desktop_voice_calls_session_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_voice_calls_pkey")),
        sa.UniqueConstraint(
            "conversation_id", name=op.f("desktop_voice_calls_conversation_id_key")
        ),
    )
    op.create_index(
        op.f("ix_desktop_voice_calls_user_id"), "desktop_voice_calls", ["user_id"]
    )
    op.create_index(
        op.f("ix_desktop_voice_calls_session_id"), "desktop_voice_calls", ["session_id"]
    )
    op.create_index(
        op.f("ix_desktop_voice_calls_created_at"), "desktop_voice_calls", ["created_at"]
    )
    op.create_index(
        op.f("ix_desktop_voice_calls_deleted_at"), "desktop_voice_calls", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_desktop_voice_calls_deleted_at"), table_name="desktop_voice_calls"
    )
    op.drop_index(
        op.f("ix_desktop_voice_calls_created_at"), table_name="desktop_voice_calls"
    )
    op.drop_index(
        op.f("ix_desktop_voice_calls_session_id"), table_name="desktop_voice_calls"
    )
    op.drop_index(
        op.f("ix_desktop_voice_calls_user_id"), table_name="desktop_voice_calls"
    )
    op.drop_table("desktop_voice_calls")
