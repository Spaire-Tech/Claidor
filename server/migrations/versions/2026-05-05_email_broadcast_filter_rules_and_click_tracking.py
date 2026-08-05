"""Custom segment filters + click URL & user-agent tracking on broadcast sends

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-05-05 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "r7s8t9u0v1w2"
down_revision = "q6r7s8t9u0v1"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_broadcasts",
        sa.Column(
            "filter_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "email_broadcast_sends",
        sa.Column(
            "clicked_links",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "email_broadcast_sends",
        sa.Column("last_user_agent", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("email_broadcast_sends", "last_user_agent")
    op.drop_column("email_broadcast_sends", "clicked_links")
    op.drop_column("email_broadcasts", "filter_rules")
