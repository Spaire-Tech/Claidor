"""Add Mux video fields to course_lessons

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-24 17:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "c3d4e5f6g7h8"
down_revision = "b2c3d4e5f6g7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_lessons",
        sa.Column("mux_upload_id", sa.String(255), nullable=True, default=None),
    )
    op.add_column(
        "course_lessons",
        sa.Column("mux_asset_id", sa.String(255), nullable=True, default=None),
    )
    op.add_column(
        "course_lessons",
        sa.Column("mux_playback_id", sa.String(255), nullable=True, default=None),
    )
    op.add_column(
        "course_lessons",
        sa.Column("mux_status", sa.String(20), nullable=True, default=None),
    )
    op.create_index(
        "ix_course_lessons_mux_upload_id",
        "course_lessons",
        ["mux_upload_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_course_lessons_mux_upload_id", "course_lessons")
    op.drop_column("course_lessons", "mux_status")
    op.drop_column("course_lessons", "mux_playback_id")
    op.drop_column("course_lessons", "mux_asset_id")
    op.drop_column("course_lessons", "mux_upload_id")
