"""Add preview_text to email_broadcasts

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-05-05 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "q6r7s8t9u0v1"
down_revision = "p5q6r7s8t9u0"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_broadcasts",
        sa.Column("preview_text", sa.String(150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("email_broadcasts", "preview_text")
