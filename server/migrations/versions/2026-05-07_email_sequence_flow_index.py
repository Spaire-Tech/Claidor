"""Add flow_index to email_sequence_enrollments

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-05-07 00:00:00.000000

flow_index points into the sequence's authored flow_doc.steps array. The
older `current_step_position` counted only email steps; flow_index is the
true cursor for the new walker so we keep both columns and let the worker
choose which path to take depending on whether the parent sequence has a
flow_doc.
"""

import sqlalchemy as sa
from alembic import op

revision = "u0v1w2x3y4z5"
down_revision = "t9u0v1w2x3y4"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_sequence_enrollments",
        sa.Column("flow_index", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("email_sequence_enrollments", "flow_index")
