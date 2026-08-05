"""Add email_subscriber_tags

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-05-07 12:00:00.000000

First-class tags for email subscribers — used by sequence has-tag branches,
add-tag/remove-tag actions, audience filters, and the upcoming Tag-added
trigger. Soft-delete aware.
"""

import sqlalchemy as sa
from alembic import op

revision = "v1w2x3y4z5a6"
down_revision = "u0v1w2x3y4z5"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_subscriber_tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.Column("tag", sa.String(length=80), nullable=False),
        sa.Column(
            "added_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
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
            ["subscriber_id"],
            ["email_subscribers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "subscriber_id",
            "tag",
            "deleted_at",
            name="email_subscriber_tags_subscriber_tag_key",
        ),
    )
    op.create_index(
        "ix_email_subscriber_tags_subscriber_id",
        "email_subscriber_tags",
        ["subscriber_id"],
    )
    op.create_index(
        "ix_email_subscriber_tags_tag",
        "email_subscriber_tags",
        ["tag"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_subscriber_tags_tag",
        table_name="email_subscriber_tags",
    )
    op.drop_index(
        "ix_email_subscriber_tags_subscriber_id",
        table_name="email_subscriber_tags",
    )
    op.drop_table("email_subscriber_tags")
