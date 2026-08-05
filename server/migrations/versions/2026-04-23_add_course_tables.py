"""Add course tables and product_type column

Revision ID: c5d9e2f0a4b8
Revises: b4c8d2e3f601
Create Date: 2026-04-23 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "c5d9e2f0a4b8"
down_revision = "c8f1e4a6d702"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # Add product_type to products
    op.add_column(
        "products",
        sa.Column(
            "product_type",
            sa.Text(),
            nullable=False,
            server_default="digital",
        ),
    )

    # courses table
    op.create_table(
        "courses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column(
            "course_type",
            sa.String(length=50),
            nullable=False,
            server_default="evergreen",
        ),
        sa.Column("paywall_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("paywall_lesson_id", sa.Uuid(), nullable=True),
        sa.Column("ai_generated", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name="courses_organization_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="courses_product_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="courses_pkey"),
        sa.UniqueConstraint("product_id", name="courses_product_id_key"),
    )
    op.create_index("ix_courses_created_at", "courses", ["created_at"])
    op.create_index("ix_courses_deleted_at", "courses", ["deleted_at"])
    op.create_index("ix_courses_organization_id", "courses", ["organization_id"])
    op.create_index("ix_courses_product_id", "courses", ["product_id"])

    # course_modules table
    op.create_table(
        "course_modules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name="course_modules_course_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="course_modules_pkey"),
    )
    op.create_index("ix_course_modules_course_id", "course_modules", ["course_id"])
    op.create_index("ix_course_modules_created_at", "course_modules", ["created_at"])
    op.create_index("ix_course_modules_deleted_at", "course_modules", ["deleted_at"])

    # course_lessons table
    op.create_table(
        "course_lessons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=50),
            nullable=False,
            server_default="text",
        ),
        sa.Column("content", postgresql.JSONB(), nullable=True),
        sa.Column("video_asset_id", sa.String(length=255), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(
            ["module_id"],
            ["course_modules.id"],
            name="course_lessons_module_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="course_lessons_pkey"),
    )
    op.create_index("ix_course_lessons_module_id", "course_lessons", ["module_id"])
    op.create_index("ix_course_lessons_created_at", "course_lessons", ["created_at"])
    op.create_index("ix_course_lessons_deleted_at", "course_lessons", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("course_lessons")
    op.drop_table("course_modules")
    op.drop_table("courses")
    op.drop_column("products", "product_type")
