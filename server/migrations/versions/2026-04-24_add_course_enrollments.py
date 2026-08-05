"""Add course_enrollments table and course_access benefit type

Revision ID: e3f7a1b2c9d5
Revises: d6e0f1a5b9c7
Create Date: 2026-04-24 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e3f7a1b2c9d5"
down_revision = "d6e0f1a5b9c7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # Add course_access to benefittype enum only if the type already exists.
    # On fresh environments that don't yet have the benefit system, skip this —
    # the BenefitType.course_access StrEnum value is enough for Python-side validation.
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'benefittype') THEN
                ALTER TYPE benefittype ADD VALUE IF NOT EXISTS 'course_access';
            END IF;
        END $$;
    """)

    # course_enrollments table
    op.create_table(
        "course_enrollments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("enrolled_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name="course_enrollments_customer_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name="course_enrollments_course_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="course_enrollments_product_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="course_enrollments_pkey"),
    )
    op.create_index(
        "ix_course_enrollments_customer_id", "course_enrollments", ["customer_id"]
    )
    op.create_index(
        "ix_course_enrollments_course_id", "course_enrollments", ["course_id"]
    )
    op.create_index(
        "ix_course_enrollments_product_id", "course_enrollments", ["product_id"]
    )
    op.create_index(
        "ix_course_enrollments_created_at", "course_enrollments", ["created_at"]
    )
    op.create_index(
        "ix_course_enrollments_deleted_at", "course_enrollments", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_table("course_enrollments")
    # NOTE: PostgreSQL does not support removing enum values without recreating the type
