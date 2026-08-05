"""Add bell_enabled to customer_notification_preferences

Customers can already toggle the email channel; this migration adds a
parallel `bell_enabled` toggle so they can also silence in-portal
notification badges without losing emails (or vice versa).

Defaults to TRUE so existing customers keep their current behavior
(bells always fired) until they choose otherwise.

Revision ID: cnp_bell_526
Revises: actsub_mux_526
Create Date: 2026-05-26 19:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "cnp_bell_526"
down_revision = "actsub_mux_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customer_notification_preferences",
        sa.Column(
            "bell_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("customer_notification_preferences", "bell_enabled")
