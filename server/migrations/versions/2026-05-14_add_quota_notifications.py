"""Add quota_notifications table

Revision ID: 8bc4d3e9f0a2
Revises: 7af3c2b8e9d1
Create Date: 2026-05-14 14:30:00.000000

Tracks the last time each (organization, quota_key, threshold) crossed
its notification threshold, scoped to a period_key. period_key is the
calendar month "YYYY-MM" for monthly quotas and the constant "lifetime"
for lifetime quotas. The cron task uses presence of a row to know
whether it has already notified for this crossing and avoids duplicate
emails on subsequent runs.

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "8bc4d3e9f0a2"
down_revision = "7af3c2b8e9d1"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quota_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("quota_key", sa.String(length=64), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("period_key", sa.String(length=16), nullable=False),
        sa.Column(
            "sent_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "quota_key",
            "threshold",
            "period_key",
            name="uq_quota_notifications_org_quota_threshold_period",
        ),
    )
    op.create_index(
        "ix_quota_notifications_organization_id",
        "quota_notifications",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_quota_notifications_organization_id",
        table_name="quota_notifications",
    )
    op.drop_table("quota_notifications")
