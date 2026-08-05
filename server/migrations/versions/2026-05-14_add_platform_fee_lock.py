"""Add platform_fee_locked_at column to accounts

Revision ID: 7af3c2b8e9d1
Revises: g2n3o4p5q6r7
Create Date: 2026-05-14 12:00:00.000000

When set, Account platform fee is treated as manually negotiated and the
tier-sync job will skip it. Used for Scale customers with bespoke rates
that differ from the public tier list price.

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "7af3c2b8e9d1"
down_revision = "g2n3o4p5q6r7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "platform_fee_locked_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "platform_fee_locked_at")
