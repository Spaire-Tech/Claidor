"""Add timezone column to email_subscribers

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-05-07 13:00:00.000000

Best-effort IANA timezone for each subscriber. When set and the parent
sequence's send-window opts into respect_timezone, send deferrals are
computed in this tz; NULL falls back to UTC.
"""

import sqlalchemy as sa
from alembic import op

revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_subscribers",
        sa.Column("timezone", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("email_subscribers", "timezone")
