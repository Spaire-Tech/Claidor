"""a person's Link connection, held by the server

Revision ID: desktop_link_wallets_1017
Revises: sand_box_host_meta_1016
Create Date: 2026-10-17 12:00:00.000000

Link, Stripe's agent wallet, signs in through Simeon Labs' own OAuth
client since 17 October 2026 (`simeon.desktop.link_wallet`): one row per
person with Link's access and refresh tokens, both sealed.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_link_wallets_1017"
down_revision = "sand_box_host_meta_1016"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_link_wallets",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column(
            "authorization_details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_link_wallets_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_link_wallets_pkey")),
        sa.UniqueConstraint("user_id", name=op.f("desktop_link_wallets_user_id_key")),
    )
    for column in ("user_id", "created_at", "deleted_at"):
        op.create_index(
            op.f(f"ix_desktop_link_wallets_{column}"),
            "desktop_link_wallets",
            [column],
            unique=False,
        )


def downgrade() -> None:
    for column in ("user_id", "created_at", "deleted_at"):
        op.drop_index(
            op.f(f"ix_desktop_link_wallets_{column}"),
            table_name="desktop_link_wallets",
        )
    op.drop_table("desktop_link_wallets")
