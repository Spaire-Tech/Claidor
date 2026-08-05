"""Add A/B test config + per-send variant tracking for broadcasts

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-05-05 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "s8t9u0v1w2x3"
down_revision = "r7s8t9u0v1w2"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_broadcast_ab_tests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("broadcast_id", sa.Uuid(), nullable=False),
        sa.Column("subject_b", sa.String(255), nullable=False),
        sa.Column(
            "slice_pct", sa.Integer(), nullable=False, server_default=sa.text("20")
        ),
        sa.Column(
            "decide_after_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("240"),
        ),
        sa.Column(
            "winner_metric",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'open_rate'"),
        ),
        sa.Column("winner_variant", sa.String(1), nullable=True),
        sa.Column(
            "test_sent_at", sa.TIMESTAMP(timezone=True), nullable=True
        ),
        sa.Column(
            "winner_picked_at", sa.TIMESTAMP(timezone=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["broadcast_id"], ["email_broadcasts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "broadcast_id",
            "deleted_at",
            name="email_broadcast_ab_tests_broadcast_key",
        ),
    )
    op.create_index(
        "ix_email_broadcast_ab_tests_broadcast_id",
        "email_broadcast_ab_tests",
        ["broadcast_id"],
    )

    op.add_column(
        "email_broadcast_sends",
        sa.Column("variant", sa.String(1), nullable=True),
    )
    op.create_index(
        "ix_email_broadcast_sends_broadcast_variant",
        "email_broadcast_sends",
        ["broadcast_id", "variant"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_broadcast_sends_broadcast_variant",
        table_name="email_broadcast_sends",
    )
    op.drop_column("email_broadcast_sends", "variant")
    op.drop_index(
        "ix_email_broadcast_ab_tests_broadcast_id",
        table_name="email_broadcast_ab_tests",
    )
    op.drop_table("email_broadcast_ab_tests")
