"""Add course_id and lesson_id to email_sequences

Revision ID: e51c8d7a4b9c
Revises: f4d5e9b2c1a7
Create Date: 2026-05-11 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "e51c8d7a4b9c"
down_revision = "f4d5e9b2c1a7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_sequences",
        sa.Column("course_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "email_sequences",
        sa.Column("lesson_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "email_sequences_course_id_fkey",
        "email_sequences",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "email_sequences_lesson_id_fkey",
        "email_sequences",
        "course_lessons",
        ["lesson_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_email_sequences_course_id",
        "email_sequences",
        ["course_id"],
    )
    op.create_index(
        "ix_email_sequences_lesson_id",
        "email_sequences",
        ["lesson_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_sequences_lesson_id", table_name="email_sequences")
    op.drop_index("ix_email_sequences_course_id", table_name="email_sequences")
    op.drop_constraint(
        "email_sequences_lesson_id_fkey", "email_sequences", type_="foreignkey"
    )
    op.drop_constraint(
        "email_sequences_course_id_fkey", "email_sequences", type_="foreignkey"
    )
    op.drop_column("email_sequences", "lesson_id")
    op.drop_column("email_sequences", "course_id")
