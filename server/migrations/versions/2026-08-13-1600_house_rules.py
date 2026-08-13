"""how the firm wants Pierce to behave, one row per organization

Revision ID: a1c5e7b93d42
Revises: f2b6d4a89c31
Create Date: 2026-08-13 16:00:00.000000

One table: `tieout_house_rules` — rounding display policy, the firm's
number-writing conventions, whether the grounding pass runs, and which
audit rules are switched off. Policy, not state: a missing row is the
defaults, so nothing is backfilled and nothing changes for anyone until
somebody decides something.

Hand-written, as every migration here is: autogenerate wants to drop
pg_trgm and cannot be trusted with this schema.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a1c5e7b93d42"
down_revision = "f2b6d4a89c31"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tieout_house_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column(
            "rounding", sa.String(length=16), nullable=False, server_default="together"
        ),
        sa.Column(
            "writing",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("grounding", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "audit_rules_off",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", name="uq_tieout_house_rules_organization"
        ),
    )
    op.create_index(
        "ix_tieout_house_rules_organization_id",
        "tieout_house_rules",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tieout_house_rules_organization_id", table_name="tieout_house_rules"
    )
    op.drop_table("tieout_house_rules")
