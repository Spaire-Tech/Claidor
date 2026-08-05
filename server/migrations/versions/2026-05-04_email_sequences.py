"""Add email sequence tables (sequences, steps, enrollments, step sends)

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-05-04 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "p5q6r7s8t9u0"
down_revision = "o4p5q6r7s8t9"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # ── email_sequences ───────────────────────────────────────────────────────
    op.create_table(
        "email_sequences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=False, server_default="manual"),
        sa.Column(
            "trigger_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_sequences_organization_id",
        "email_sequences",
        ["organization_id"],
    )
    op.create_index(
        "ix_email_sequences_organization_id_status",
        "email_sequences",
        ["organization_id", "status"],
    )

    # ── email_sequence_steps ──────────────────────────────────────────────────
    op.create_table(
        "email_sequence_steps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sequence_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("delay_hours", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("sender_name", sa.String(100), nullable=False),
        sa.Column("sender_email", sa.String(255), nullable=True),
        sa.Column("reply_to_email", sa.String(255), nullable=True),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column(
            "content_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["sequence_id"],
            ["email_sequences.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_sequence_steps_sequence_id",
        "email_sequence_steps",
        ["sequence_id"],
    )

    # ── email_sequence_enrollments ────────────────────────────────────────────
    op.create_table(
        "email_sequence_enrollments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sequence_id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("current_step_position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "enrolled_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("next_step_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["sequence_id"],
            ["email_sequences.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subscriber_id"],
            ["email_subscribers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "sequence_id",
            "subscriber_id",
            "deleted_at",
            name="uq_enrollment_sequence_subscriber",
        ),
    )
    op.create_index(
        "ix_email_sequence_enrollments_status_next_step",
        "email_sequence_enrollments",
        ["status", "next_step_at"],
    )
    op.create_index(
        "ix_email_sequence_enrollments_sequence_id",
        "email_sequence_enrollments",
        ["sequence_id"],
    )

    # ── email_sequence_step_sends ─────────────────────────────────────────────
    op.create_table(
        "email_sequence_step_sends",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("step_id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.Column("resend_email_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("opened_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("open_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bounced_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["email_sequence_enrollments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["step_id"],
            ["email_sequence_steps.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subscriber_id"],
            ["email_subscribers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_sequence_step_sends_resend_email_id",
        "email_sequence_step_sends",
        ["resend_email_id"],
    )
    op.create_index(
        "ix_email_sequence_step_sends_enrollment_id",
        "email_sequence_step_sends",
        ["enrollment_id"],
    )


def downgrade() -> None:
    op.drop_table("email_sequence_step_sends")
    op.drop_table("email_sequence_enrollments")
    op.drop_table("email_sequence_steps")
    op.drop_table("email_sequences")
