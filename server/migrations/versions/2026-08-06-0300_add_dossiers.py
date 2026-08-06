"""Add dossiers: per-matter workspaces, documents, questions and citations

Revision ID: dossiers_0806
Revises: treatment_status_0806
Create Date: 2026-08-06 03:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "dossiers_0806"
down_revision = "treatment_status_0806"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dossiers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=True),
        sa.Column("client_name", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="cascade"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="restrict"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dossiers_organization_id"), "dossiers", ["organization_id"]
    )
    op.create_index(op.f("ix_dossiers_status"), "dossiers", ["status"])
    op.create_index(op.f("ix_dossiers_deleted_at"), "dossiers", ["deleted_at"])

    op.create_table(
        "dossier_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="cascade"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dossier_id", "user_id"),
    )
    op.create_index(
        op.f("ix_dossier_members_dossier_id"), "dossier_members", ["dossier_id"]
    )
    op.create_index(op.f("ix_dossier_members_user_id"), "dossier_members", ["user_id"])
    op.create_index(
        op.f("ix_dossier_members_deleted_at"), "dossier_members", ["deleted_at"]
    )

    op.create_table(
        "dossier_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("piece_number", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("extraction_status", sa.String(length=16), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="restrict"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dossier_id", "file_id"),
    )
    op.create_index(
        op.f("ix_dossier_documents_dossier_id"), "dossier_documents", ["dossier_id"]
    )
    op.create_index(
        op.f("ix_dossier_documents_file_id"), "dossier_documents", ["file_id"]
    )
    op.create_index(
        op.f("ix_dossier_documents_category"), "dossier_documents", ["category"]
    )
    op.create_index(
        op.f("ix_dossier_documents_extraction_status"),
        "dossier_documents",
        ["extraction_status"],
    )
    op.create_index(
        op.f("ix_dossier_documents_deleted_at"), "dossier_documents", ["deleted_at"]
    )

    op.create_table(
        "dossier_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("asked_by_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "versions_used", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("authority_label", sa.Text(), nullable=True),
        sa.Column("authority_count", sa.Integer(), nullable=True),
        sa.Column("answered_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="cascade"),
        sa.ForeignKeyConstraint(["asked_by_id"], ["users.id"], ondelete="restrict"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dossier_questions_dossier_id"), "dossier_questions", ["dossier_id"]
    )
    op.create_index(
        op.f("ix_dossier_questions_asked_by_id"), "dossier_questions", ["asked_by_id"]
    )
    op.create_index(op.f("ix_dossier_questions_status"), "dossier_questions", ["status"])
    op.create_index(
        op.f("ix_dossier_questions_deleted_at"), "dossier_questions", ["deleted_at"]
    )

    op.create_table(
        "dossier_citations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("nature", sa.String(length=8), nullable=False),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"], ["dossier_questions.id"], ondelete="cascade"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dossier_citations_question_id"), "dossier_citations", ["question_id"]
    )
    op.create_index(op.f("ix_dossier_citations_nature"), "dossier_citations", ["nature"])
    op.create_index(
        op.f("ix_dossier_citations_source_id"), "dossier_citations", ["source_id"]
    )
    op.create_index(
        op.f("ix_dossier_citations_deleted_at"), "dossier_citations", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_table("dossier_citations")
    op.drop_table("dossier_questions")
    op.drop_table("dossier_documents")
    op.drop_table("dossier_members")
    op.drop_table("dossiers")
