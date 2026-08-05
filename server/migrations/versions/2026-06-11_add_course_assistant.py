"""Add Course Assistant (Office Hours TA)

Revision ID: course_assistant_611
Revises: cpsi_signin_theme_618
Create Date: 2026-06-11 00:00:00.000000

Adds:
- the `course_assistants` table (one per course): the AI version of the
  creator, with a draft snapshot (latest build, awaiting review) kept separate
  from the approved serving snapshot so a rebuild never silently serves
  un-reviewed content to students.
- `transcript` / `transcript_status` columns on `course_lessons`, populated
  from Mux auto-generated captions and used as the assistant's knowledge base.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "course_assistant_611"
down_revision = "cpsi_signin_theme_618"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_assistants",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'building'"),
        ),
        sa.Column(
            "live",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("disclaimer", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("knowledge_base", sa.Text(), nullable=True),
        sa.Column("voice_card", sa.Text(), nullable=True),
        sa.Column(
            "sample_questions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("knowledge_base_tokens", sa.Integer(), nullable=True),
        sa.Column("source_lesson_count", sa.Integer(), nullable=True),
        sa.Column("draft_knowledge_base", sa.Text(), nullable=True),
        sa.Column("draft_voice_card", sa.Text(), nullable=True),
        sa.Column(
            "draft_sample_questions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("draft_knowledge_base_tokens", sa.Integer(), nullable=True),
        sa.Column("draft_source_lesson_count", sa.Integer(), nullable=True),
        sa.Column("draft_built_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("course_assistants_course_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("course_assistants_organization_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_user_id"],
            ["users.id"],
            name=op.f("course_assistants_approved_by_user_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("course_assistants_pkey")),
    )
    op.create_index(
        op.f("ix_course_assistants_course_id"),
        "course_assistants",
        ["course_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_course_assistants_organization_id"),
        "course_assistants",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistants_created_at"),
        "course_assistants",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_assistants_deleted_at"),
        "course_assistants",
        ["deleted_at"],
        unique=False,
    )

    op.add_column("course_lessons", sa.Column("transcript", sa.Text(), nullable=True))
    op.add_column(
        "course_lessons",
        sa.Column("transcript_status", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("course_lessons", "transcript_status")
    op.drop_column("course_lessons", "transcript")

    op.drop_index(
        op.f("ix_course_assistants_deleted_at"), table_name="course_assistants"
    )
    op.drop_index(
        op.f("ix_course_assistants_created_at"), table_name="course_assistants"
    )
    op.drop_index(
        op.f("ix_course_assistants_organization_id"),
        table_name="course_assistants",
    )
    op.drop_index(
        op.f("ix_course_assistants_course_id"), table_name="course_assistants"
    )
    op.drop_table("course_assistants")
