"""Add email_subscriber_custom_fields

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-05-08 10:00:00.000000

Custom-field key/value pairs on email subscribers. Written by the
`update-field` sequence action and read by audience filters / branches as
those grow support for `custom_field`. Soft-delete aware so removing a
field keeps the audit trail.
"""

import sqlalchemy as sa
from alembic import op

revision = "x3y4z5a6b7c8"
down_revision = "w2x3y4z5a6b7"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_subscriber_custom_fields",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("value", sa.String(length=512), nullable=True),
        sa.Column(
            "set_at",
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
            "key",
            "deleted_at",
            name="email_subscriber_custom_fields_subscriber_key_key",
        ),
    )
    op.create_index(
        "ix_email_subscriber_custom_fields_subscriber_id",
        "email_subscriber_custom_fields",
        ["subscriber_id"],
    )
    op.create_index(
        "ix_email_subscriber_custom_fields_key",
        "email_subscriber_custom_fields",
        ["key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_subscriber_custom_fields_key",
        table_name="email_subscriber_custom_fields",
    )
    op.drop_index(
        "ix_email_subscriber_custom_fields_subscriber_id",
        table_name="email_subscriber_custom_fields",
    )
    op.drop_table("email_subscriber_custom_fields")
