"""Add avatar_url column to customers + merge open heads

Picks a unique revision id (the previous one collided with
`stub_a6b7c8d9e0f1.py`) and merges the two pre-existing heads
(`c8d9e0f1g2h3` from the stub chain, `c9d4a8e1f273` from the
community-timestamps heal) so `alembic upgrade head` lands on a
single tip again.

Revision ID: cust_avatar_525
Revises: c8d9e0f1g2h3, c9d4a8e1f273
Create Date: 2026-05-25 17:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "cust_avatar_525"
down_revision = ("c8d9e0f1g2h3", "c9d4a8e1f273")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("avatar_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customers", "avatar_url")
