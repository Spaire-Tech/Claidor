"""the person's computer in the cloud: one box row per person

Revision ID: sand_boxes_0925
Revises: desktop_box_credential_0925
Create Date: 2026-09-25 15:00:00.000000

`sand_boxes` is what `aiserver.v1.GrokBotService/EnsureSandBox` answers
from (`polar.sand.box_broker`): which box host runs the person's box,
where its ports were published, the gateway and network tokens the app
is handed, and the box credential injected into the container. See
`polar.models.sand_box`.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "sand_boxes_0925"
down_revision = "sand_cloud_agents_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sand_boxes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_box_id", sa.String(256), nullable=False),
        sa.Column("host_address", sa.String(256), nullable=False),
        sa.Column(
            "ports",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("gateway_token", sa.Text(), nullable=False),
        sa.Column("network_token", sa.Text(), nullable=False),
        sa.Column("gateway_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("vnc_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("fork_vnc_base_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("state", sa.String(16), nullable=False, server_default="absent"),
        sa.Column("image", sa.Text(), nullable=False, server_default=""),
        sa.Column("image_digest", sa.Text(), nullable=True),
        sa.Column(
            "credential_session_id",
            sa.Uuid(),
            sa.ForeignKey("desktop_sessions.id", ondelete="set null"),
            nullable=True,
        ),
        sa.Column("last_ensured_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sand_boxes_user_id", "sand_boxes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_sand_boxes_user_id", table_name="sand_boxes")
    op.drop_table("sand_boxes")
