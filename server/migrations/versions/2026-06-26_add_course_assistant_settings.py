"""Add Course Assistant settings columns to courses

Revision ID: ca_settings_626
Revises: ca_questions_622
Create Date: 2026-06-26 00:00:00.000000

The Course Assistant v2 is stateless and configured by two columns on the
course itself (no snapshot, no approval state machine):

- ``assistant_enabled`` — master on/off, defaults ON for new and existing
  courses (server_default true).
- ``assistant_strictness`` — ``course_only`` or ``course_plus_general``
  (default), how far the TA may roam from the course material.

Both are non-null with server defaults so the backfill is automatic.

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "ca_settings_626"
down_revision = "ca_questions_622"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column(
            "assistant_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "courses",
        sa.Column(
            "assistant_strictness",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'course_plus_general'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("courses", "assistant_strictness")
    op.drop_column("courses", "assistant_enabled")
