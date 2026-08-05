"""Add organization_custom_domains

Revision ID: org_domain_707
Revises: ca_cues_627
Create Date: 2026-07-07 00:00:00.000000

Creates ``organization_custom_domains``: one creator-owned storefront
domain per organization (e.g. learn.creator.com), with a TXT verification
token and a pending/active/failed lifecycle. Upstream Polar removed the old
``organizations.custom_domain`` column in 2024; this reintroduces the
feature as its own table so multiple domains per org stay possible later.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "org_domain_707"
down_revision = "ca_cues_627"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_custom_domains",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("domain", postgresql.CITEXT(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("verification_token", sa.String(length=64), nullable=False),
        sa.Column("verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("organization_custom_domains_organization_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("organization_custom_domains_pkey")),
        sa.UniqueConstraint(
            "organization_id",
            name=op.f("organization_custom_domains_organization_id_key"),
        ),
        sa.UniqueConstraint(
            "domain", name=op.f("organization_custom_domains_domain_key")
        ),
    )
    op.create_index(
        op.f("ix_organization_custom_domains_created_at"),
        "organization_custom_domains",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_custom_domains_deleted_at"),
        "organization_custom_domains",
        ["deleted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_organization_custom_domains_deleted_at"),
        table_name="organization_custom_domains",
    )
    op.drop_index(
        op.f("ix_organization_custom_domains_created_at"),
        table_name="organization_custom_domains",
    )
    op.drop_table("organization_custom_domains")
