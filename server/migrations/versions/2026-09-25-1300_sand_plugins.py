"""the skill registry: published plugins and per-person switches

Revision ID: sand_plugins_0925
Revises: desktop_box_credential_0925
Create Date: 2026-09-25 13:00:00.000000

Two tables behind `aiserver.v1.DashboardService`'s PublishPlugin /
UnpublishPlugin / GetEffectiveUserPlugins (`polar.sand.skill_registry`):
`sand_plugins`, one row per published plugin (personal when
`organization_id` is null, a team's otherwise), and
`sand_plugin_user_settings`, one person's on/off switch for one plugin.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "sand_plugins_0925"
down_revision = "sand_boxes_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sand_plugins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "numeric_id", sa.BigInteger(), sa.Identity(start=1000), nullable=False
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("commit_sha", sa.String(length=40), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("updated_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("inline_content_json", sa.Text(), nullable=False),
        sa.Column("tar_gz_key", sa.Text(), nullable=True),
        sa.Column("commit_message", sa.Text(), nullable=False),
        sa.Column("unpublished_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("sand_plugins_owner_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("sand_plugins_organization_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("sand_plugins_pkey")),
    )
    op.create_index(
        op.f("ix_sand_plugins_numeric_id"), "sand_plugins", ["numeric_id"], unique=True
    )
    op.create_index(op.f("ix_sand_plugins_name"), "sand_plugins", ["name"])
    op.create_index(
        op.f("ix_sand_plugins_owner_user_id"), "sand_plugins", ["owner_user_id"]
    )
    op.create_index(
        op.f("ix_sand_plugins_organization_id"), "sand_plugins", ["organization_id"]
    )
    op.create_index(op.f("ix_sand_plugins_created_at"), "sand_plugins", ["created_at"])
    op.create_index(op.f("ix_sand_plugins_deleted_at"), "sand_plugins", ["deleted_at"])

    op.create_table(
        "sand_plugin_user_settings",
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("plugin_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plugin_id"],
            ["sand_plugins.id"],
            name=op.f("sand_plugin_user_settings_plugin_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("sand_plugin_user_settings_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint(
            "plugin_id", "user_id", name=op.f("sand_plugin_user_settings_pkey")
        ),
    )
    op.create_index(
        op.f("ix_sand_plugin_user_settings_created_at"),
        "sand_plugin_user_settings",
        ["created_at"],
    )
    op.create_index(
        op.f("ix_sand_plugin_user_settings_deleted_at"),
        "sand_plugin_user_settings",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_table("sand_plugin_user_settings")
    op.drop_table("sand_plugins")
