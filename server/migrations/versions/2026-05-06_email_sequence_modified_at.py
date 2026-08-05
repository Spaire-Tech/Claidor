"""Rename email_sequence* updated_at columns to modified_at

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-05-06 00:00:00.000000

The original email_sequences migration created `updated_at` columns, but
`RecordModel` and the rest of Polar's models use `modified_at`. Queries
fail with UndefinedColumnError until this rename runs. The model also
treats the column as nullable with no server default, so we relax the
constraints to match.
"""

import sqlalchemy as sa
from alembic import op

revision = "t9u0v1w2x3y4"
down_revision = "s8t9u0v1w2x3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


_TABLES = (
    "email_sequences",
    "email_sequence_steps",
    "email_sequence_enrollments",
    "email_sequence_step_sends",
)


def upgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "updated_at",
            new_column_name="modified_at",
            nullable=True,
            server_default=None,
            existing_type=sa.TIMESTAMP(timezone=True),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "modified_at",
            new_column_name="updated_at",
            nullable=False,
            server_default=sa.text("now()"),
            existing_type=sa.TIMESTAMP(timezone=True),
        )
