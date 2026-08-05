"""Add thumbnail_url to course_lessons

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-04-25 07:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "e5f6g7h8i9j0"
down_revision = "d4e5f6g7h8i9"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_lessons",
        sa.Column("thumbnail_url", sa.String(2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("course_lessons", "thumbnail_url")
