"""a deal's files can live somewhere else

Revision ID: f2a6b9c04d13
Revises: d3b7c1e58a24
Create Date: 2026-08-11 01:00:00.000000

`connections` is one person's delegated access to a file store — their
token, their permissions, their name on it. Not the organization's: an
application-level grant needs a tenant administrator, and a product that
cannot be tried until IT approves it is a product nobody tries.

`connected_folders` is where a deal's documents actually are, by drive id
and item id rather than by path, because a path is a name somebody changes
on a Friday.

`tieout_artifacts.external_id` is the thing the roadmap promised: a drive
item id beats a filename guess. Two files called `Model.xlsx` in different
folders stop being one document, and a rename stops starting a second one.

Hand-written, for the reason the last six were: autogenerate wants to drop
pg_trgm and several unrelated indexes it did not create.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "f2a6b9c04d13"
down_revision = "d3b7c1e58a24"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("account_name", sa.String(length=320), nullable=False),
        sa.Column("account_email", sa.String(length=320), nullable=False),
        sa.Column("tenant", sa.String(length=128), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "scopes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_connections_organization_provider",
        "connections",
        ["organization_id", "provider"],
    )
    op.create_index(
        op.f("ix_connections_organization_id"), "connections", ["organization_id"]
    )
    op.create_index(op.f("ix_connections_user_id"), "connections", ["user_id"])
    op.create_index(op.f("ix_connections_status"), "connections", ["status"])

    op.create_table(
        "connected_folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("drive_id", sa.String(length=512), nullable=False),
        sa.Column("item_id", sa.String(length=512), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("site_name", sa.String(length=512), nullable=False),
        sa.Column("last_synced_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "last_result",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(
            ["connection_id"], ["connections.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dossier_id", name="uq_connected_folders_dossier"),
    )
    op.create_index(
        op.f("ix_connected_folders_dossier_id"), "connected_folders", ["dossier_id"]
    )
    op.create_index(
        op.f("ix_connected_folders_connection_id"),
        "connected_folders",
        ["connection_id"],
    )

    op.add_column(
        "tieout_artifacts",
        sa.Column("external_id", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "tieout_artifacts",
        sa.Column("external_version", sa.String(length=512), nullable=True),
    )
    op.create_index(
        op.f("ix_tieout_artifacts_external_id"), "tieout_artifacts", ["external_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tieout_artifacts_external_id"), "tieout_artifacts")
    op.drop_column("tieout_artifacts", "external_version")
    op.drop_column("tieout_artifacts", "external_id")
    op.drop_table("connected_folders")
    op.drop_table("connections")
