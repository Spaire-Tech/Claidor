"""Phase 0: add slug/paywall_position to courses; status/release_at/drip_days to modules

Revision ID: a1b2c3d4e5f7
Revises: f4g8h2i6j0k3
Create Date: 2026-04-24 15:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f7"
down_revision = "f4g8h2i6j0k3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("slug", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "courses",
        sa.Column("paywall_position", sa.Integer(), nullable=True),
    )
    op.create_index("ix_courses_slug", "courses", ["slug"])

    op.add_column(
        "course_modules",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="draft",
        ),
    )
    op.add_column(
        "course_modules",
        sa.Column(
            "release_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "course_modules",
        sa.Column("drip_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("course_modules", "drip_days")
    op.drop_column("course_modules", "release_at")
    op.drop_column("course_modules", "status")
    op.drop_index("ix_courses_slug", table_name="courses")
    op.drop_column("courses", "paywall_position")
    op.drop_column("courses", "slug")
