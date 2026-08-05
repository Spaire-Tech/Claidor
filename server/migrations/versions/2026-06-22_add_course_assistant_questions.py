"""Add Course Assistant question log (Phase 5 — "What students are asking")

Revision ID: ca_questions_622
Revises: course_assistant_611
Create Date: 2026-06-22 00:00:00.000000

Adds the `course_assistant_questions` table: an append-only log of the
questions students ask a course's live assistant, with the outcome
(answered / refused / error). The creator's Assistant tab groups these by
`question_normalized` to surface the most-asked questions and how many the
assistant couldn't answer (a content-gap signal).

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "ca_questions_622"
down_revision = "course_assistant_611"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_assistant_questions",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("question_normalized", sa.String(length=500), nullable=False),
        sa.Column(
            "outcome",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'answered'"),
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("course_assistant_questions_course_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("course_assistant_questions_organization_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("course_assistant_questions_customer_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("course_assistant_questions_pkey")),
    )
    op.create_index(
        op.f("ix_course_assistant_questions_course_id"),
        "course_assistant_questions",
        ["course_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistant_questions_organization_id"),
        "course_assistant_questions",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistant_questions_customer_id"),
        "course_assistant_questions",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistant_questions_question_normalized"),
        "course_assistant_questions",
        ["question_normalized"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistant_questions_created_at"),
        "course_assistant_questions",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistant_questions_deleted_at"),
        "course_assistant_questions",
        ["deleted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_course_assistant_questions_deleted_at"),
        table_name="course_assistant_questions",
    )
    op.drop_index(
        op.f("ix_course_assistant_questions_created_at"),
        table_name="course_assistant_questions",
    )
    op.drop_index(
        op.f("ix_course_assistant_questions_question_normalized"),
        table_name="course_assistant_questions",
    )
    op.drop_index(
        op.f("ix_course_assistant_questions_customer_id"),
        table_name="course_assistant_questions",
    )
    op.drop_index(
        op.f("ix_course_assistant_questions_organization_id"),
        table_name="course_assistant_questions",
    )
    op.drop_index(
        op.f("ix_course_assistant_questions_course_id"),
        table_name="course_assistant_questions",
    )
    op.drop_table("course_assistant_questions")
