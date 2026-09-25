"""sharing: rooms, members, join requests and the per-person event queue

Revision ID: desktop_share_rooms_0925
Revises: desktop_box_credential_0925
Create Date: 2026-09-25 15:00:00.000000

The state behind `/sand/xuser/*`, `/sand/share-rooms/*` and
`/sand/share-state`, which the app's cross-user sharing extension speaks
(`docs/product/sharing-served.md`). Invite links are signed tokens and
have no table.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_share_rooms_0925"
down_revision = "sand_listeners_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_share_rooms",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("host_user_id", sa.Uuid(), nullable=False),
        sa.Column("avatar_data_url", sa.Text(), nullable=True),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["host_user_id"],
            ["users.id"],
            name=op.f("desktop_share_rooms_host_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_share_rooms_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_share_rooms_host_user_id"),
        "desktop_share_rooms",
        ["host_user_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_rooms_created_at"),
        "desktop_share_rooms",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_share_rooms_deleted_at"),
        "desktop_share_rooms",
        ["deleted_at"],
    )

    op.create_table(
        "desktop_share_room_members",
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("agent_id", sa.String(length=200), nullable=True),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("avatar_data_url", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["desktop_share_rooms.id"],
            name=op.f("desktop_share_room_members_room_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_share_room_members_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_share_room_members_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_share_room_members_room_id"),
        "desktop_share_room_members",
        ["room_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_room_members_user_id"),
        "desktop_share_room_members",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_room_members_created_at"),
        "desktop_share_room_members",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_share_room_members_deleted_at"),
        "desktop_share_room_members",
        ["deleted_at"],
    )

    op.create_table(
        "desktop_share_join_requests",
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("requester_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("decided_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["desktop_share_rooms.id"],
            name=op.f("desktop_share_join_requests_room_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["requester_user_id"],
            ["users.id"],
            name=op.f("desktop_share_join_requests_requester_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_share_join_requests_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_share_join_requests_room_id"),
        "desktop_share_join_requests",
        ["room_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_join_requests_requester_user_id"),
        "desktop_share_join_requests",
        ["requester_user_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_join_requests_created_at"),
        "desktop_share_join_requests",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_share_join_requests_deleted_at"),
        "desktop_share_join_requests",
        ["deleted_at"],
    )

    op.create_table(
        "desktop_share_events",
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_share_events_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_share_events_pkey")),
        sa.UniqueConstraint("seq", name=op.f("desktop_share_events_seq_key")),
    )
    op.create_index(
        op.f("ix_desktop_share_events_user_id"),
        "desktop_share_events",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_desktop_share_events_created_at"),
        "desktop_share_events",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_desktop_share_events_deleted_at"),
        "desktop_share_events",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_table("desktop_share_events")
    op.drop_table("desktop_share_join_requests")
    op.drop_table("desktop_share_room_members")
    op.drop_table("desktop_share_rooms")
