"""Add course_modules.is_bonus

A bonus section: its lessons render in the customer portal's "Bonus
Content" rail (own section at the bottom, like Trailers), sit outside the
course's lesson numbering, and don't count toward completion.

Revision ID: module_is_bonus_805
Revises: mc_architect_728
Create Date: 2026-08-05 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "module_is_bonus_805"
down_revision = "mc_architect_728"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course_modules",
        sa.Column(
            "is_bonus",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("course_modules", "is_bonus")
